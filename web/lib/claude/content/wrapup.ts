/** generateWrapUp (Sonnet): codex lines + "next time you could…" suggestions. Results are classified in code from scores. */
import { z } from "zod";
import type { ContentApi, WrapUpDraft } from "@/lib/contracts/content";
import { MODELS } from "@/lib/claude/models";
import { callStructured } from "./call";
import { asData, bullets, DATA_RULE, truncate } from "./prompt";

export const WrapUpOutputSchema = z.object({
  codex: z.array(
    z.object({
      concept: z.string().describe("Concept name exactly as given"),
      summary: z.string().describe("One line (at most 20 words): the takeaway, tied to their work"),
    }),
  ),
  suggestions: z.array(z.string()).describe("2-3 concrete next tasks, imperative, without a 'Next time you could' prefix"),
});

export const WRAPUP_SYSTEM = `You write the wrap-up for a Co-learn session, where a professional did real work with Claude and practised concepts along the way.
- codex: one entry per concept given, in the same order, with a one-line takeaway (at most 20 words) tied to what they actually did. Plain words, no jargon beyond the concept itself.
- suggestions: 2-3 concrete next steps, each a short task the learner could start as their next session (imperative, e.g. "Pick a decision threshold from real offer costs"), building on their work and on the concepts that still need practice. The UI shows them under the heading "Next time you could…", so don't start with that phrase.
Warm and specific; never grade or scold.
${DATA_RULE}`;

/** Learn mode: the session was a lesson on a topic, so suggestions are what to learn next. */
export const WRAPUP_SYSTEM_LEARN = `You write the wrap-up for a Learn session, where Claude tutored the learner on a topic of their choice and they answered questions along the way.
- codex: one entry per concept given, in the same order, with a one-line takeaway (at most 20 words) in plain words about what they now understand.
- suggestions: 2-3 topics to learn next, each phrased as a request the learner could start their next Learn session with (imperative, e.g. "Teach me how Augustus turned the Republic into an empire"): the natural sequel, a deeper look at a concept that still needs practice, or a connected topic. The UI shows them under the heading "Next time you could…", so don't start with that phrase.
Warm and specific; never grade or scold.
${DATA_RULE}`;

type Outcome = { concept: string; type: string; score: number };
export type CodexResult = WrapUpDraft["codex"][number]["result"];

/** Average score per concept → strong (≥ 0.8), growing (≥ 0.5), or review. */
export function classifyConcepts(outcomes: Outcome[]): { concept: string; avg: number; result: CodexResult }[] {
  const byConcept = new Map<string, number[]>();
  for (const o of outcomes) byConcept.set(o.concept, [...(byConcept.get(o.concept) ?? []), o.score]);
  return [...byConcept.entries()].map(([concept, scores]) => {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { concept, avg, result: avg >= 0.8 ? "strong" : avg >= 0.5 ? "growing" : "review" };
  });
}

type WrapUpInput = Parameters<ContentApi["generateWrapUp"]>[0];

export function wrapUpPrompt(input: WrapUpInput, classified: ReturnType<typeof classifyConcepts>): string {
  return [
    asData("learner_goal", truncate(input.intent.goal, 1000)),
    `Concepts practised (average score 0-1, result):\n${bullets(classified.map((c) => `${c.concept}: ${c.avg.toFixed(2)}, ${c.result}`))}`,
    input.intent.mode === "learn" ? "What they learned:" : "What they built:",
    asData("work_summary", truncate(input.workSummary, 2500) || "(no details)"),
  ].join("\n\n");
}

export const generateWrapUp: ContentApi["generateWrapUp"] = async (input) => {
  const classified = classifyConcepts(input.outcomes);
  const out = await callStructured({ task: "generateWrapUp", route: MODELS.wrapup, system: input.intent.mode === "learn" ? WRAPUP_SYSTEM_LEARN : WRAPUP_SYSTEM, user: wrapUpPrompt(input, classified), schema: WrapUpOutputSchema, timeoutMs: 120_000 });
  const summaries = new Map(out.codex.map((c) => [c.concept.trim().toLowerCase(), c.summary.trim()]));
  return {
    codex: classified.map((c, i) => ({
      concept: c.concept,
      summary: summaries.get(c.concept.toLowerCase()) ?? out.codex[i]?.summary.trim() ?? "",
      result: c.result,
    })),
    suggestions: out.suggestions.map(stripLeadIn).filter(Boolean).slice(0, 3),
  };
};

/** "Next time you could pick a threshold…" → "Pick a threshold…" (the UI already shows the lead-in). */
export function stripLeadIn(suggestion: string): string {
  const rest = suggestion.trim().replace(/^next time,?\s+you could\s+/i, "").replace(/[….]+$/, "").trim();
  return rest ? rest[0].toUpperCase() + rest.slice(1) : "";
}
