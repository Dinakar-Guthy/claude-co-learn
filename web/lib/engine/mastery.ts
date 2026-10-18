/** Elo-lite mastery model (design-plan §7.3, principle P5). */
import type { ConceptMastery, Familiarity } from "@/lib/contracts/engine";
import type { Verdict } from "@/lib/contracts/moment";
import { clamp, sigmoid } from "./math";

/** Starting θ by self-reported familiarity (design-plan §7.3). */
export const INITIAL_THETA: Record<Familiarity, number> = { new: 1.5, some: 2.5, comfortable: 3.5 };

/** Slope of the logistic: P(correct) = σ(SLOPE·(θ − b)) (design-plan §7.3). */
export const SLOPE = 1.2;

/** Learning rate: fast while we know little about the learner, then slower (design-plan §7.3). */
export const K_EARLY = 0.6;
export const K_LATE = 0.3;
export const K_EARLY_ATTEMPTS = 3; // K_EARLY applies while n < this

/** θ bounds: one step beyond the 1–5 difficulty scale on each side. */
export const THETA_MIN = 0;
export const THETA_MAX = 6;

/** Mastered = enough attempts and P(correct at a medium question) ≥ threshold (design-plan §7.3). */
export const MASTERY_MIN_ATTEMPTS = 2;
export const MASTERY_REFERENCE_DIFFICULTY = 3;
export const MASTERY_P_THRESHOLD = 0.8;

/** A mastered concept unseen for longer than this resurfaces as review (design-plan §7.3). */
export const REVIEW_AFTER_MS = 24 * 60 * 60 * 1000;

/** Outcome scores (design-plan §7.3). Skipped answers have no score and never update mastery. */
export const SCORE = { correct: 1, correctAfterMC: 0.6, partial: 0.5, incorrect: 0 } as const;

export function scoreFor(verdict: Verdict, afterMC: boolean): number {
  if (verdict === "correct") return afterMC ? SCORE.correctAfterMC : SCORE.correct;
  return verdict === "partial" ? SCORE.partial : SCORE.incorrect;
}

export function thetaOf(m: ConceptMastery | undefined, familiarity: Familiarity): number {
  return m ? m.theta : INITIAL_THETA[familiarity];
}

export function pCorrect(theta: number, difficulty: number): number {
  return sigmoid(SLOPE * (theta - difficulty));
}

export function updateMastery(
  prev: ConceptMastery | undefined,
  score: number,
  difficulty: number,
  familiarity: Familiarity,
  now: number,
): ConceptMastery {
  const theta = thetaOf(prev, familiarity);
  const n = prev?.n ?? 0;
  const k = n < K_EARLY_ATTEMPTS ? K_EARLY : K_LATE;
  const next = theta + k * (score - pCorrect(theta, difficulty));
  return { theta: clamp(next, THETA_MIN, THETA_MAX), n: n + 1, lastSeen: now };
}

export function isMastered(m: ConceptMastery | undefined): boolean {
  return (
    !!m &&
    m.n >= MASTERY_MIN_ATTEMPTS &&
    pCorrect(m.theta, MASTERY_REFERENCE_DIFFICULTY) >= MASTERY_P_THRESHOLD
  );
}

export function reviewDue(m: ConceptMastery | undefined, now: number): boolean {
  return !!m && isMastered(m) && now - m.lastSeen > REVIEW_AFTER_MS;
}
