/**
 * Server-built user-turn text for non-message requests (never trusts client text; design-plan §5.3).
 */
import type { BossState, MomentRecord } from "@/lib/contracts/session";

const CONTINUE = "Continue the work, building on their choice.";

const label = (m: MomentRecord) => `moment ${m.id} (${m.type} · ${m.candidate.concept})`;

function answerText(m: MomentRecord): string {
  if (m.answer?.trim()) return `"${m.answer.trim()}"`;
  if (m.mcChoice !== undefined) {
    const option = m.candidate.mc_fallback.options[m.mcChoice];
    return `"${option ?? `option ${m.mcChoice + 1}`}" (picked from multiple-choice options)`;
  }
  return "(no answer text)";
}

/** Text for a `moment_response` request, or null if the moment isn't in a state that can continue the work. */
export function momentResponseText(m: MomentRecord): string | null {
  switch (m.status) {
    case "answered": {
      const verdict = m.verdict ? ` Grade: ${m.verdict}.` : "";
      const why = m.why ? ` Why: ${m.why}` : "";
      return `[Learner response to ${label(m)}] Their answer: ${answerText(m)}.${verdict}${why}\n${CONTINUE}`;
    }
    case "awaiting_prediction_result":
      return `[Learner response to ${label(m)}] The learner predicted: ${answerText(m)}. Now run the code, then call resolve_prediction with moment_id="${m.id}".\n${CONTINUE}`;
    case "skipped":
      return `[Learner skipped ${label(m)}] Make the call yourself and briefly say why.\n${CONTINUE}`;
    case "deferred":
      return `[Learner deferred ${label(m)} to the end-of-session quiz] Make the call yourself and briefly say why.\n${CONTINUE}`;
    case "reported":
      return `[Learner reported ${label(m)} as unclear or wrong] Make the call yourself and briefly say why.\n${CONTINUE}`;
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
  }[boss.outcome];
  const about = concepts.length ? ` It covered: ${concepts.join(", ")}.` : "";
  return `[Boss challenge "${boss.name}" finished: ${outcome}.]${about} Acknowledge it in one short line, then continue the work.`;
}

export function skippedPendingNote(m: Pick<MomentRecord, "id" | "type" | "candidate">): string {
  return `[The learner skipped the open learning moment ${m.id} (${m.type} · ${m.candidate.concept}) and wrote a new message instead. Make that call yourself if it still matters.]`;
}

export const CONTINUE_TEXT = "Please continue the work where you left off.";

export const CONTAINER_RESET_NOTE =
  "[Note from the app: the coding environment was reset, so earlier files and variables are gone. Reload the data from the uploaded files (or regenerate it) before continuing.]";
