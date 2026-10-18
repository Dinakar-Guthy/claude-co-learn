/**
 * Learning-moment contract: the `learning_moment` tool Claude calls during a work turn,
 * and the client-safe view of a moment. See docs/design-plan.md §6.
 */
import { z } from "zod";

export const MOMENT_TYPES = ["decide", "predict", "explain_back", "spot_issue", "fill_gap"] as const;
export type MomentType = (typeof MOMENT_TYPES)[number];

/** Input Claude supplies when it calls the `learning_moment` tool. */
export const LearningMomentInputSchema = z.object({
  type: z.enum(MOMENT_TYPES),
  concept: z.string().min(1).max(60),
  concept_card: z.string().max(600).optional(),
  question: z.string().min(1).max(600),
  ideal_answer: z.string().min(1).max(1200),
  rubric: z.object({
    key_points: z.array(z.string()).min(1).max(6),
    acceptable_variants: z.array(z.string()).max(6).optional(),
    misconceptions: z.array(z.string()).max(6).optional(),
  }),
  mc_fallback: z.object({
    options: z.array(z.string()).min(3).max(4),
    correct_index: z.number().int().min(0).max(3),
    why: z.array(z.string()).min(3).max(4),
  }),
  difficulty: z.number().int().min(1).max(5),
  first_exposure: z.boolean(),
  learning_value: z.number().int().min(1).max(5),
  value_reason: z.string().max(300),
  costly_mistake: z.boolean(),
  timing: z.enum(["before_step", "after_step"]),
});
export type LearningMomentInput = z.infer<typeof LearningMomentInputSchema>;

/** Input for `resolve_prediction`, called after real code output is available. */
export const ResolvePredictionInputSchema = z.object({
  moment_id: z.string(),
  actual_result: z.string().max(600),
  verdict: z.enum(["correct", "partial", "incorrect"]),
  why: z.string().max(600),
});
export type ResolvePredictionInput = z.infer<typeof ResolvePredictionInputSchema>;

/** Input for `milestone_reached`, called when a chunk of work completes. */
export const MilestoneInputSchema = z.object({
  label: z.string().max(120),
  summary: z.string().max(600),
  concepts_involved: z.array(z.string()).max(10),
});
export type MilestoneInput = z.infer<typeof MilestoneInputSchema>;

export type Verdict = "correct" | "partial" | "incorrect";
export type MomentStatus =
  | "awaiting_answer"
  | "awaiting_prediction_result" // predict: answer recorded, waiting for resolve_prediction
  | "answered"
  | "skipped"
  | "deferred"
  | "reported"
  | "revealed"; // the learner asked for the answer before attempting (after one gentle nudge): no credit, goes to review

/** How much help the learner used before their (final) answer. "teach" covers both Teach me and Ask Claude. */
export type HelpLevel = "hint" | "teach";

export interface HelpMessage {
  role: "learner" | "claude";
  text: string;
  at: number;
}

/** Learner-requested help on one question (hints, a short lesson, and a small Ask Claude thread). */
export interface MomentHelpView {
  hints: string[];
  lesson?: string;
  thread: HelpMessage[];
}

/** What the browser is allowed to see. Never includes ideal_answer, rubric, or correct_index. */
export interface MomentView {
  id: string;
  sessionId: string;
  type: MomentType | "boss";
  concept: string;
  conceptCard?: string;
  question: string;
  mcOptions?: string[]; // only once MC fallback is offered
  status: MomentStatus;
  bossId?: string;
  answer?: string;
  mcChoice?: number;
  verdict?: Verdict;
  why?: string;
  correctIndex?: number; // only revealed after an MC answer
  xp?: number;
  help?: MomentHelpView;
  /** Help used before the final answer (drives reduced credit). */
  helpLevel?: HelpLevel;
  /** The ideal answer, only once it's revealed: answered, skipped ("See the answer"), or revealed. */
  answerExplanation?: string;
  /** Saved predict questions are re-asked at wrap-up as "what happened, and why?". */
  explainAtWrapUp?: boolean;
}
