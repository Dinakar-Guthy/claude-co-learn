import type { MomentView, Verdict } from "@/lib/contracts/moment";

/** What a MomentCard shows, derived purely from the server's MomentView plus the client's `grading` flag. */
export type MomentPhase =
  | "question" // free-text answer box
  | "grading" // waiting for /api/moment/grade
  | "choosing" // MC options visible (after "Show options" or a "Not quite")
  | "mc_answered" // option picked: chosen + best option highlighted
  | "answered" // verdict + why + XP
  | "locked_in" // predict: waiting for the real result
  | "revealed" // the learner asked for the answer (after one nudge); shown with no credit
  | "skipped"
  | "deferred"
  | "reported";

export function momentPhase(m: MomentView, grading = false): MomentPhase {
  if (m.status === "skipped" || m.status === "deferred" || m.status === "reported") return m.status;
  if (m.status === "revealed") return "revealed";
  if (grading) return "grading";
  if (m.status === "awaiting_prediction_result") return "locked_in";
  if (m.mcChoice !== undefined) return "mc_answered";
  if (m.mcOptions?.length && m.verdict !== "correct") return "choosing";
  if (m.verdict) return "answered";
  return "question";
}

/** A key that changes exactly when new feedback arrives (drives the verdict sound). */
export function feedbackKey(m: MomentView): string | null {
  if (!m.verdict) return null;
  return `${m.id}:${m.verdict}:${m.mcChoice ?? "free"}`;
}

export const MOMENT_TYPE_LABEL: Record<MomentView["type"], string> = {
  decide: "Decide",
  predict: "Predict",
  explain_back: "Explain it back",
  spot_issue: "Spot the issue",
  fill_gap: "Fill the gap",
  boss: "Boss question",
};

export function pipMoodFor(verdict: Verdict, big = false) {
  if (verdict === "correct") return big ? ("celebrating" as const) : ("happy" as const);
  return "encouraging" as const;
}
