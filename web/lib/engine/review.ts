/**
 * Spaced review across sessions (design-plan §7.3 "Review due", §9.1) and the Codex status of each concept.
 * Pure: reads the per-user mastery map; never writes it.
 */
import type { ConceptMastery, MasteryMap } from "@/lib/contracts/engine";
import { isMastered, MASTERY_REFERENCE_DIFFICULTY, pCorrect, reviewDue } from "./mastery";

/** Below this P(correct at b = 3), a practised but unmastered concept is worth revisiting. */
export const SHAKY_P_THRESHOLD = 0.6;
/**
 * The last attempt has to have gone less than well, too: a newcomer's correct answers keep strength low for a
 * while (θ starts at 1.5), and "Review next time" for something they just got right would feel punishing (P2).
 */
export const SHAKY_LAST_SCORE = 0.6;

/**
 * Shaky concepts are only offered for review once they're this old, so a concept practised a few minutes ago isn't
 * re-quizzed straight away: it comes back in a later session (or much later in a long one).
 */
export const REVIEW_MIN_GAP_MS = 10 * 60 * 1000;

/** At most this many review suggestions per turn, so the context stays short and the work stays first. */
export const MAX_DUE_FOR_REVIEW = 3;

/** Strength of a concept: P(correct on a medium question, b = 3). Same reference point as `isMastered`. */
export function strength(m: ConceptMastery): number {
  return pCorrect(m.theta, MASTERY_REFERENCE_DIFFICULTY);
}

/**
 * Practised at least once, not mastered, below a comfortable success rate on a medium question, and the last
 * attempt went less than well (missed, partial, revealed, or after a lot of help). Older records without a
 * lastScore fall back to strength alone.
 */
export function isShaky(m: ConceptMastery | undefined): boolean {
  if (!m || m.n < 1 || isMastered(m) || strength(m) >= SHAKY_P_THRESHOLD) return false;
  return m.lastScore === undefined || m.lastScore < SHAKY_LAST_SCORE;
}

export type ReviewReason = "shaky" | "stale";

/** Why a concept is due for review now, or null if it isn't. */
export function reviewReason(m: ConceptMastery | undefined, now: number): ReviewReason | null {
  if (!m) return null;
  if (reviewDue(m, now)) return "stale";
  if (isShaky(m) && now - m.lastSeen > REVIEW_MIN_GAP_MS) return "shaky";
  return null;
}

/**
 * Concepts worth a quick review moment, most valuable first, capped at MAX_DUE_FOR_REVIEW:
 * shaky concepts first (weakest first: the most to gain), then mastered-but-stale ones (longest unseen first:
 * the most likely to be forgotten). Ties break by oldest lastSeen, then name, so the order is deterministic.
 */
export function dueForReview(mastery: MasteryMap, now: number, max = MAX_DUE_FOR_REVIEW): string[] {
  const due = Object.entries(mastery).flatMap(([concept, m]) => {
    const reason = reviewReason(m, now);
    return reason ? [{ concept, m, reason }] : [];
  });
  const rank = (r: ReviewReason) => (r === "shaky" ? 0 : 1);
  due.sort(
    (a, b) =>
      rank(a.reason) - rank(b.reason) ||
      (a.reason === "shaky" ? strength(a.m) - strength(b.m) : 0) ||
      a.m.lastSeen - b.m.lastSeen ||
      a.concept.localeCompare(b.concept),
  );
  return due.slice(0, max).map((d) => d.concept);
}

export type ConceptStatus = "mastered" | "growing" | "review";

/**
 * Codex status, consistent with the engine:
 * - review: exactly the concepts `dueForReview` would offer (before the cap)
 * - mastered: `isMastered` and not yet due for review
 * - growing: everything else (practised recently, or on track but not mastered yet)
 */
export function conceptStatus(m: ConceptMastery, now: number): ConceptStatus {
  if (reviewReason(m, now)) return "review";
  return isMastered(m) ? "mastered" : "growing";
}
