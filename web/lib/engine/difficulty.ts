/** Target difficulty: aim each question at a success-rate band (design-plan §7.3, research/01-challenge-ratio.md). */
import type { ConceptMastery, DifficultyKind, Familiarity, Outcome } from "@/lib/contracts/engine";
import { clamp, EPSILON, logit } from "./math";
import { SLOPE, thetaOf } from "./mastery";

/** Target P(correct) per kind; research suggests 85–90% new, 75–85% practice, 65–80% boss. */
export const TARGET_SUCCESS: Record<DifficultyKind, number> = {
  first_exposure: 0.87,
  practice: 0.8,
  boss: 0.72,
};

/** Rolling adjustment: back off fast, ramp up slowly (research/01, design implication 3). */
export const ROLLING_WINDOW = 5;
export const ROLLING_MIN_OUTCOMES = 3;
export const ROLLING_HIGH_ACCURACY = 0.9;
export const ROLLING_LOW_ACCURACY = 0.6;
export const RAMP_UP_STEP = 0.5;
export const BACK_OFF_STEP = -1;

export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 5;

/** Mean score over the last ROLLING_WINDOW outcomes, or null with fewer than ROLLING_MIN_OUTCOMES. */
export function rollingAccuracy(recent: Outcome[]): number | null {
  const window = recent.slice(-ROLLING_WINDOW);
  if (window.length < ROLLING_MIN_OUTCOMES) return null;
  return window.reduce((sum, o) => sum + o.score, 0) / window.length;
}

export function rollingAdjustment(recent: Outcome[]): number {
  const acc = rollingAccuracy(recent);
  if (acc === null) return 0;
  if (acc >= ROLLING_HIGH_ACCURACY - EPSILON) return RAMP_UP_STEP;
  if (acc <= ROLLING_LOW_ACCURACY + EPSILON) return BACK_OFF_STEP;
  return 0;
}

/** Solves σ(SLOPE·(θ − b)) = target for b, adjusts for recent accuracy, then rounds and clamps to 1–5. */
export function targetDifficulty(
  m: ConceptMastery | undefined,
  kind: DifficultyKind,
  familiarity: Familiarity,
  recent: Outcome[],
): number {
  const b = thetaOf(m, familiarity) - logit(TARGET_SUCCESS[kind]) / SLOPE + rollingAdjustment(recent);
  return clamp(Math.round(b), DIFFICULTY_MIN, DIFFICULTY_MAX);
}
