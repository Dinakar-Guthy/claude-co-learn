/** Boss timing and outcome (design-plan §7.4). */
import type { BossOutcome, EngineState } from "@/lib/contracts/engine";

/** Distinct concepts practised since the last boss before another is due. */
export const BOSS_MIN_CONCEPTS = 3;
/** Minimum gap between boss starts. */
export const BOSS_COOLDOWN_MS = 3 * 60 * 1000;
/** Don't start a boss in the final minute of the session clock (it would run past the end). */
export const BOSS_MIN_REMAINING_MS = 60 * 1000;

export function bossDue(state: EngineState, now: number, sessionEndsAt: number): boolean {
  if (new Set(state.conceptsSinceBoss).size < BOSS_MIN_CONCEPTS) return false;
  if (state.bosses.some((b) => now - b.startedAt < BOSS_COOLDOWN_MS)) return false;
  // Past the end the user chose "Keep going" (P7), so bosses are allowed again.
  const inFinalMinute = now >= sessionEndsAt - BOSS_MIN_REMAINING_MS && now < sessionEndsAt;
  return !inFinalMinute;
}

/** hits may be fractional (a partial answer is half a hit). */
export function bossOutcome(hits: number, maxHits: number): BossOutcome {
  if (hits >= maxHits) return "flawless";
  if (hits * 2 >= maxHits) return "victory";
  return "retreat";
}
