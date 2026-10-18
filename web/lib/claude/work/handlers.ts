/**
 * Handlers for our function tools (design-plan §5.2). Each returns the tool_result content and, when the
 * turn must pause, the reason. Browser events go to the outbox, which the loop flushes after persisting.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import {
  LearningMomentInputSchema,
  MilestoneInputSchema,
  ResolvePredictionInputSchema,
  type LearningMomentInput,
} from "@/lib/contracts/moment";
import type { GateContext, GateDecision, MasteryMap } from "@/lib/contracts/engine";
import type { AppEvent, MomentRecord, User } from "@/lib/contracts/session";
import type { ChatStreamEvent, XpAward } from "@/lib/contracts/stream";
import { scoreFor } from "@/lib/engine";
import { toMomentView } from "@/lib/views";
import type { WorkDeps } from "./deps";
import { sessionEndsAt } from "./context";
import type { TurnState } from "./state";
import { LEARNING_MOMENT, MILESTONE_REACHED, RESOLVE_PREDICTION } from "./tools";

export type PauseReason = "awaiting_learner" | "boss_due";

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  pause?: PauseReason;
}

export class ToolContext {
  readonly outbox: ChatStreamEvent[] = [];
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
  const xp = deps.engine.xpFor({ kind: "prediction", verdict: input.verdict });
  const award = await awardXp(ctx, xp, `Prediction: ${input.verdict}`);
  await deps.store.putMoment({ ...moment, status: "answered", verdict: input.verdict, why: input.why, xp, answeredAt: now });

  const concept = moment.candidate.concept;
  const score = scoreFor(input.verdict, false);
  const gate = await ctx.gateContext(now);
  const mastery = deps.engine.updateMastery(gate.mastery[concept], score, moment.candidate.difficulty, state.session.intent.familiarity, now);
  gate.mastery[concept] = mastery;
  await deps.store.putMastery(ctx.anonId, concept, mastery);
  state.session.engine = deps.engine.recordOutcome(state.session.engine, { momentId: moment.id, concept, type: moment.type, score, at: now });
  await ctx.log("moment_answered", { momentId: moment.id, type: moment.type, concept, verdict: input.verdict, xp });

  const itemId = `prediction:${moment.id}`;
  state.addItem({ kind: "prediction_reveal", id: itemId, momentId: moment.id, actualResult: input.actual_result, verdict: input.verdict, why: input.why, xp });
  ctx.outbox.push({ type: "prediction_reveal", itemId, momentId: moment.id, actualResult: input.actual_result, verdict: input.verdict, why: input.why, xp: award });
  return { content: "recorded" };
}

export const BOSS_INSTRUCTION =
  "Stop here and wait: a short boss challenge starts now. Don't continue the work until its result arrives.";

async function milestone(ctx: ToolContext, block: Anthropic.Beta.BetaToolUseBlock): Promise<ToolOutcome> {
  const parsed = MilestoneInputSchema.safeParse(block.input);
  if (!parsed.success) return invalid(parsed.error);
  const { deps, state } = ctx;
  const engineState = state.session.engine;
  // A moment shown in the same response takes priority; the boss can come at a later milestone.
  const bossDue = !engineState.pendingMomentId && deps.engine.bossDue(engineState, deps.now(), sessionEndsAt(state.session));
  state.addItem({ kind: "milestone", id: block.id, label: parsed.data.label });
  ctx.outbox.push({ type: "milestone", itemId: block.id, label: parsed.data.label, bossDue });
  return bossDue
    ? { content: json({ boss_due: true, instruction: BOSS_INSTRUCTION }), pause: "boss_due" }
    : { content: json({ boss_due: false }) };
}
