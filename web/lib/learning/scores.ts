/** Score and boss-hit values (design-plan §7.3, §7.4). */
import type { Verdict } from "@/lib/contracts/moment";
import type { MomentRecord } from "@/lib/contracts/session";

export const SCORE = { correct: 1, afterMC: 0.6, partial: 0.5, incorrect: 0 } as const;
export const HIT = { correct: 1, afterMC: 0.5, partial: 0.5, incorrect: 0 } as const;

export function scoreFor(verdict: Verdict, afterMC: boolean): number {
  if (verdict === "correct") return afterMC ? SCORE.afterMC : SCORE.correct;
  return verdict === "partial" ? SCORE.partial : SCORE.incorrect;
}

export function hitFor(verdict: Verdict, afterMC: boolean): number {
  if (verdict === "correct") return afterMC ? HIT.afterMC : HIT.correct;
  return verdict === "partial" ? HIT.partial : HIT.incorrect;
}

/** Score of a resolved moment, derived from its stored verdict (MC use is implied by mcChoice). */
export function momentScore(m: MomentRecord): number | null {
  if (m.status !== "answered" || !m.verdict) return null;
  return scoreFor(m.verdict, m.mcChoice !== undefined);
}

export const isSettled = (m: MomentRecord) => m.status === "answered" || m.status === "skipped" || m.status === "reported";
