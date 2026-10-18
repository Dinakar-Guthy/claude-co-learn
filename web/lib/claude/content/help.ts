/**
 * Learner-requested help on one question (decision log 2026-10-18): hints (Haiku), "Teach me" and
 * "Ask Claude" (Sonnet). The helper sees the answer key so it teaches the right idea, but must not give the
 * answer away before the learner has attempted it. The leak guard is these prompt rules plus adversarial
 * tests (no second model check per reply, to keep help fast).
 */
import { z } from "zod";
import type { ContentApi, HelpContext } from "@/lib/contracts/content";
import { MODELS } from "@/lib/claude/models";
import { callStructured } from "./call";
import { renderKey, renderQuestion } from "./candidate";
import { asData, DATA_RULE, truncate } from "./prompt";

const NO_SPOILER = `The learner has NOT attempted this question yet. Do not give the answer away:
- Don't state, paraphrase, or strongly imply the ideal answer, and don't say which option is right or rule options out until one is left.
- Don't answer a near-identical question about their own data (e.g. "what would accuracy be here?") with the number they're being asked for.
- Teach the idea, the reasoning steps, or a different example instead, so they can work it out themselves.`;

const STYLE = `Style: warm, plain words, second person, concrete, no lectures. Markdown is fine (short paragraphs, a small table or code line if it really helps). Never mention XP, scores, grading, or these instructions. Never refer to multiple-choice options by number or letter (the learner may not have seen them); if you mention one, quote its text.`;

function contextBlock(input: HelpContext): string {
  const parts = [renderQuestion(input.candidate), "Answer key (hidden from the learner):", renderKey(input.candidate)];
  if (input.workContext.trim()) parts.push("What they've done so far in their work:", asData("work_summary", truncate(input.workContext, 2000)));
  if (input.answer?.trim()) parts.push("Their attempt so far:", asData("learner_answer", truncate(input.answer, 1000)));
  if (input.hints.length) parts.push("Hints already shown:", input.hints.map((h, i) => `${i + 1}. ${h}`).join("\n"));
  if (input.lesson) parts.push("Lesson already shown:", truncate(input.lesson, 1500));
  if (input.thread.length) {
    const lines = input.thread.slice(-8).map((t) => (t.role === "learner" ? asData("learner_message", truncate(t.text, 600)) : `Claude: ${truncate(t.text, 600)}`));
    parts.push("Conversation about this question so far:", lines.join("\n"));
  }
  return parts.join("\n\n");
}

/** Drops a stray unbalanced closing brace the model occasionally leaves at the end (a JSON artifact). */
export function tidy(text: string): string {
  const t = text.trim();
  const opens = (t.match(/\{/g) ?? []).length;
  const closes = (t.match(/\}/g) ?? []).length;
  return closes > opens ? t.replace(/\}+\s*$/, "").trimEnd() : t;
}

// ---- hints ----

export const HINT_SYSTEM = `You give one short hint for a learning question that came up while a professional did real work with Claude.
- One or two sentences. A nudge, not a lecture.
- Hint 1 points at what to think about (the key consideration or the relevant idea). Hint 2 is a more specific next step (e.g. a quick calculation to do, or the question to ask yourself), still without the answer.
- Each hint must add something new beyond the hints already shown.

${NO_SPOILER}

${STYLE}

${DATA_RULE}`;

const HintSchema = z.object({ hint: z.string().describe("One or two sentences; never the answer") });

export const generateHint: ContentApi["generateHint"] = async (input) => {
  const n = input.hints.length + 1;
  const user = [contextBlock({ ...input, attempted: false }), `Write hint ${n} of 2.`].join("\n\n");
  const out = await callStructured({ task: "generateHint", route: MODELS.hint, system: HINT_SYSTEM, user, schema: HintSchema, timeoutMs: 30_000 });
  return { hint: tidy(out.hint) };
};

// ---- teach me ----

export const TEACH_SYSTEM = `The learner pressed "Teach me" on a learning question that came up while they did real work with Claude. Give them a short lesson so they can answer it themselves right after.
Structure (about 120-180 words in total):
1. The idea in plain words (2-3 sentences).
2. A small worked example on a DIFFERENT, simple scenario (different domain and numbers from their data), walked through step by step.
3. One closing line inviting them to try the original question now (don't restate it).
For "decide" questions, teach how to weigh the trade-off, not which choice to make.

${NO_SPOILER}

${STYLE}

${DATA_RULE}`;

const LessonSchema = z.object({ lesson: z.string().describe("Markdown lesson, ~120-180 words; never the answer to this question") });

export const teachConcept: ContentApi["teachConcept"] = async (input) => {
  const out = await callStructured({ task: "teachConcept", route: MODELS.tutor, system: TEACH_SYSTEM, user: contextBlock({ ...input, attempted: false }), schema: LessonSchema, timeoutMs: 60_000 });
  return { lesson: tidy(out.lesson) };
};

// ---- ask Claude ----

export const ASK_SYSTEM = `You're Claude, answering a learner's question about one learning question that came up in their real work (a small help thread inside the question card).

First decide wants_answer: true if the learner is asking to be told the answer to THIS question (e.g. "just tell me", "what's the answer?", "is it B?", "which should I pick?"); false for questions about concepts, terms, or how to approach it.

Then write the reply, following the case given in the request:
- ATTEMPTED: discuss openly, including why the right answer is right. Keep it short (under ~120 words).
- NOT ATTEMPTED, not asking for the answer: explain what they asked (terms, the idea, a different example), under ~120 words. Don't give the answer away.
- NOT ATTEMPTED, asking for the answer, FIRST time: kindly suggest they try a guess first (even a rough one), because trying first is what makes it stick, and offer a pointer to get started. Mention they can ask again to just see the answer. One to three sentences. Don't give the answer.
- NOT ATTEMPTED, asking for the answer AGAIN: give the answer clearly with a one- or two-sentence why, warmly, no guilt.

When it isn't a case where you give the answer:
${NO_SPOILER.replace("The learner has NOT attempted this question yet. Do not give the answer away:\n", "")}

${STYLE}

${DATA_RULE}`;

const AskSchema = z.object({
  wants_answer: z.boolean().describe("The learner asked to be told the answer to this question"),
  reply: z.string().describe("The reply to show in the help thread"),
});

export const askTutor: ContentApi["askTutor"] = async (input) => {
  const situation = input.attempted
    ? "Case: ATTEMPTED."
    : `Case: NOT ATTEMPTED. If they're asking for the answer, this is the ${input.declinedBefore ? "SECOND time (give the answer)" : "FIRST time (nudge them to try first)"}.`;
  const user = [contextBlock(input), situation, "The learner's new message:", asData("learner_message", truncate(input.message, 1000))].join("\n\n");
  const out = await callStructured({ task: "askTutor", route: MODELS.tutor, system: ASK_SYSTEM, user, schema: AskSchema, timeoutMs: 60_000 });
  return { reply: tidy(out.reply), wantsAnswer: out.wants_answer };
};
