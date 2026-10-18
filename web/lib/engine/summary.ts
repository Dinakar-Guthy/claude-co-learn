/** Engine summary for the work model's dynamic context (design-plan §7.3, §9.1). */
import type { EngineSummary, GateContext } from "@/lib/contracts/engine";
import { rollingAccuracy, targetDifficulty } from "./difficulty";
import { valueThreshold } from "./guardrails";
import { isMastered, reviewDue } from "./mastery";
import { dueForReview } from "./review";

export const SUMMARY_RECENT_OUTCOMES = 3;

export function summarize(ctx: GateContext): EngineSummary {
  const { state, mastery, settings, familiarity, now } = ctx;
  const recent = state.recentOutcomes;
  return {
    guardrails: { ...settings.guardrails },
    valueThreshold: valueThreshold(settings),
    targetDifficulty: {
      firstExposure: targetDifficulty(undefined, "first_exposure", familiarity, recent),
      practice: targetDifficulty(undefined, "practice", familiarity, recent),
    },
    // Matches the gate: review-due concepts are left out so Claude may quiz them again.
    masteredConcepts: Object.keys(mastery)
      .filter((c) => isMastered(mastery[c]) && !reviewDue(mastery[c], now))
      .sort(),
    dueForReview: dueForReview(mastery, now),
    conceptsSinceBoss: [...state.conceptsSinceBoss],
    rollingAccuracy: rollingAccuracy(recent),
    recentOutcomes: recent
      .slice(-SUMMARY_RECENT_OUTCOMES)
      .map((o) => ({ concept: o.concept, type: o.type, score: o.score })),
  };
}
