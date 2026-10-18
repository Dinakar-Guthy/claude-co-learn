/**
 * Dynamic per-turn context (docs/design-plan.md §9.1), sent as a mid-conversation system message right after
 * the turn's user message. Kept in history (append-only), so it is never edited after it is sent.
 */
import type { EngineSummary } from "@/lib/contracts/engine";
import type { Session } from "@/lib/contracts/session";

const MINUTE = 60_000;

export function sessionEndsAt(session: Pick<Session, "createdAt" | "intent">): number {
  return session.createdAt + session.intent.minutes * MINUTE;
}

export function timeLine(session: Pick<Session, "createdAt" | "intent">, now: number): string {
  const total = session.intent.minutes * MINUTE;
  const elapsed = now - session.createdAt;
  const left = Math.max(0, Math.ceil((total - elapsed) / MINUTE));
  if (elapsed >= total) return `Time: the planned ${session.intent.minutes} minutes are up. Finish the current step cleanly; the learner may wrap up or keep going.`;
  if (elapsed >= 0.8 * total) return `Time: ~2 minutes left: steer toward a milestone.`;
  return `Time: about ${left} of ${session.intent.minutes} minutes left.`;
}

const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none");

export interface ContextInput {
  session: Pick<Session, "createdAt" | "intent" | "sketch">;
  summary: EngineSummary;
  now: number;
  /** Extra one-off notes for this turn (e.g. how to get the demo dataset). */
  notes?: string[];
}

export function renderContext({ session, summary, now, notes = [] }: ContextInput): string {
  const { intent, sketch } = session;
  const g = summary.guardrails;
  const lines = [
    "Co-learn context for this turn (from the app, not the learner):",
    `- Learner goal: ${intent.goal}`,
    `- Familiarity with this area: ${intent.familiarity}`,
    `- ${timeLine(session, now)}`,
    `- Moment gate: learning value >= ${summary.valueThreshold}. Target difficulty: ${summary.targetDifficulty.firstExposure} for a new concept, ${summary.targetDifficulty.practice} for practice.`,
    `- Guardrails: ${g.enabled ? `on (${g.mode}); fewer interruptions, so only propose your best moments` : "off"}`,
    `- Mastered concepts (don't quiz unless due for review): ${list(summary.masteredConcepts)}`,
    `- Concepts practised since the last boss: ${list(summary.conceptsSinceBoss)}`,
    `- Rolling accuracy: ${summary.rollingAccuracy === null ? "no graded answers yet" : `${Math.round(summary.rollingAccuracy * 100)}%`}`,
    `- Recent outcomes: ${summary.recentOutcomes.length ? summary.recentOutcomes.map((o) => `${o.concept} (${o.type}) ${o.score}`).join("; ") : "none"}`,
  ];
  if (sketch) {
    lines.push(`- Session sketch (a loose guide, not a curriculum): likely milestones: ${list(sketch.milestones)}`);
    if (sketch.conceptRadar.length) {
      lines.push(
        `- Concept radar: ${sketch.conceptRadar.map((c) => `${c.concept} (${c.likelyMomentType}): ${c.whyItMatters}`).join("; ")}`,
      );
    }
  }
  for (const note of notes) lines.push(`- ${note}`);
  return lines.join("\n");
}

export function demoDataNote(hasDemoFile: boolean): string {
  return hasDemoFile
    ? "Demo dataset: a customer-churn CSV has been uploaded to your sandbox with this message. Find it (e.g. with ls/find) and load it from the file."
    : "Demo dataset: no file is attached. First generate a realistic synthetic customer-churn dataset in the sandbox with a fixed seed and save it as churn.csv: ~5,000 rows, ~15% churn, columns customer_id, tenure_months, contract_type, monthly_charges, total_charges (a few missing), support_tickets_90d, payment_method, has_premium_support, last_login_days_ago, plan_tier, cancellation_request_date (mostly filled for churners: a planted leak), churned. Don't point out the leak or the missing values yourself; they're for the learner to discover. Then continue with the task.";
}
