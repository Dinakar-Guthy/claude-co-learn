/**
 * Dynamic per-turn context (docs/design-plan.md §9.1), sent as a mid-conversation system message right after
 * the turn's user message. Kept in history (append-only), so it is never edited after it is sent.
 */
import type { EngineSummary } from "@/lib/contracts/engine";
import type { LearningPath, Session } from "@/lib/contracts/session";
import { modeOf, partsFor } from "@/lib/modes";
import { BOSS_MIN_CONCEPTS } from "@/lib/engine/boss";

const MINUTE = 60_000;

export function sessionEndsAt(session: Pick<Session, "createdAt" | "intent">): number {
  return session.createdAt + session.intent.minutes * MINUTE;
}

export function timeLine(session: Pick<Session, "createdAt" | "intent">, now: number): string {
  const total = session.intent.minutes * MINUTE;
  const elapsed = now - session.createdAt;
  const left = Math.max(0, Math.ceil((total - elapsed) / MINUTE));
  if (elapsed >= total) return `Time: the planned ${session.intent.minutes} minutes are up. Finish the current step cleanly; the learner may wrap up or keep going.`;
  if (elapsed >= 0.8 * total) return `Time: ~2 minutes left: ${modeOf(session.intent) === "learn" ? "finish the current part" : "steer toward a milestone"}.`;
  return `Time: about ${left} of ${session.intent.minutes} minutes left.`;
}

const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none");

/** Spaced review across sessions: concepts the engine says are worth revisiting (EngineSummary.dueForReview). */
export function reviewLine(concepts: string[]): string {
  return `Due for review from earlier sessions: ${concepts.join(", ")}. If the work naturally touches one, a quick practice moment on it is welcome (it counts as review, not first exposure: set first_exposure to false and reuse the exact concept name).`;
}

export interface ContextInput {
  session: Pick<Session, "createdAt" | "intent" | "sketch" | "primer" | "path">;
  summary: EngineSummary;
  now: number;
  /** Extra one-off notes for this turn (e.g. how to get the demo dataset). */
  notes?: string[];
}

export function renderContext({ session, summary, now, notes = [] }: ContextInput): string {
  const { intent, sketch } = session;
  const learn = modeOf(intent) === "learn";
  const g = summary.guardrails;
  const lines = [
    `${learn ? "Learn" : "Co-learn"} context for this turn (from the app, not the learner):`,
    `- ${learn ? "What the learner wants to learn" : "Learner goal"}: ${intent.goal}`,
    `- Familiarity with this area: ${intent.familiarity}`,
    `- ${timeLine(session, now)}`,
    `- Moment gate: learning value >= ${summary.valueThreshold}. Target difficulty: ${summary.targetDifficulty.firstExposure} for a new concept, ${summary.targetDifficulty.practice} for practice.`,
    `- Guardrails: ${g.enabled ? `on (${g.mode}); fewer interruptions, so only propose your best moments` : "off"}`,
    `- Mastered concepts (don't quiz unless due for review): ${list(summary.masteredConcepts)}`,
    ...(summary.dueForReview.length ? [`- ${reviewLine(summary.dueForReview)}`] : []),
    `- Concepts practised since the last boss: ${list(summary.conceptsSinceBoss)}`,
    `- Rolling accuracy: ${summary.rollingAccuracy === null ? "no graded answers yet" : `${Math.round(summary.rollingAccuracy * 100)}%`}`,
    `- Recent outcomes: ${summary.recentOutcomes.length ? summary.recentOutcomes.map((o) => `${o.concept} (${o.type}) ${o.score}`).join("; ") : "none"}`,
  ];
  if (learn) {
    lines.push(...pathLines(session.path, intent.minutes));
  } else if (new Set(summary.conceptsSinceBoss).size >= BOSS_MIN_CONCEPTS) {
    lines.push("- Enough concepts practised for a boss challenge: call milestone_reached at the next natural checkpoint (e.g. right after you report a result).");
  }
  if (sketch && !learn) {
    lines.push(`- Session sketch (a loose guide, not a curriculum): likely milestones: ${list(sketch.milestones)}`);
    if (sketch.conceptRadar.length) {
      lines.push(
        `- Concept radar: ${sketch.conceptRadar.map((c) => `${c.concept} (${c.likelyMomentType}): ${c.whyItMatters}`).join("; ")}`,
      );
    }
  }
  if (session.primer) lines.push(`- ${primerLine(session.primer.ideas)}`);
  for (const note of notes) lines.push(`- ${note}`);
  return lines.join("\n");
}

/** Learn mode: the path and the current part, or how to start one. */
export function pathLines(path: LearningPath | undefined, minutes: number): string[] {
  if (!path?.parts.length) {
    return [`- Learning path: not set yet. Call set_learning_path first with ${partsFor(minutes)} parts (for a ${minutes}-minute session), then teach part 1.`];
  }
  const mark = { done: "✓", current: "▶", todo: " " } as const;
  const current = path.parts.findIndex((p) => p.status === "current");
  return [
    `- Learning path "${path.topic}" (the learner may have reordered it; follow this order):`,
    ...path.parts.map((p, i) => `  ${mark[p.status]} ${i + 1}. ${p.title}: ${p.summary}`),
    current === -1
      ? "- Every part is done: recap the topic in a few lines and suggest where to go next; the learner can wrap up."
      : `- Current part: ${current + 1}. ${path.parts[current].title}. Teach it in 2-3 chunks, each followed by a question; when it's done, call milestone_reached with its title.`,
  ];
}

export function demoDataNote(hasDemoFile: boolean): string {
  return hasDemoFile
    ? "Demo dataset: a customer-churn CSV has been uploaded to your sandbox with this message. Find it (e.g. with ls/find) and load it from the file."
    : "Demo dataset: no file is attached. First generate a realistic synthetic customer-churn dataset in the sandbox with a fixed seed and save it as churn.csv: ~5,000 rows, ~15% churn, columns customer_id, tenure_months, contract_type, monthly_charges, total_charges (a few missing), support_tickets_90d, payment_method, has_premium_support, last_login_days_ago, plan_tier, cancellation_request_date (mostly filled for churners: a planted leak), churned. Don't point out the leak or the missing values yourself; they're for the learner to discover. Then continue with the task.";
}

/** The novice primer's bold terms, so Claude builds on what the learner just read instead of re-explaining it. */
export function primerLine(ideas: string[]): string {
  const terms = ideas.map((i) => /\*\*(.+?)\*\*/.exec(i)?.[1]?.trim()).filter((t): t is string => Boolean(t));
  return `The learner was shown a 60-second primer at the start${terms.length ? ` covering: ${terms.join(", ")}` : ""}. Build on it; don't re-explain those basics unless asked.`;
}
