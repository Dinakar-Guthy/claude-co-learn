/** gradeAnswer (Haiku): grade a free-form answer against the rubric, with a short encouraging "why" (P3). */
import { z } from "zod";
import type { ContentApi, GradeResult } from "@/lib/contracts/content";
import { MODELS } from "@/lib/claude/models";
import { callStructured } from "./call";
import { renderKey, renderQuestion } from "./candidate";
import { asData, DATA_RULE, truncate } from "./prompt";

export const GradeOutputSchema = z.object({
  verdict: z.enum(["correct", "partial", "incorrect"]),
  why: z.string().describe("1-2 encouraging sentences explaining the reasoning behind the verdict, addressed to the learner"),
  missing_points: z.array(z.string()).describe("Key points the answer missed; empty if none"),
  misconception: z.string().nullable().describe("A misconception the answer shows, or null"),
});

export const GRADE_SYSTEM = `You grade a learner's short answer to a learning moment that came up while they did real work with Claude.

Verdicts:
- correct: the answer captures the core of the ideal answer or an acceptable variant. Terse is fine: a few words that are right earn "correct". Do not demand the exact wording, every key point, or extra detail the question didn't ask for.
- partial: on the right track but missing an essential point, or right conclusion with shaky reasoning.
- incorrect: wrong, off-topic, empty, "I don't know", or built on a misconception.

For "decide" moments several choices can be defensible. Grade the reasoning: a defensible choice with a sound reason is correct even if it differs from the ideal answer. A choice with no reason is at most partial.

The "why" (1-2 sentences, plain words, second person) explains the reasoning, not just the verdict. Be warm and specific; never scold. For partial or incorrect answers, name what's missing or the better idea so the learner learns from it immediately.
Exception: when the request says a multiple-choice retry follows, an "incorrect" why must NOT state or paraphrase the correct answer (the learner is about to pick from options that include it). Instead name the consideration they overlooked as a hint (e.g. "Think about which mistake costs more here."). The full explanation is shown after they pick. This exception is ONLY for "incorrect": a "partial" answer gets no retry, so its why must state the missing idea plainly (e.g. "It's only filled in after a customer decides to leave, so it won't exist at prediction time.").
List missing key points (short phrases). If the answer matches a known misconception, name it.

${DATA_RULE}`;

export const gradeAnswer: ContentApi["gradeAnswer"] = async ({ candidate, answer, retryAvailable = false, sessionLog }) => {
  const user = [
    ...(sessionLog
      ? [
          "This question is about what actually happened in the learner's session. Grade against the session log below; where the answer key's expected numbers differ from what really happened, the log wins.",
          asData("session_log", truncate(sessionLog, 3000)),
        ]
      : []),
    ...(retryAvailable ? ["If (and only if) your verdict is incorrect, a multiple-choice retry follows: keep that why a hint, don't reveal the answer. Partial and correct verdicts get the full explanation."] : []),
    renderQuestion(candidate),
    "Answer key (hidden from the learner):",
    renderKey(candidate),
    "The learner's answer:",
    asData("learner_answer", truncate(answer.trim(), 2000) || "(empty)"),
  ].join("\n\n");

  const out = await callStructured({ task: "gradeAnswer", route: MODELS.grade, system: GRADE_SYSTEM, user, schema: GradeOutputSchema, timeoutMs: 45_000 });
  const result: GradeResult = {
    verdict: out.verdict,
    why: out.why.trim(),
    missingPoints: out.missing_points.map((p) => p.trim()).filter(Boolean),
  };
  if (out.misconception?.trim()) result.misconception = out.misconception.trim();
  return result;
};
