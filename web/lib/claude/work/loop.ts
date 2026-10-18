/**
 * The work turn (design-plan §5): a manual streaming tool loop on the native SDK.
 * Code execution runs server-side; our function tools run here. A shown learning moment or a due boss ends
 * the turn; skipped moments return a tool_result and the loop keeps going within the same turn.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@/lib/claude/models";
import { recordSkipped } from "@/lib/engine";
import type { TurnEndReason } from "@/lib/contracts/stream";
import { COMPACTION_BETA, hasCompactionBlock, maybeCompact } from "./compact";
import type { ModelParams, WorkDeps } from "./deps";
import { demoDataNote, renderContext } from "./context";
import { describeError, isAbort, isContainerError, REFUSAL_ERROR, toErrorEvent } from "./errors";
import { handleTool, ToolContext, type PauseReason, type ToolOutcome } from "./handlers";
import type { TurnPlan } from "./prepare";
import { WORK_SYSTEM } from "./prompt";
import { TurnState, type ApiMessage } from "./state";
import { consumeStream, type Emit } from "./stream";
import { WORK_TOOLS } from "./tools";
import { BOSS_DECLINED_TEXT, CONTAINER_RESET_NOTE, skippedPendingNote } from "./userText";

/** Model requests per user turn (pause_turn re-sends included). */
export const MAX_STEPS = 8;

export const NOT_RUN = "(not run)";

const CUT_OFF_TOOL_RESULT = "Your response hit the output limit, so this tool call was cut off and not run. Call it again with a shorter input.";

export function buildParams(messages: ApiMessage[], containerId: string | undefined): ModelParams {
  const route = MODELS.work;
  return {
    model: route.model,
    max_tokens: route.maxTokens,
    output_config: { effort: route.effort },
    system: WORK_SYSTEM,
    tools: WORK_TOOLS,
    messages,
    // Top-level breakpoint: caches the growing conversation prefix across loop steps and turns.
    cache_control: { type: "ephemeral" },
    ...(containerId ? { container: containerId } : {}),
    // Every request that carries a compaction block must send the compaction beta.
    betas: ["server-side-fallback-2026-07-01", ...(hasCompactionBlock(messages) ? [COMPACTION_BETA] : [])],
    fallbacks: "default",
  };
}

export async function runTurn(deps: WorkDeps, plan: TurnPlan, emit: Emit, signal: AbortSignal): Promise<void> {
  const { store } = deps;
  const { anonId, ip, session, user } = plan;
  emit({ type: "status", status: "thinking" });

  const limits = await deps.checkLimits(anonId, ip);
  if (!limits.ok) {
    emit({ type: "error", message: limits.message, retryable: limits.code === "rate_limited", code: limits.code });
    emit({ type: "turn_end", reason: "error", detail: limits.code });
    return;
  }
  // Fail-open: the limits machinery is degraded, so the turn proceeds with a heads-up (not persisted).
  if (limits.warning) emit({ type: "notice", itemId: `notice-limits-${deps.now()}`, text: limits.warning });

  // Large histories are summarized first (never fails the turn; falls back to the full history).
  const history = await maybeCompact({ deps, session, anonId, ip, history: await store.getApiMessages(session.id), signal });
  const state = new TurnState(store, session, history);
  const ctx = new ToolContext(deps, state, user);

  const flush = () => {
    for (const event of ctx.outbox.splice(0)) emit(event);
  };
  const end = async (reason: TurnEndReason) => {
    // Persist before the browser hears about a moment or boss: the grade/boss routes read this state next.
    await state.persist();
    flush();
    emit({ type: "turn_end", reason });
  };

  try {
    const prefix = joinNotes(await settleBossOffer(ctx, plan), await settlePendingMoment(ctx, plan));
    session.engine = deps.engine.recordWorkTurn(session.engine);
    state.markDirty();
    if (plan.modelText !== null) await addUserTurn(ctx, plan, prefix);

    let resetTried = false;
    for (let step = 0; ; ) {
      if (step >= MAX_STEPS) return await end("max_steps");
      step++;

      let started = false;
      let message: Anthropic.Beta.BetaMessage;
      try {
        const stream = deps.startStream(buildParams(state.messages(), session.containerId), signal);
        message = await consumeStream(stream, emit, () => (started = true));
      } catch (err) {
        if (started || resetTried || !session.containerId || !isContainerError(err)) throw err;
        resetTried = true;
        step--;
        resetContainer(ctx);
        emit({ type: "notice", itemId: `notice:${deps.newId()}`, text: "The coding environment was reset; reloading data." });
        continue;
      }

      await deps.recordUsage(anonId, ip, message.model, message.usage);
      if (message.container?.id) session.containerId = message.container.id;

      if (message.stop_reason === "refusal") {
        // Nothing from a refused response is kept; earlier committed steps stay.
        emit(REFUSAL_ERROR);
        return await end("refusal");
      }

      // A code call streamed in a response that stopped for our tool never runs; close its block in the UI.
      for (const itemId of state.appendAssistant(message)) emit({ type: "code_result", itemId, stdout: NOT_RUN, stderr: "", returnCode: 0, fileIds: [] });
      if (message.stop_reason === "pause_turn") {
        state.commit();
        continue;
      }

      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) {
        state.commit();
        return await end("end_turn");
      }

      const pause = await runTools(ctx, toolUses, message.stop_reason === "max_tokens");
      state.commit();
      if (pause) return await end(pause);
      flush();
    }
  } catch (err) {
    if (signal.aborted || isAbort(err)) return;
    console.error("work turn failed:", describeError(err));
    await ctx.log("error", { where: "chat", error: describeError(err).slice(0, 200) }).catch(() => {});
    // Save committed progress before the client can retry.
    await persistQuietly(state);
    emit(toErrorEvent(err));
    emit({ type: "turn_end", reason: "error" });
  } finally {
    await persistQuietly(state);
  }
}

async function persistQuietly(state: TurnState): Promise<void> {
  if (!state.dirty) return;
  await state.persist().catch((e) => console.error("persist failed:", describeError(e)));
}

/** Runs every tool call of one response and appends all results in a single user message. */
async function runTools(ctx: ToolContext, toolUses: Anthropic.Beta.BetaToolUseBlock[], cutOff: boolean): Promise<PauseReason | undefined> {
  let pause: PauseReason | undefined;
  const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
  for (const block of toolUses) {
    const outcome: ToolOutcome = cutOff ? { content: CUT_OFF_TOOL_RESULT, isError: true } : await handleTool(ctx, block);
    results.push({ type: "tool_result", tool_use_id: block.id, content: outcome.content, ...(outcome.isError ? { is_error: true } : {}) });
    pause ??= outcome.pause;
  }
  ctx.state.push({ role: "user", content: results });
  return pause;
}

const joinNotes = (...notes: (string | null)[]) => notes.filter(Boolean).join("\n\n") || null;

/**
 * Clears an open boss offer: "Keep working" (boss_declined) or simply carrying on with a new message both count
 * as declining for now. The boss is offered again at the next milestone (Dinakar, 2026-10-18).
 */
async function settleBossOffer(ctx: ToolContext, plan: TurnPlan): Promise<string | null> {
  const { session } = ctx.state;
  if (!session.engine.bossOfferPending) return null;
  session.engine = { ...session.engine, bossOfferPending: false };
  ctx.state.markDirty();
  await ctx.log("boss_declined", { via: plan.request.kind });
  return plan.request.kind === "boss_declined" ? null : BOSS_DECLINED_TEXT;
}

/** Clears a pending moment the learner moved past; returns a note for Claude if it was skipped. */
async function settlePendingMoment(ctx: ToolContext, plan: TurnPlan): Promise<string | null> {
  const { session } = ctx.state;
  const pendingId = session.engine.pendingMomentId;
  if (!pendingId) return null;
  session.engine = recordSkipped(session.engine, pendingId);
  ctx.state.markDirty();
  if (plan.request.kind === "moment_response" && plan.request.momentId === pendingId) return null;

  const moment = await ctx.deps.store.getMoment(session.id, pendingId);
  if (moment?.status !== "awaiting_answer") return null;
  await ctx.deps.store.putMoment({ ...moment, status: "skipped" });
  await ctx.log("moment_skipped", { momentId: moment.id, via: plan.request.kind });
  return skippedPendingNote(moment);
}

async function addUserTurn(ctx: ToolContext, plan: TurnPlan, prefix: string | null): Promise<void> {
  const { deps, state } = ctx;
  const { session } = state;
  const now = deps.now();
  const text = prefix ? `${prefix}\n\n${plan.modelText}` : plan.modelText!;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text }];
  const notes: string[] = [];

  if (session.intent.demo && !session.demoFileAttached) {
    if (deps.demoFileId) content.push({ type: "container_upload", file_id: deps.demoFileId });
    notes.push(demoDataNote(!!deps.demoFileId));
    state.whenCommitted(() => (session.demoFileAttached = true));
  }
  state.push({ role: "user", content });
  if (plan.userText !== undefined) state.stage({ kind: "user", id: `user:${deps.newId()}`, text: plan.userText, at: now });

  const summary = deps.engine.summarize(await ctx.gateContext(now));
  state.push({ role: "system", content: renderContext({ session, summary, now, notes }) });
}

/** Drops an expired container and tells Claude (in the not-yet-accepted user turn) to reload its data. */
function resetContainer(ctx: ToolContext): void {
  const { deps, state } = ctx;
  const { session } = state;
  session.containerId = undefined;
  const message = state.uncommittedUserMessage();
  if (!message || typeof message.content === "string") return;
  message.content.push({ type: "text", text: CONTAINER_RESET_NOTE });
  const hasUpload = message.content.some((b) => b.type === "container_upload");
  if (session.intent.demo && deps.demoFileId && !hasUpload) {
    message.content.push({ type: "container_upload", file_id: deps.demoFileId });
  }
}
