/** Renders a learning-moment candidate into prompt text (answer key included or withheld). */
import type { LearningMomentInput } from "@/lib/contracts/moment";
import { bullets } from "./prompt";

const TYPE_HINTS: Record<LearningMomentInput["type"], string> = {
  decide: "a decision at a real fork in the work; several answers can be defensible, so the reasoning matters most",
  predict: "a prediction about what will happen before code runs",
  explain_back: "explaining, in their own words, why something was done",
  spot_issue: "finding a problem in code, data, or a setup",
  fill_gap: "choosing a sensible value or small detail",
};

export function describeType(type: LearningMomentInput["type"]): string {
  return TYPE_HINTS[type];
}

export function renderQuestion(c: LearningMomentInput): string {
  const lines = [`Moment type: ${c.type} (${describeType(c.type)})`, `Concept: ${c.concept}`];
  if (c.concept_card) lines.push(`Concept card shown to the learner: ${c.concept_card}`);
  lines.push(`Question: ${c.question}`);
  return lines.join("\n");
}

export function renderOptions(c: LearningMomentInput): string {
  return c.mc_fallback.options.map((o, i) => `${i}. ${o}`).join("\n");
}

export function renderKey(c: LearningMomentInput): string {
  const { rubric, mc_fallback: mc } = c;
  return [
    `Ideal answer: ${c.ideal_answer}`,
    `Key points:\n${bullets(rubric.key_points)}`,
    `Acceptable variants:\n${bullets(rubric.acceptable_variants ?? [])}`,
    `Known misconceptions:\n${bullets(rubric.misconceptions ?? [])}`,
    `Multiple-choice options (keyed correct index ${mc.correct_index}):\n${renderOptions(c)}`,
  ].join("\n\n");
}
