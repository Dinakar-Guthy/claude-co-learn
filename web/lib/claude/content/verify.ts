/**
 * verifyMoment (Haiku, P9): a blind solve without the key, then a comparison against the key.
 * Two calls so the first answer is genuinely blind; structural problems are caught in code first.
 */
import { z } from "zod";
import type { ContentApi, VerifyResult } from "@/lib/contracts/content";
import type { LearningMomentInput } from "@/lib/contracts/moment";
import { MODELS } from "@/lib/claude/models";
import { callStructured } from "./call";
import { renderKey, renderOptions, renderQuestion } from "./candidate";
import { DATA_RULE } from "./prompt";

export const BlindOutputSchema = z.object({
  answer: z.string().describe("Your own concise answer to the question (1-3 sentences)"),
  best_option_index: z.number().int().describe("0-based index of the option you think is best"),
  ambiguous: z.boolean().describe("True if the question is unclear or has no single best answer for its type"),
  ambiguity_note: z.string().describe("Why it is ambiguous, or an empty string"),
});

export const JudgeOutputSchema = z.object({
  key_correct: z.boolean().describe("The ideal answer is factually right (for decide: a defensible best choice)"),
  mc_consistent: z.boolean().describe("The option at the keyed correct index says the same thing as the ideal answer"),
  ambiguous: z.boolean().describe("The question is too unclear or underspecified to grade fairly"),
  reason: z.string().describe("One sentence explaining any problem, or an empty string"),
});

export const BLIND_SYSTEM = `You are checking a short quiz question before a learner sees it. Answer it yourself, as an expert would, from the question alone.
Then pick the best multiple-choice option and say whether the question is ambiguous. A "decide" question (a judgment call at a fork in real work) is not ambiguous just because several options are defensible, as long as one is reasonably best; it is ambiguous only if the question lacks the information needed to choose.
${DATA_RULE}`;

export const JUDGE_SYSTEM = `You audit the answer key of a short quiz question generated for a learner. You see the question, the key, and an independent expert's blind answer.
Decide:
- key_correct: is the ideal answer right? For "decide" questions, is the keyed best choice defensible (not necessarily the only good one)?
- mc_consistent: does the option at the keyed correct index agree with the ideal answer, and is it the best option among those offered?
- ambiguous: is the question too unclear to grade fairly?
Use the blind answer as evidence, not as truth: if it disagrees with the key, work out which is right. Be strict about factual errors and contradictions, lenient about wording.
${DATA_RULE}`;

/** Structural checks that don't need a model. Returns a reason when the candidate is malformed. */
export function structuralProblem(c: LearningMomentInput): string | null {
  const { options, correct_index, why } = c.mc_fallback;
  if (correct_index < 0 || correct_index >= options.length) return "correct_index is out of range";
  if (why.length !== options.length) return "mc_fallback.why must have one entry per option";
  if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length) return "duplicate options";
  return null;
}

export const verifyMoment: ContentApi["verifyMoment"] = async ({ candidate }) => {
  const problem = structuralProblem(candidate);
  if (problem) return { ok: false, reason: problem };

  const blind = await callStructured({
    task: "verifyMoment.blind",
    route: MODELS.verify,
    system: BLIND_SYSTEM,
    user: `${renderQuestion(candidate)}\n\nOptions:\n${renderOptions(candidate)}`,
    schema: BlindOutputSchema,
    timeoutMs: 30_000,
  });

  const judge = await callStructured({
    task: "verifyMoment.judge",
    route: MODELS.verify,
    system: JUDGE_SYSTEM,
    user: [
      renderQuestion(candidate),
      "Answer key:",
      renderKey(candidate),
      `Independent blind answer: ${blind.answer}`,
      `Blind pick: option ${blind.best_option_index}${blind.ambiguous ? ` (flagged ambiguous: ${blind.ambiguity_note})` : ""}`,
    ].join("\n\n"),
    schema: JudgeOutputSchema,
    timeoutMs: 30_000,
  });

  return decide(candidate, judge);
};

export function decide(candidate: LearningMomentInput, judge: z.infer<typeof JudgeOutputSchema>): VerifyResult {
  const reason = judge.reason.trim();
  if (!judge.key_correct) return { ok: false, reason: reason || "answer key looks wrong" };
  if (!judge.mc_consistent) return { ok: false, reason: reason || "multiple-choice key contradicts the ideal answer" };
  // Decide moments legitimately admit several answers; a defensible keyed choice is enough.
  if (judge.ambiguous && candidate.type !== "decide") return { ok: false, reason: reason || "question is ambiguous" };
  return { ok: true };
}
