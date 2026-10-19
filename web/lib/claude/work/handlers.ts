/**
 * Handlers for our function tools (design-plan §5.2). Each returns the tool_result content and, when the
 * turn must pause, the reason. Browser events go to the outbox, which the loop flushes after persisting.
 */
import { thetaOf } from "@/lib/engine/mastery";
import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import {
  LearningMomentInputSchema,
  MilestoneInputSchema,
  ResolvePredictionInputSchema,
  SetLearningPathInputSchema,
  TeachInputSchema,
  type LearningMomentInput,
} from "@/lib/contracts/moment";
import type { GateContext, GateDecision, MasteryMap } from "@/lib/contracts/engine";
import type { AppEvent, LearningPath, MomentRecord, PathPart, User } from "@/lib/contracts/session";
import type { ChatStreamEvent, XpAward } from "@/lib/contracts/stream";
import { scoreFor } from "@/lib/engine";
import { toMomentView } from "@/lib/views";
import { modeOf } from "@/lib/modes";
import type { WorkDeps } from "./deps";
import { sessionEndsAt } from "./context";
import type { TurnState } from "./state";
import { LEARNING_MOMENT, MILESTONE_REACHED, RESOLVE_PREDICTION, SET_LEARNING_PATH, TEACH } from "./tools";
import { isWebUrl, normUrl, searchResultUrls } from "@/lib/sources";

export type PauseReason = "awaiting_learner" | "boss_due";

/** Learn mode: shortest visible lesson text (or predict setup) a question may follow. */
export const MIN_LESSON_CHARS = 200;
export const TEACH_FIRST =
  "Not shown: this response had no lesson before the question, and the learner doesn't see text written between tool calls. Call teach with the lesson (about 120 words, citing your search), then ask again.";

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  pause?: PauseReason;
}

export class ToolContext {
  readonly outbox: ChatStreamEvent[] = [];
  /** Characters of visible text Claude wrote in the response whose tools are being handled (set by the loop). */
  responseTextChars = 0;
  /** Learn mode: a lesson was shown (via `teach`) in the response whose tools are being handled. */
  taught = false;
  private mastery?: MasteryMap;
  readonly deps: WorkDeps;
  readonly state: TurnState;
  readonly user: User;

  constructor(deps: WorkDeps, state: TurnState, user: User) {
    this.deps = deps;
    this.state = state;
    this.user = user;
  }

  get anonId() {
    return this.state.session.anonId;
  }

  async gateContext(now: number): Promise<GateContext> {
    this.mastery ??= await this.deps.store.getMastery(this.anonId);
    return {
      state: this.state.session.engine,
      mastery: this.mastery,
      settings: this.user.settings,
      familiarity: this.state.session.intent.familiarity,
      now,
      mode: modeOf(this.state.session.intent),
    };
  }

  log(name: AppEvent["name"], props?: AppEvent["props"]): Promise<void> {
    return this.deps.store.logEvent({ at: this.deps.now(), anonId: this.anonId, sessionId: this.state.session.id, name, props });
  }
}

const json = (value: unknown) => JSON.stringify(value);

function invalid(error: z.ZodError): ToolOutcome {
  const issues = error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "input"}: ${i.message}`);
  return { content: `Invalid input. Fix these and call the tool again: ${issues.join("; ")}`, isError: true };
}

export async function handleTool(ctx: ToolContext, block: Anthropic.Beta.BetaToolUseBlock): Promise<ToolOutcome> {
  switch (block.name) {
    case LEARNING_MOMENT:
      return learningMoment(ctx, block);
    case RESOLVE_PREDICTION:
      return resolvePrediction(ctx, block);
    case MILESTONE_REACHED:
      return milestone(ctx, block);
    case SET_LEARNING_PATH:
      return setLearningPath(ctx, block);
    case TEACH:
      return teach(ctx, block);
    default:
      return { content: `Unknown tool: ${block.name}`, isError: true };
  }
}

async function verified(ctx: ToolContext, candidate: LearningMomentInput): Promise<boolean> {
  try {
    return (await ctx.deps.content.verifyMoment({ candidate })).ok;
  } catch (err) {
    // Fail closed (P9): an unverifiable moment is skipped and the work simply continues.
    console.error("verifyMoment failed", err instanceof Error ? err.message : err);
    return false;
  }
}

async function learningMoment(ctx: ToolContext, block: Anthropic.Beta.BetaToolUseBlock): Promise<ToolOutcome> {
  const parsed = LearningMomentInputSchema.safeParse(block.input);
  if (!parsed.success) return invalid(parsed.error);
  const candidate = parsed.data;
  const { deps, state } = ctx;
  // Learn mode: the learner only sees Claude's text, so a question needs the lesson written before it.
  if (modeOf(state.session.intent) === "learn" && !ctx.taught && ctx.responseTextChars < MIN_LESSON_CHARS) {
    return { content: json({ status: "skip", reason: "teach_first", instruction: TEACH_FIRST }) };
  }
  const now = deps.now();
  const moment: MomentRecord = {
    id: deps.newId(),
    sessionId: state.session.id,
    createdAt: now,
    type: candidate.type,
    candidate,
    toolUseId: block.id,
    status: "awaiting_answer",
    mcOffered: false,
  };

  await ctx.log("moment_proposed", { momentId: moment.id, type: candidate.type, concept: candidate.concept, value: candidate.learning_value, difficulty: candidate.difficulty });
  let decision: GateDecision = deps.engine.gate(candidate, await ctx.gateContext(now));
  if (decision.action === "show" && !(await verified(ctx, candidate))) decision = { action: "skip", reason: "unverified" };
  await ctx.log("moment_gated", { momentId: moment.id, action: decision.action, reason: decision.action === "show" ? null : decision.reason });

  if (decision.action === "defer") {
    await deps.store.putMoment({ ...moment, status: "deferred" });
    await ctx.log("moment_deferred", { momentId: moment.id });
    return { content: json({ status: "skip", reason: decision.reason }) };
  }
  if (decision.action === "skip") return { content: json({ status: "skip", reason: decision.reason }) };

  await deps.store.putMoment(moment);
  state.session.engine = deps.engine.recordShown(state.session.engine, moment.id, now);
  const itemId = `moment:${moment.id}`;
  state.addItem({ kind: "moment", id: itemId, momentId: moment.id });
  ctx.outbox.push({ type: "moment", itemId, moment: toMomentView(moment) });
  await ctx.log("moment_shown", { momentId: moment.id, type: candidate.type, concept: candidate.concept });
  return { content: json({ status: "awaiting_learner", moment_id: moment.id }), pause: "awaiting_learner" };
}

/** Adds XP to the stored user (re-read to avoid clobbering concurrent updates) and returns the award. */
export async function awardXp(ctx: ToolContext, amount: number, reason: string): Promise<XpAward> {
  const { store, engine } = ctx.deps;
  const user = (await store.getUser(ctx.anonId)) ?? ctx.user;
  const before = engine.levelFor(user.xp);
  user.xp += amount;
  const after = engine.levelFor(user.xp);
  user.level = after.level;
  const award: XpAward = { amount, reason, level: after };
  if (after.level > before.level) {
    const rewards = engine.rewardsBetween(before.level, after.level);
    for (const r of rewards) {
      const list = r.kind === "theme" ? user.unlocks.themes : user.unlocks.soundPacks;
      if (!list.includes(r.id)) list.push(r.id);
    }
    award.levelUp = { from: before.level, to: after.level, rewards };
    await ctx.log("level_up", { from: before.level, to: after.level });
  }
  await store.putUser(user);
  return award;
}

async function resolvePrediction(ctx: ToolContext, block: Anthropic.Beta.BetaToolUseBlock): Promise<ToolOutcome> {
  const parsed = ResolvePredictionInputSchema.safeParse(block.input);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const { deps, state } = ctx;
  const moment = await deps.store.getMoment(state.session.id, input.moment_id);
  if (!moment || moment.status !== "awaiting_prediction_result") {
    return { content: `No prediction is waiting for a result with moment_id "${input.moment_id}". Don't call resolve_prediction for it again.`, isError: true };
  }
  const now = deps.now();
  // Help used before predicting reduces the credit, as for any answer (decision log 2026-10-18).
  const help = moment.help?.level;
  const xp = deps.engine.xpFor({ kind: "prediction", verdict: input.verdict, help });
  const award = await awardXp(ctx, xp, `Prediction: ${input.verdict}${help ? ` (with ${help === "hint" ? "a hint" : "help"})` : ""}`);

  const concept = moment.candidate.concept;
  const score = scoreFor(input.verdict, false, help);
  const gate = await ctx.gateContext(now);
  const familiarity = state.session.intent.familiarity;
  const mastery = deps.engine.updateMastery(gate.mastery[concept], score, moment.candidate.difficulty, familiarity, now);
  const masteryDelta = mastery.theta - thetaOf(gate.mastery[concept], familiarity);
  await deps.store.putMoment({ ...moment, status: "answered", verdict: input.verdict, why: input.why, xp, answeredAt: now, masteryDelta });
  gate.mastery[concept] = mastery;
  await deps.store.putMastery(ctx.anonId, concept, mastery);
  state.session.engine = deps.engine.recordOutcome(state.session.engine, { momentId: moment.id, concept, type: moment.type, score, at: now });
  await ctx.log("moment_answered", { momentId: moment.id, type: moment.type, concept, verdict: input.verdict, xp, score, help: help ?? null });

  const itemId = `prediction:${moment.id}`;
  state.addItem({ kind: "prediction_reveal", id: itemId, momentId: moment.id, actualResult: input.actual_result, verdict: input.verdict, why: input.why, xp });
  ctx.outbox.push({ type: "prediction_reveal", itemId, momentId: moment.id, actualResult: input.actual_result, verdict: input.verdict, why: input.why, xp: award });
  return { content: "recorded" };
}

/** Claude sometimes adds a placeholder milestone (label "x") alongside a learning moment; those aren't shown. */
export const PLACEHOLDER_MILESTONE_RESULT =
  "Ignored, nothing was shown: call milestone_reached only when a meaningful chunk of work has just completed, with a real label and summary.";

export const BOSS_INSTRUCTION =
  "Stop here and wait: the learner is offered a short boss challenge and chooses whether to take it on. Don't continue the work until you're told what they chose (and the result, if they played).";

async function milestone(ctx: ToolContext, block: Anthropic.Beta.BetaToolUseBlock): Promise<ToolOutcome> {
  const parsed = MilestoneInputSchema.safeParse(block.input);
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.label.trim().length < 3) return { content: PLACEHOLDER_MILESTONE_RESULT };
  const { deps, state } = ctx;
  const engineState = state.session.engine;
  const next = state.session.path ? advancePath(ctx, state.session.path) : undefined;
  // A moment shown in the same response takes priority; the boss can come at a later milestone.
  const bossesOn = ctx.user.settings.bosses !== false;
  const bossDue = bossesOn && !engineState.pendingMomentId && deps.engine.bossDue(engineState, deps.now(), sessionEndsAt(state.session));
  if (bossDue) {
    // The learner gets a "Take it on / Keep working" offer first; it survives reloads.
    state.session.engine = { ...state.session.engine, bossOfferPending: true };
    state.markDirty();
    await ctx.log("boss_offered", { concepts: state.session.engine.conceptsSinceBoss.length });
  }
  state.addItem({ kind: "milestone", id: block.id, label: parsed.data.label });
  ctx.outbox.push({ type: "milestone", itemId: block.id, label: parsed.data.label, bossDue });
  const pathNote =
    next === undefined
      ? {}
      : next === null
        ? { next_part: "none: every part is done", instruction: "Recap the topic in a few lines and suggest where to go next; the learner can wrap up." }
        : { next_part: next, ...(bossDue ? {} : { instruction: "Go straight on to this part in this response: search, teach its first chunk, then ask. Don't stop to announce it." }) };
  return bossDue
    ? { content: json({ boss_due: true, instruction: BOSS_INSTRUCTION, ...pathNote }), pause: "boss_due" }
    : { content: json({ boss_due: false, ...pathNote }) };
}

/** Learn mode: marks the current part done and makes the next unfinished part current. Returns its title (null: all done). */
function advancePath(ctx: ToolContext, path: LearningPath): string | null {
  const parts = path.parts.map((p): PathPart => (p.status === "current" ? { ...p, status: "done" } : p));
  const at = parts.findIndex((p) => p.status === "todo");
  if (at !== -1) parts[at] = { ...parts[at], status: "current" };
  const next = { ...path, parts };
  ctx.state.setPath(next);
  ctx.outbox.push({ type: "path", path: next });
  return at === -1 ? null : parts[at].title;
}

/**
 * Learn mode: shows a lesson chunk verbatim as Claude's message (text written between tool calls comes back hidden,
 * so lessons go through this tool). Sources are kept only if their URL came back from a web search in the session.
 */
function teach(ctx: ToolContext, block: Anthropic.Beta.BetaToolUseBlock): ToolOutcome {
  const parsed = TeachInputSchema.safeParse(block.input);
  if (!parsed.success) return invalid(parsed.error);
  const lesson = parsed.data.lesson.trim();
  if (!lesson) return { content: "Invalid input: the lesson is empty.", isError: true };
  const found = new Set(ctx.state.messages().flatMap((m) => (m.role === "assistant" && Array.isArray(m.content) ? searchResultUrls(m.content) : [])).map(normUrl));
  const sources = parsed.data.sources
    .filter((s) => isWebUrl(s.url) && found.has(normUrl(s.url)))
    .map((s) => ({ url: s.url.trim(), title: s.title.trim() || s.url.trim() }));
  const itemId = `lesson:${block.id}`;
  ctx.state.addItem({ kind: "assistant_text", id: itemId, text: lesson, ...(sources.length ? { sources } : {}) });
  ctx.outbox.push({ type: "text_delta", itemId, text: lesson });
  if (sources.length) ctx.outbox.push({ type: "sources", itemId, sources });
  ctx.taught = true;
  const dropped = parsed.data.sources.length - sources.length;
  return { content: json({ status: "shown", ...(dropped ? { note: `${dropped} source(s) dropped: only URLs from your search results can be cited.` } : {}) }) };
}

/** Learn mode: the tutor's plan (first response), or a revision that keeps finished parts (matched by title) done. */
async function setLearningPath(ctx: ToolContext, block: Anthropic.Beta.BetaToolUseBlock): Promise<ToolOutcome> {
  const parsed = SetLearningPathInputSchema.safeParse(block.input);
  if (!parsed.success) return invalid(parsed.error);
  const titles = parsed.data.parts.map((p) => p.title.trim()).filter(Boolean);
  if (!titles.length || !parsed.data.topic.trim()) return { content: "Invalid input: give a topic and at least one part.", isError: true };
  const done = new Set((ctx.state.session.path?.parts ?? []).filter((p) => p.status === "done").map((p) => p.title.toLowerCase()));
  const parts = parsed.data.parts
    .filter((p) => p.title.trim())
    .map((p): PathPart => ({ title: p.title.trim(), summary: p.summary.trim(), status: done.has(p.title.trim().toLowerCase()) ? "done" : "todo" }));
  const first = parts.findIndex((p) => p.status === "todo");
  if (first !== -1) parts[first] = { ...parts[first], status: "current" };
  const topic = parsed.data.topic.trim();
  const path: LearningPath = { topic, parts };
  ctx.state.setPath(path, topic.length <= 40 ? topic : `${topic.slice(0, 39).trimEnd()}…`);
  ctx.outbox.push({ type: "path", path });
  return { content: json({ status: "ok", current_part: first === -1 ? null : parts[first].title }) };
}
