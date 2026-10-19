/**
 * Server-built user-turn text for non-message requests (never trusts client text; design-plan §5.3).
 */
import type { BossState, MomentRecord } from "@/lib/contracts/session";

const CONTINUE =
  "Continue the work, building on their choice: first run what's now settled and any steps that don't depend on a pending decision. Before your next consequential choice (e.g. how to evaluate the model or handle class imbalance), check whether it should be the learner's call: if so, ask with a decide moment right before that step.";

const label = (m: MomentRecord) => `moment ${m.id} (${m.type} · ${m.candidate.concept})`;

function answerText(m: MomentRecord): string {
  if (m.answer?.trim()) return `"${m.answer.trim()}"`;
  if (m.mcChoice !== undefined) {
    const option = m.candidate.mc_fallback.options[m.mcChoice];
    return `"${option ?? `option ${m.mcChoice + 1}`}" (picked from multiple-choice options)`;
  }
  return "(no answer text)";
}

/** How much help the learner asked for, so the work model can adapt (e.g. explain a bit more next time). */
function helpNote(m: MomentRecord): string {
  const h = m.help;
  if (!h) return "";
  const parts: string[] = [];
  if (h.hints.length) parts.push(`${h.hints.length} hint${h.hints.length === 1 ? "" : "s"}`);
  if (h.lesson) parts.push("a short lesson");
  const asked = h.thread.filter((t) => t.role === "learner").length;
  if (asked) parts.push(`${asked} question${asked === 1 ? "" : "s"} to Claude about it`);
  return parts.length ? ` They asked for help first (${parts.join(", ")}), so this concept is still new to them.` : "";
}

/** Text for a `moment_response` request, or null if the moment isn't in a state that can continue the work. */
export function momentResponseText(m: MomentRecord): string | null {
  switch (m.status) {
    case "answered": {
      const verdict = m.verdict ? ` Grade: ${m.verdict}.` : "";
      const why = m.why ? ` Why: ${m.why}` : "";
      return `[Learner response to ${label(m)}] Their answer: ${answerText(m)}.${verdict}${why}${helpNote(m)}\n${CONTINUE}`;
    }
    case "awaiting_prediction_result":
      return `[Learner response to ${label(m)}] The learner predicted: ${answerText(m)}.${helpNote(m)} Now run the code, then call resolve_prediction with moment_id="${m.id}".\n${CONTINUE}`;
    case "skipped":
      return `[Learner skipped ${label(m)}] Make the call yourself and briefly say why.\n${CONTINUE}`;
    case "deferred":
      return `[Learner deferred ${label(m)} to the end-of-session quiz] Make the call yourself and briefly say why.\n${CONTINUE}`;
    case "reported":
      return `[Learner reported ${label(m)} as unclear or wrong] Make the call yourself and briefly say why.\n${CONTINUE}`;
    case "revealed":
      return `[The learner asked to see the answer to ${label(m)} without answering; it was shown to them (ideal answer: ${m.candidate.ideal_answer})] Build on that answer, and keep explanations a little more step-by-step for this concept.\n${CONTINUE}`;
    case "awaiting_answer":
      return null;
  }
}

export function bossResultText(boss: BossState, concepts: string[]): string | null {
  if (!boss.outcome) return null;
  const outcome = {
    flawless: "a flawless victory",
    victory: "a victory",
    retreat: "the boss retreated (the learner missed more than half; those concepts go to review)",
    skipped: "the learner skipped it to get on with the work (those concepts go to review)",
  }[boss.outcome];
  const about = concepts.length ? ` It covered: ${concepts.join(", ")}.` : "";
  return `[Boss challenge "${boss.name}" finished: ${outcome}.]${about} Acknowledge it in one short line, then continue the work.`;
}

export const BOSS_DECLINED_TEXT =
  "[The learner chose to keep working instead of taking on the boss challenge right now. The app will offer it again at a later milestone.] Don't mention the boss; continue the work.";

export function skippedPendingNote(m: Pick<MomentRecord, "id" | "type" | "candidate">): string {
  return `[The learner skipped the open learning moment ${m.id} (${m.type} · ${m.candidate.concept}) and wrote a new message instead. Make that call yourself if it still matters.]`;
}

export const CONTINUE_TEXT = "Please continue the work where you left off.";

export const CONTAINER_RESET_NOTE =
  "[Note from the app: the coding environment was reset, so earlier files and variables are gone. Reload the data from the uploaded files (or regenerate it) before continuing.]";
