/** Immutable EngineState transitions. Every helper returns a new object and never mutates its input. */
import type { BossOutcome, BossRecord, EngineState, Outcome } from "@/lib/contracts/engine";

/** recentOutcomes keeps the latest N (plenty for the rolling window and summaries). */
export const RECENT_OUTCOMES_CAP = 20;

export function recordShown(state: EngineState, momentId: string, now: number): EngineState {
  return { ...state, pendingMomentId: momentId, momentsShownAt: [...state.momentsShownAt, now], turnsSinceMoment: 0 };
}

export function recordOutcome(state: EngineState, outcome: Outcome): EngineState {
  return {
    ...state,
    pendingMomentId: state.pendingMomentId === outcome.momentId ? undefined : state.pendingMomentId,
    recentOutcomes: [...state.recentOutcomes, outcome].slice(-RECENT_OUTCOMES_CAP),
    conceptsSinceBoss: state.conceptsSinceBoss.includes(outcome.concept)
      ? [...state.conceptsSinceBoss]
      : [...state.conceptsSinceBoss, outcome.concept],
  };
}

/** Clears the pending moment without an outcome (learner skipped or deferred it; mastery is not updated). */
export function recordSkipped(state: EngineState, momentId: string): EngineState {
  return { ...state, pendingMomentId: state.pendingMomentId === momentId ? undefined : state.pendingMomentId };
}

export function recordWorkTurn(state: EngineState): EngineState {
  return { ...state, turnsSinceMoment: state.turnsSinceMoment + 1 };
}

export function recordBossStarted(state: EngineState, boss: BossRecord): EngineState {
  return { ...state, bosses: [...state.bosses, { ...boss, concepts: [...boss.concepts] }] };
}

/** Sets the boss outcome and starts a fresh concept count toward the next boss. */
export function recordBossFinished(state: EngineState, bossId: string, outcome: BossOutcome): EngineState {
  return {
    ...state,
    bosses: state.bosses.map((b) => (b.id === bossId ? { ...b, outcome } : b)),
    conceptsSinceBoss: [],
  };
}
