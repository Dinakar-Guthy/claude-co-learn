/** The gate: code decides whether Claude's candidate moment is shown (design-plan §7.1, principle P8). */
import type { DifficultyKind, GateContext, GateDecision } from "@/lib/contracts/engine";
import type { LearningMomentInput } from "@/lib/contracts/moment";
import { targetDifficulty } from "./difficulty";
import { capsExceeded, valueThreshold } from "./guardrails";
import { isMastered, reviewDue } from "./mastery";

/** Candidates this far (or further) from the target difficulty are off the challenge band (design-plan §7.1). */
export const OFF_BAND_DISTANCE = 2;

/** A top-value moment that prevents a costly mistake may bypass the value threshold and caps. */
export function isBreakthrough(c: LearningMomentInput): boolean {
  return c.costly_mistake && c.learning_value === 5;
}

export function gate(candidate: LearningMomentInput, ctx: GateContext): GateDecision {
  const { state, mastery, settings, familiarity, now } = ctx;
  const breakthrough = isBreakthrough(candidate);
  const m = mastery[candidate.concept];

  if (state.pendingMomentId !== undefined) return { action: "skip", reason: "one_at_a_time" };

  if (candidate.learning_value < valueThreshold(settings) && !breakthrough) {
    return { action: "skip", reason: "low_value" };
  }

  if (isMastered(m) && !reviewDue(m, now)) return { action: "skip", reason: "mastered" };

  const kind: DifficultyKind = candidate.first_exposure || !m ? "first_exposure" : "practice";
  const target = targetDifficulty(m, kind, familiarity, state.recentOutcomes);
  if (Math.abs(candidate.difficulty - target) >= OFF_BAND_DISTANCE) return { action: "skip", reason: "off_band" };

  const { enabled, mode } = settings.guardrails;
  if (enabled && !breakthrough && capsExceeded(state, mode, now)) {
    return mode === "strict" ? { action: "defer", reason: "cap" } : { action: "skip", reason: "cap" };
  }

  return { action: "show" };
}
