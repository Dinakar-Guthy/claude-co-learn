/** Boss-hit values and moment scoring (design-plan §7.3, §7.4). Outcome scores come from the engine. */
import type { Verdict } from "@/lib/contracts/moment";
import type { MomentRecord } from "@/lib/contracts/session";
import { scoreFor } from "@/lib/engine";

export const HIT = { correct: 1, afterMC: 0.5, partial: 0.5, incorrect: 0 } as const;

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
