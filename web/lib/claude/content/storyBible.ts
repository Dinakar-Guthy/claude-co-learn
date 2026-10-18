/** generateStoryBible (Sonnet): a surprise-genre story lightly themed to the learner's work, from code-picked seeds. */
import { z } from "zod";
import type { Intent, StoryBible } from "@/lib/contracts/session";
import { MODELS } from "@/lib/claude/models";
import { callStructured } from "./call";
import { asData, DATA_RULE, truncate } from "./prompt";
import { pickSeeds, type StorySeeds } from "./seeds";

export const BibleOutputSchema = z.object({
  tone: z.string().describe("A few words, e.g. 'warm, witty, hopeful'"),
  setting: z.string().describe("1-2 sentences"),
  protagonist: z.string().describe("Name and one-line description"),
  motif: z.string().describe("A light, playful echo of the learner's work woven into the world (one sentence)"),
  arc: z.array(z.string()).describe("3-4 planned beats; the last resolves at the session wrap-up"),
});

export const BIBLE_SYSTEM = `You create the story bible for a short serialized reward story. The learner earns chapters by beating challenges while doing real work; each chapter is 150-250 words.
Use the given genre, narrator voice, and twist card. Theme the world lightly to the learner's work through a motif (for model training, perhaps a lighthouse that learns to predict storms), but keep it a story, not a lesson.
Suitable for all ages: no violence beyond cartoon peril, no romance, no frightening content. Hopeful and playful.
${DATA_RULE}`;

export function biblePrompt(intent: Intent, seeds: StorySeeds): string {
  return [
    `Genre: ${seeds.genre}`,
    `Narrator voice: ${seeds.narrator}`,
    `Twist card (use it somewhere in the arc): ${seeds.twist}`,
    "The learner's work, for the motif:",
    asData("learner_goal", truncate(intent.goal, 600)),
  ].join("\n");
}

export async function generateStoryBible({ intent }: { intent: Intent }, rng: () => number = Math.random): Promise<StoryBible> {
  const seeds = pickSeeds(rng);
  const out = await callStructured({ task: "generateStoryBible", route: MODELS.story, system: BIBLE_SYSTEM, user: biblePrompt(intent, seeds), schema: BibleOutputSchema, timeoutMs: 120_000 });
  return {
    genre: seeds.genre,
    tone: out.tone.trim(),
    setting: out.setting.trim(),
    protagonist: out.protagonist.trim(),
    motif: out.motif.trim(),
    arc: out.arc.map((b) => b.trim()).filter(Boolean).slice(0, 5),
    seeds: { narrator: seeds.narrator, twist: seeds.twist },
  };
}
