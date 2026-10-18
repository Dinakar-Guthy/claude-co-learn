/** generateSketch (Opus, high): a light session sketch (not a curriculum) from the learner's intent. */
import { z } from "zod";
import type { ContentApi } from "@/lib/contracts/content";
import { MOMENT_TYPES } from "@/lib/contracts/moment";
import type { Intent, SessionSketch } from "@/lib/contracts/session";
import { MODELS } from "@/lib/claude/models";
import { callStructured } from "./call";
import { asData, DATA_RULE, truncate } from "./prompt";

export const SketchOutputSchema = z.object({
  title: z.string().describe("Short session title, at most 40 characters, no quotes"),
  goal_summary: z.string().describe("One sentence restating what the learner wants to get done"),
  novice: z.boolean().describe("True if the learner seems new to this area"),
  milestones: z.array(z.string()).describe("3-5 likely chunks of work, each a short phrase"),
  concept_radar: z
    .array(
      z.object({
        concept: z.string().describe("Short canonical concept name, lower case, e.g. 'class imbalance'"),
        why_it_matters: z.string().describe("One line: why this matters for this learner's goal"),
        likely_moment_type: z.enum(MOMENT_TYPES),
      }),
    )
    .describe("5-10 concepts likely to come up, most important first"),
});

export const SKETCH_SYSTEM = `You plan a short Co-learn session. In Co-learn a professional does real work with Claude, and at high-value moments Claude pauses to turn the work into a quick challenge the learner solves themselves (decide, predict, explain_back, spot_issue, fill_gap).

From the learner's goal, familiarity, and time budget, sketch the session lightly. This is not a curriculum: the work will change as it goes.
- title: at most 40 characters, specific to their task.
- milestones: 3-5 natural chunks of the work that fit the time budget, in order.
- concept_radar: 5-10 concepts the work will likely touch where the learner's own judgment matters most for their goal, each with why it matters and the moment type that fits best (decide at real forks, predict before results appear, spot_issue for pitfalls such as data leakage).
- novice: true if they are new to this area. Calibrate to their familiarity and how they phrase the goal.
${DATA_RULE}`;

const familiarityLabel: Record<Intent["familiarity"], string> = {
  new: "new to this area",
  some: "some experience",
  comfortable: "comfortable with this area",
};

export function sketchPrompt(intent: Intent): string {
  return [
    asData("learner_goal", truncate(intent.goal, 2000)),
    `Familiarity: ${familiarityLabel[intent.familiarity]}`,
    `Time budget: about ${intent.minutes} minutes`,
    intent.demo ? "Context: the learner started from the demo, training a churn-prediction model on a customer CSV (planted issues: class imbalance, a leaky column, missing values)." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const generateSketch: ContentApi["generateSketch"] = async ({ intent }) => {
  const out = await callStructured({ task: "generateSketch", route: MODELS.sketch, system: SKETCH_SYSTEM, user: sketchPrompt(intent), schema: SketchOutputSchema, timeoutMs: 180_000 });
  return normalizeSketch(out, intent);
};

export function normalizeSketch(out: z.infer<typeof SketchOutputSchema>, intent: Intent): SessionSketch {
  // Familiarity is the learner's own statement, so it overrides the model at the extremes.
  const novice = intent.familiarity === "new" ? true : intent.familiarity === "comfortable" ? false : out.novice;
  return {
    title: truncate(out.title.trim().replace(/^["']|["']$/g, ""), 40) || truncate(intent.goal, 40),
    goalSummary: out.goal_summary.trim(),
    novice,
    milestones: out.milestones.map((m) => m.trim()).filter(Boolean).slice(0, 5),
    conceptRadar: out.concept_radar
      .filter((c) => c.concept.trim())
      .slice(0, 10)
      .map((c) => ({ concept: truncate(c.concept.trim(), 60), whyItMatters: c.why_it_matters.trim(), likelyMomentType: c.likely_moment_type })),
  };
}
