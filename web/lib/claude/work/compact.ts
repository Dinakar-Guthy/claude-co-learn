/**
 * History compaction for the work loop (design-plan §9.1): when the stored API history gets large, the older
 * turns are replaced by a summary and the recent turns are kept word for word.
 *
 * Uses the API's on-demand compaction (beta `compact-2026-09-04`, "compaction that keeps recent turns"): we
 * send the older messages with `compaction: {type: "summarize"}` and get back one signed `compaction` block,
 * which then goes first in history in place of those messages. We use it instead of our own Haiku summary
 * because the work model runs with thinking on and the history is append-only (preserved thinking): with a
 * client-written summary, the thinking blocks in the kept turns fail the history-editing check. The server's
 * block keeps them valid as long as the compaction request runs on the conversation's model with the same
 * `system` and `tools`, and the kept turns directly follow the summarized messages, unchanged, starting with a
 * different role. That's why this calls the work model, not `MODELS.compact`.
 *
 * Runs at the start of a turn, before the new user message, so it never cuts into an open tool round.
 * Any failure is logged and skipped: the turn continues with the full history.
 * The UI transcript is separate and is never compacted.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@/lib/claude/models";
import type { UsageLike } from "@/lib/platform/cost";
import type { Session } from "@/lib/contracts/session";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { isPausedAssistant } from "./blocks";
import type { WorkDeps } from "./deps";
import { describeError } from "./errors";
import { WORK_SYSTEM } from "./prompt";
import { sanitizeHistory, type ApiMessage } from "./state";
import { WORK_TOOLS } from "./tools";

export const COMPACTION_BETA = "compact-2026-09-04";
/** Compact once the stored history is estimated above this many tokens. */
export const COMPACT_AT_TOKENS = 40_000;
/** Test hook: COLEARN_COMPACT_AT_TOKENS lowers the threshold (e.g. to exercise compaction in a short live session). */
const compactAt = () => Number(process.env.COLEARN_COMPACT_AT_TOKENS) || COMPACT_AT_TOKENS;
const minSummarized = () => (process.env.COLEARN_COMPACT_AT_TOKENS ? 1_000 : MIN_SUMMARIZED_TOKENS);
/** Aim to keep about this many recent messages verbatim (the cut moves to the nearest clean boundary). */
export const KEEP_MESSAGES = 12;
/** Don't bother compacting unless the older part is at least this big (estimated tokens). */
export const MIN_SUMMARIZED_TOKENS = 8_000;
/** Caps the summarization call, thinking included (the docs ask for several thousand tokens). */
export const COMPACT_MAX_TOKENS = 12_000;

export type CompactionParams = MessageCreateParamsNonStreaming;

/** Replaces the server's default summarization prompt (must tell the model not to call tools). */
export const COMPACTION_INSTRUCTIONS = `Summarize the conversation so far. Your summary replaces these messages: the session will continue from it, followed by the most recent messages, so a later turn must be able to carry on the work from your summary alone.

This is a Co-learn session: a learner and Claude do real data / ML work together in a code-execution sandbox, with short learning moments along the way. Keep, concretely:
- The learner's goal, their familiarity, and any constraints or preferences they stated.
- Work done so far, in order, with the key numbers and results (dataset shape, class balance, metrics, notable findings, errors hit and how they were fixed).
- Decisions the learner made (and their reasoning), and choices Claude made on their behalf.
- The sandbox state: files on disk (exact paths and what they hold), saved models and charts, and how to rebuild anything that only lived in memory.
- Learning moments asked (type, concept, the question in brief) and how the learner did; predictions and how they compared with the real result; milestones and boss challenges reached.
- Open threads and the next planned step.

Use short bullet points under headings. Quote exact names, paths, column names, and numbers. Do not invent anything. Do not call any tools; respond with the summary text only.`;

type Block = { type: string; id?: unknown; tool_use_id?: unknown };

const blocksOf = (m: ApiMessage): Block[] => (typeof m.content === "string" ? [] : (m.content as Block[]));

const isCompactionMessage = (m: ApiMessage | undefined) => !!m && blocksOf(m).some((b) => b.type === "compaction");

/** True if the history carries a compaction block (requests must then send the compaction beta). */
export function hasCompactionBlock(messages: readonly ApiMessage[]): boolean {
  return messages.some(isCompactionMessage);
}

/** Opaque fields that are large on the wire but aren't model-visible text. */
const OPAQUE_KEYS = new Set(["signature", "encrypted_content", "data"]);

/** Cheap token estimate (~4 characters per token), ignoring signatures and other opaque payloads. */
export function estimateTokens(messages: readonly ApiMessage[]): number {
  const json = JSON.stringify(messages, (key, value) => (OPAQUE_KEYS.has(key) ? undefined : value));
  return Math.ceil(json.length / 4);
}

/** Ids that tie a call to its result: tool_use / server_tool_use ids and the results' tool_use_id. */
function pairIds(m: ApiMessage): string[] {
  return blocksOf(m).flatMap((b) => {
    if (b.type.endsWith("tool_use") && typeof b.id === "string") return [b.id];
    if (b.type.endsWith("tool_result") && typeof b.tool_use_id === "string") return [b.tool_use_id];
    return [];
  });
}

/** For each tool call id, the first and last message index it appears in. */
function pairSpans(messages: readonly ApiMessage[]): [number, number][] {
  const spans = new Map<string, [number, number]>();
  messages.forEach((m, i) => {
    for (const id of pairIds(m)) {
      const span = spans.get(id);
      if (span) span[1] = i;
      else spans.set(id, [i, i]);
    }
  });
  return [...spans.values()];
}

/**
 * Whether the kept tail may start at `k`: `messages[k]` is a user message of the learner's or app's own (text,
 * no tool results) and `messages[k - 1]` is a finished assistant turn (no client tool call, not paused).
 * The roles differ, so the API won't merge the first kept message into the summary's last one.
 */
export function isCleanBoundary(messages: readonly ApiMessage[], k: number): boolean {
  const m = messages[k];
  const prev = messages[k - 1];
  if (!m || !prev || m.role !== "user" || prev.role !== "assistant") return false;
  if (isCompactionMessage(prev)) return false;
  const blocks = blocksOf(m);
  const ownTurn = typeof m.content === "string" ? m.content.trim() !== "" : blocks.some((b) => b.type === "text") && !blocks.some((b) => b.type === "tool_result");
  if (!ownTurn) return false;
  return !isPausedAssistant(prev) && !blocksOf(prev).some((b) => b.type === "tool_use");
}

/**
 * Index where the kept tail starts: the clean boundary closest to keeping `keep` messages (keeping more
 * is preferred; fewer only if nothing earlier qualifies). No tool call may be split from its result.
 * Null if there is no usable cut.
 */
export function findCut(messages: readonly ApiMessage[], keep = KEEP_MESSAGES): number | null {
  const spans = pairSpans(messages);
  const candidates: number[] = [];
  for (let k = 1; k < messages.length; k++) {
    if (!isCleanBoundary(messages, k)) continue;
    if (spans.some(([first, last]) => first < k && k <= last)) continue;
    candidates.push(k);
  }
  const target = messages.length - keep;
  return candidates.findLast((k) => k <= target) ?? candidates.find((k) => k > target) ?? null;
}

export interface CompactionPlan {
  older: ApiMessage[];
  kept: ApiMessage[];
}

/** What to compact, or null when the history is small enough or can't be cut cleanly. */
export function planCompaction(messages: readonly ApiMessage[]): CompactionPlan | null {
  if (estimateTokens(messages) <= compactAt()) return null;
  const k = findCut(messages);
  if (k === null) return null;
  const older = messages.slice(0, k);
  if (estimateTokens(older) < minSummarized()) return null;
  return { older, kept: messages.slice(k) };
}

/**
 * The summarization request. Model, effort, `system`, and `tools` match the work loop's (`buildParams`): the
 * kept turns' thinking stays valid only if `system` and `tools` are unchanged, and the shared prefix can be
 * read from the prompt cache.
 */
export function buildCompactionParams(older: ApiMessage[], containerId: string | undefined): CompactionParams {
  const route = MODELS.work;
  return {
    model: route.model,
    max_tokens: COMPACT_MAX_TOKENS,
    output_config: { effort: route.effort },
    system: WORK_SYSTEM,
    tools: WORK_TOOLS,
    messages: older,
    cache_control: { type: "ephemeral" },
    ...(containerId ? { container: containerId } : {}),
    betas: [COMPACTION_BETA],
    compaction: { type: "summarize", instructions: COMPACTION_INSTRUCTIONS },
  };
}

/** Billable usage of a compaction response: the top-level counts are zero; the call is in `usage.iterations`. */
export function compactionUsage(usage: Anthropic.Beta.BetaUsage): UsageLike {
  const iterations = usage.iterations ?? [];
  if (!iterations.length) return usage;
  const sum = (f: (i: (typeof iterations)[number]) => number | null | undefined) => iterations.reduce((n, i) => n + (f(i) ?? 0), 0);
  return {
    input_tokens: sum((i) => i.input_tokens),
    output_tokens: sum((i) => i.output_tokens),
    cache_read_input_tokens: sum((i) => i.cache_read_input_tokens),
    cache_creation_input_tokens: sum((i) => i.cache_creation_input_tokens),
  };
}

export interface CompactInput {
  deps: Pick<WorkDeps, "store" | "compact" | "recordUsage">;
  session: Session;
  anonId: string;
  ip: string;
  history: ApiMessage[];
  signal: AbortSignal;
}

/**
 * Compacts the stored history if it's large: returns the history to use for this turn (and persists it, plus
 * `session.rollingSummary`). Returns `history` unchanged when there's nothing to do or anything fails.
 */
export async function maybeCompact({ deps, session, anonId, ip, history, signal }: CompactInput): Promise<ApiMessage[]> {
  let plan: CompactionPlan | null;
  let block: Anthropic.Beta.BetaCompactionBlock;
  try {
    plan = planCompaction(sanitizeHistory(history).messages);
    if (!plan) return history;
    const response = await deps.compact(buildCompactionParams(plan.older, session.containerId), signal);
    await deps.recordUsage(anonId, ip, response.model, compactionUsage(response.usage)).catch((e) => console.error("compaction usage not recorded:", describeError(e)));
    const found = response.content.find((b): b is Anthropic.Beta.BetaCompactionBlock => b.type === "compaction");
    if (response.stop_reason !== "compaction" || !found?.content) {
      console.warn(`history compaction skipped: no summary (stop_reason ${response.stop_reason})`);
      return history;
    }
    block = found;
  } catch (err) {
    console.error("history compaction failed, continuing with the full history:", describeError(err));
    return history;
  }

  // The block goes first, as an assistant message of its own, exactly as returned; the kept tail follows unchanged.
  const next: ApiMessage[] = [{ role: "assistant", content: [block as Anthropic.Beta.BetaCompactionBlockParam] }, ...plan.kept];
  try {
    await deps.store.putApiMessages(session.id, next);
  } catch (err) {
    console.error("compacted history not saved, continuing with the full history:", describeError(err));
    return history;
  }
  session.rollingSummary = block.content ?? undefined;
  try {
    const latest = (await deps.store.getSession(session.id)) ?? session;
    await deps.store.putSession({ ...latest, rollingSummary: session.rollingSummary });
  } catch (err) {
    console.error("rolling summary not saved:", describeError(err));
  }
  console.info(`history compacted: ${plan.older.length} messages summarized, ${plan.kept.length} kept`);
  return next;
}
