/**
 * The two learning modes and what each includes (Dinakar, 2026-10-18).
 * - Co-learn: do real work with Claude; learning moments come from the work. No story: the work itself carries
 *   engagement, and a serialized story only competes with it.
 * - Learn: study a topic with Claude as a tutor along a short path of parts. The story is on: with no real work
 *   to carry engagement, it gives a reason to keep going.
 */
export type SessionMode = "co-learn" | "learn";

export const SESSION_MODES = ["co-learn", "learn"] as const satisfies readonly SessionMode[];

export const MODES = {
  "co-learn": { story: false, phrase: "/co-learn", label: "Co-learn" },
  learn: { story: true, phrase: "/learn", label: "Learn" },
} as const satisfies Record<SessionMode, { story: boolean; phrase: string; label: string }>;

/** The mode a typed unlock phrase switches on, or null. */
export function modeForPhrase(phrase: string): SessionMode | null {
  const p = phrase.trim().toLowerCase();
  return SESSION_MODES.find((m) => MODES[m].phrase === p) ?? null;
}

/** Sessions from before modes existed have no mode: they're Co-learn. */
export const modeOf = (intent: { mode?: SessionMode }): SessionMode => intent.mode ?? "co-learn";

/** Learn mode path length by session time (decision log 2026-10-18): 10 min → 3 parts, 20 → 4, 30 → 5, longer → 6. */
export function partsFor(minutes: number): number {
  return minutes <= 10 ? 3 : minutes <= 20 ? 4 : minutes <= 30 ? 5 : 6;
}
