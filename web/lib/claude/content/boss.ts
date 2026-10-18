/** generateBoss (Sonnet, high): 2-3 linked application questions recombining recent concepts and real work details. */
import { z } from "zod";
import type { BossDraft, ContentApi } from "@/lib/contracts/content";
import { LearningMomentInputSchema, type LearningMomentInput } from "@/lib/contracts/moment";
import { MODELS } from "@/lib/claude/models";
import { callStructured } from "./call";
import { ContentShapeError } from "./errors";
import { asData, bullets, DATA_RULE, truncate } from "./prompt";

const BossQuestionSchema = z.object({
  type: z.enum(["explain_back", "spot_issue", "decide", "predict", "fill_gap"]),
  concept: z.string().describe("Short canonical concept name this question mainly tests"),
  question: z.string().describe("One clear question answerable in 1-3 sentences, using concrete details from the work"),
  ideal_answer: z.string(),
  key_points: z.array(z.string()).describe("1-4 points a good answer covers"),
  acceptable_variants: z.array(z.string()),
  misconceptions: z.array(z.string()),
  mc_options: z.array(z.string()).describe("Exactly 4 options of similar length and detail (the correct one must not stand out as the longest); distractors reflect real misconceptions"),
  mc_correct_index: z.number().int().describe("0-based index of the best option; it must agree with ideal_answer"),
  mc_why: z.array(z.string()).describe("One short explanation per option, same order as mc_options"),
  difficulty: z.number().int().describe("1-5"),
});

export const BossOutputSchema = z.object({
  name: z.string().describe("Playful boss name tied to the work, e.g. 'The Overfit Bug'"),
  ascii: z.enum(["bug", "slime", "ghost"]),
  intro: z.string().describe("1-2 playful sentences introducing the boss"),
  questions: z.array(BossQuestionSchema).describe("2-3 linked questions"),
});

export const BOSS_SYSTEM = `You design a short "boss" challenge for Co-learn: a checkpoint after a chunk of real work, where the learner recombines the concepts they just practised.

Write 2-3 linked application questions:
- Ground them in the learner's actual work: reuse real numbers, column names, and results from the work summary (e.g. "Train recall is 0.98 but test recall is 0.52. What's happening, and what's your first fix?").
- Link them: one scenario that develops across questions (diagnose, then fix, then predict the effect), each combining two or more of the given concepts where possible.
- Application and analysis, not recall of definitions. Each is answerable in 1-3 sentences.
- Aim near the target difficulty (1-5 scale, where the learner should succeed about 70% of the time). If misconceptions are listed, give the learner a fair chance to show they've moved past them.
- Every question needs an ideal answer, a rubric, and a 4-option multiple-choice fallback whose keyed option agrees with the ideal answer, with one short why per option.

Also give the boss a playful name tied to the work (e.g. "The Overfit Bug", "The Leaky Ghost"), choose an ascii character (bug, slime, or ghost) that fits, and write a 1-2 sentence intro. Keep the tone light and friendly, never threatening.
${DATA_RULE}`;

type BossInput = Parameters<ContentApi["generateBoss"]>[0];

export function bossPrompt(input: BossInput): string {
  return [
    asData("learner_goal", truncate(input.intent.goal, 1000)),
    `Learner familiarity: ${input.familiarity}`,
    `Target difficulty: ${input.targetDifficulty}`,
    `Concepts practised since the last boss:\n${bullets(input.concepts)}`,
    `Recent misconceptions or gaps:\n${bullets(input.misconceptions)}`,
    "What was built so far (assistant notes and real code output):",
    asData("work_summary", truncate(input.workSummary, 2500) || "(no details yet)"),
  ].join("\n\n");
}

/** Maps a raw boss question onto the moment contract, trimming to its limits. Returns null if unusable. */
export function toMomentInput(q: z.infer<typeof BossQuestionSchema>): LearningMomentInput | null {
  const n = Math.min(q.mc_options.length, q.mc_why.length, 4);
  if (n < 3 || q.mc_correct_index < 0 || q.mc_correct_index >= n) return null;
  const draft: LearningMomentInput = {
    type: q.type,
    concept: truncate(q.concept.trim(), 60),
    question: truncate(q.question.trim(), 600),
    ideal_answer: truncate(q.ideal_answer.trim(), 1200),
    rubric: {
      key_points: q.key_points.map((s) => s.trim()).filter(Boolean).slice(0, 6),
      acceptable_variants: q.acceptable_variants.map((s) => s.trim()).filter(Boolean).slice(0, 6),
      misconceptions: q.misconceptions.map((s) => s.trim()).filter(Boolean).slice(0, 6),
    },
    mc_fallback: {
      options: q.mc_options.slice(0, n).map((s) => s.trim()),
      correct_index: q.mc_correct_index,
      why: q.mc_why.slice(0, n).map((s) => s.trim()),
    },
    difficulty: Math.min(5, Math.max(1, Math.round(q.difficulty))),
    first_exposure: false,
    learning_value: 5,
    value_reason: "Boss review: recombines concepts from this chunk of work.",
    costly_mistake: false,
    timing: "after_step",
  };
  if (!draft.rubric.key_points.length) draft.rubric.key_points = [draft.ideal_answer.slice(0, 200)];
  const parsed = LearningMomentInputSchema.safeParse(draft);
  return parsed.success ? parsed.data : null;
}

export const generateBoss: ContentApi["generateBoss"] = async (input) => {
  const out = await callStructured({ task: "generateBoss", route: MODELS.boss, system: BOSS_SYSTEM, user: bossPrompt(input), schema: BossOutputSchema, timeoutMs: 180_000 });
  return normalizeBoss(out);
};

export function normalizeBoss(out: z.infer<typeof BossOutputSchema>): BossDraft {
  const questions = out.questions.map(toMomentInput).filter((q): q is LearningMomentInput => q !== null).slice(0, 3);
  if (!questions.length) throw new ContentShapeError("generateBoss", "no usable boss questions");
  return {
    name: truncate(out.name.trim(), 40) || "The Bug",
    ascii: out.ascii,
    intro: truncate(out.intro.trim(), 300),
    questions,
  };
}
