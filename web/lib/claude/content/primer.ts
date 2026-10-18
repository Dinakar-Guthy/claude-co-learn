/**
 * generatePrimer (Sonnet, low effort): a 60-second primer for learners who chose "New to this"
 * (decision log 2026-10-18). Foundations only: it must not give away the pitfalls the work will surface.
 */
import { z } from "zod";
import type { ContentApi } from "@/lib/contracts/content";
import { MODELS } from "@/lib/claude/models";
import { callStructured } from "./call";
import { asData, DATA_RULE, truncate } from "./prompt";

export const PrimerOutputSchema = z.object({
  ideas: z.array(z.string()).describe("3-4 key ideas, each one short markdown line (≤ 30 words) that starts with the **term** in bold"),
  check: z.object({
    question: z.string().describe("One easy warm-up question applying one of the ideas"),
    options: z.array(z.string()).describe("Exactly 3 options of similar length"),
    correct_index: z.number().int().describe("0-based index of the right option"),
    why: z.array(z.string()).describe("One short explanation per option, same order"),
  }),
});

export const PRIMER_SYSTEM = `You write a 60-second primer for a professional who is new to the area of their task. They read it while Claude starts working on that task with them, so it should make the next 10 minutes easier to follow.
- 3-4 key ideas they're about to meet, as plain-language one-liners (at most 30 words each, ≤ 120 words in total), each starting with the **term** in bold. Foundations only: what the main pieces are and what they're for.
- Don't give away pitfalls or decisions they'll discover in the work itself (for a modelling task: don't mention data leakage, class imbalance tricks, or which metric to choose). They'll get to make those calls.
- Then one easy warm-up multiple-choice question (3 options of similar length) that applies one of the ideas, with a short why for each option.
- Warm and encouraging. No jargon beyond the terms you define.
${DATA_RULE}`;

export const generatePrimer: ContentApi["generatePrimer"] = async ({ intent }) => {
  const user = [
    asData("learner_goal", truncate(intent.goal, 2000)),
    intent.demo ? "Context: the demo task, training a churn-prediction model on a customer CSV." : "",
  ]
    .filter(Boolean)
    .join("\n");
  const out = await callStructured({ task: "generatePrimer", route: MODELS.primer, system: PRIMER_SYSTEM, user, schema: PrimerOutputSchema, timeoutMs: 60_000 });
  const n = Math.min(out.check.options.length, out.check.why.length, 4);
  const correctIndex = Math.min(Math.max(0, out.check.correct_index), n - 1);
  return {
    ideas: out.ideas.map((i) => i.trim()).filter(Boolean).slice(0, 4),
    check: {
      question: out.check.question.trim(),
      options: out.check.options.slice(0, n).map((o) => o.trim()),
      correctIndex,
      why: out.check.why.slice(0, n).map((w) => w.trim()),
    },
  };
};
