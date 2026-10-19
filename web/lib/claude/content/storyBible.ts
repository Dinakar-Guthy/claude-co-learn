/** generateStoryBible (Sonnet): a story whose world echoes the learner's topic, with a code-picked twist card for variety. */
import { z } from "zod";
import type { Intent, StoryBible } from "@/lib/contracts/session";
import { MODELS } from "@/lib/claude/models";
import { callStructured } from "./call";
import { asData, DATA_RULE, truncate } from "./prompt";
import { pickSeeds, type StorySeeds } from "./seeds";

export const BibleOutputSchema = z.object({
  genre: z.string().describe("The kind of story in a few words, drawn from the topic, e.g. 'Senate-house intrigue fable'"),
  narrator: z.string().describe("Who tells it, suited to the world, e.g. 'a retired legion scribe'"),
  tone: z.string().describe("A few words, e.g. 'warm, witty, hopeful'"),
  setting: z.string().describe("1-2 sentences; a world that echoes the topic"),
  protagonist: z.string().describe("Name and one-line description"),
  motif: z.string().describe("One recurring image or object tied to the topic (one sentence)"),
  arc: z.array(z.string()).describe("3-4 planned beats; the last resolves at the session wrap-up"),
});

export const BIBLE_SYSTEM = `You create the story bible for a short serialized reward story. The learner earns chapters by beating challenges while learning a topic (or doing real work); each chapter is 100-150 words.
Build the world from what the learner is studying, so the story feels like it belongs to the topic: for the Roman Republic, perhaps a city of senators, legions, and a contested forum; for training a model, perhaps a weather station whose apprentice learns to read the storms. Pick a genre and a narrator voice that fit that world. Use the given twist card somewhere in the arc.
Invent your own characters and events: don't retell the real history or teach the facts they are learning. Keep it a story, not a lesson, with one protagonist and a simple arc that is easy to follow.
Suitable for all ages: no violence beyond cartoon peril, no romance, no frightening content. Hopeful and playful.
${DATA_RULE}`;

export function biblePrompt(intent: Intent, seeds: StorySeeds): string {
  return [
    `Twist card (use it somewhere in the arc): ${seeds.twist}`,
    "What the learner is studying or working on (build the world from this):",
    asData("learner_goal", truncate(intent.goal, 600)),
  ].join("\n");
}

export async function generateStoryBible({ intent }: { intent: Intent }, rng: () => number = Math.random): Promise<StoryBible> {
  const seeds = pickSeeds(rng);
  const out = await callStructured({ task: "generateStoryBible", route: MODELS.story, system: BIBLE_SYSTEM, user: biblePrompt(intent, seeds), schema: BibleOutputSchema, timeoutMs: 120_000 });
  return {
    genre: out.genre.trim(),
    tone: out.tone.trim(),
    setting: out.setting.trim(),
    protagonist: out.protagonist.trim(),
    motif: out.motif.trim(),
    arc: out.arc.map((b) => b.trim()).filter(Boolean).slice(0, 5),
    seeds: { narrator: out.narrator.trim(), twist: seeds.twist },
  };
}
