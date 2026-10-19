/**
 * Server-built user-turn text for non-message requests (never trusts client text; design-plan §5.3).
 */
import type { BossState, MomentRecord } from "@/lib/contracts/session";
import type { SessionMode } from "@/lib/modes";

const CONTINUE: Record<SessionMode, string> = {
  "co-learn":
    "Continue the work, building on their choice: first run code for what's now settled and any steps that don't depend on a pending decision (announcing a step isn't doing it). Before your next consequential choice (e.g. how to evaluate the model or handle class imbalance), check whether it should be the learner's call: if so, ask with a decide moment right before that step.",
  learn:
    "Continue teaching: acknowledge their answer in one short line (correcting any misconception in a sentence), then teach the next chunk of the current part with a source, then ask the next question. If the current part's chunks are done, call milestone_reached for it first.",
};

/** What the model should do instead of the learner's answer when a moment was skipped, saved, or reported. */
const MAKE_THE_CALL: Record<SessionMode, string> = {
  "co-learn": "Make the call yourself and briefly say why.",
  learn: "Give the key point briefly yourself and move on.",
};

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
export function momentResponseText(m: MomentRecord, mode: SessionMode = "co-learn"): string | null {
  const next = CONTINUE[mode];
  switch (m.status) {
    case "answered": {
      const verdict = m.verdict ? ` Grade: ${m.verdict}.` : "";
      const why = m.why ? ` Why: ${m.why}` : "";
      return `[Learner response to ${label(m)}] Their answer: ${answerText(m)}.${verdict}${why}${helpNote(m)}\n${next}`;
    }
    case "awaiting_prediction_result":
      return `[Learner response to ${label(m)}] The learner predicted: ${answerText(m)}.${helpNote(m)} Now run the code, then call resolve_prediction with moment_id="${m.id}".\n${next}`;
    case "skipped":
      return `[Learner skipped ${label(m)}] ${MAKE_THE_CALL[mode]}\n${next}`;
    case "deferred":
      return `[Learner deferred ${label(m)} to the end-of-session quiz] ${MAKE_THE_CALL[mode]}\n${next}`;
    case "reported":
      return `[Learner reported ${label(m)} as unclear or wrong] ${MAKE_THE_CALL[mode]}\n${next}`;
    case "revealed":
      return `[The learner asked to see the answer to ${label(m)} without answering; it was shown to them (ideal answer: ${m.candidate.ideal_answer})] Build on that answer, and keep explanations a little more step-by-step for this concept.\n${next}`;
    case "awaiting_answer":
      return null;
  }
}

export function bossResultText(boss: BossState, concepts: string[], mode: SessionMode = "co-learn"): string | null {
  if (!boss.outcome) return null;
  const outcome = {
    flawless: "a flawless victory",
    victory: "a victory",
    retreat: "the boss retreated (the learner missed more than half; those concepts go to review)",
    skipped: `the learner skipped it to get on with the ${mode === "learn" ? "lesson" : "work"} (those concepts go to review)`,
  }[boss.outcome];
  const about = concepts.length ? ` It covered: ${concepts.join(", ")}.` : "";
  return `[Boss challenge "${boss.name}" finished: ${outcome}.]${about} Acknowledge it in one short line, then ${mode === "learn" ? "continue with the current part of the path" : "continue the work"}.`;
}

export function bossDeclinedText(mode: SessionMode = "co-learn"): string {
  return mode === "learn"
    ? "[The learner chose to keep learning instead of taking on the boss challenge right now. The app will offer it again at the end of a later part.] Don't mention the boss; continue with the current part of the path."
    : "[The learner chose to keep working instead of taking on the boss challenge right now. The app will offer it again at a later milestone.] Don't mention the boss; continue the work.";
}

export function skippedPendingNote(m: Pick<MomentRecord, "id" | "type" | "candidate">, mode: SessionMode = "co-learn"): string {
  return `[The learner skipped the open learning moment ${m.id} (${m.type} · ${m.candidate.concept}) and wrote a new message instead. ${mode === "learn" ? "Answer what they wrote; give the skipped question's key point only if it still matters." : "Make that call yourself if it still matters."}]`;
}

export function continueText(mode: SessionMode = "co-learn"): string {
  return mode === "learn" ? "Please continue teaching where you left off." : "Please continue the work where you left off.";
}

export const CONTAINER_RESET_NOTE =
  "[Note from the app: the coding environment was reset, so earlier files and variables are gone. Reload the data from the uploaded files (or regenerate it) before continuing.]";
