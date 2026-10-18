/** generateChapter (Sonnet): one 150-250 word chapter, continuous with earlier summaries and shaped by the beat. */
import { z } from "zod";
import type { ContentApi } from "@/lib/contracts/content";
import type { BossOutcome } from "@/lib/contracts/engine";
import { MODELS } from "@/lib/claude/models";
import { callStructured } from "./call";
import { bullets, truncate } from "./prompt";

export const ChapterOutputSchema = z.object({
  title: z.string().describe("Chapter title, at most 8 words"),
  text: z.string().describe("The chapter, 150-250 words, in short paragraphs separated by blank lines"),
  summary: z.string().describe("1-2 sentence summary for continuity in later chapters"),
});

export const CHAPTER_SYSTEM = `You write one chapter of a short serialized reward story, following the story bible exactly (genre, narrator voice, tone, protagonist, setting, motif).
- 150-250 words, short paragraphs, vivid and concrete. Vary sentence rhythm and avoid stock phrases.
- Continue from the previous chapter summaries without contradicting them. Advance the arc by one beat.
- Suitable for all ages: cartoon peril at most, kind and hopeful.
- Never mention quizzes, XP, scores, or the learner directly. The motif may echo their work lightly.`;

const BEAT_GUIDE: Record<BossOutcome | "wrapup", string> = {
  flawless: "The heroes win brilliantly: a triumphant, joyful chapter with a moment of earned pride.",
  victory: "The heroes win after a real struggle: triumphant and warm.",
  retreat: "The challenge slips away for now: end on a hopeful cliffhanger where the heroes regroup and learn something. Never punishing or sad.",
  wrapup: "This is the closing chapter for this session: resolve the current thread warmly and leave a small hook for a future adventure.",
};

type ChapterInput = Parameters<ContentApi["generateChapter"]>[0];

export function chapterPrompt(input: ChapterInput): string {
  const { bible } = input;
  const beat = input.beat === "wrapup" ? BEAT_GUIDE.wrapup : BEAT_GUIDE[input.performance ?? "victory"];
  return [
    "Story bible:",
    `- Genre: ${bible.genre}`,
    `- Narrator voice: ${bible.seeds.narrator}`,
    `- Tone: ${bible.tone}`,
    `- Setting: ${bible.setting}`,
    `- Protagonist: ${bible.protagonist}`,
    `- Motif: ${bible.motif}`,
    `- Twist card: ${bible.seeds.twist}`,
    `- Planned arc:\n${bullets(bible.arc.map((b, i) => `${i + 1}. ${b}`))}`,
    `Previous chapters (${input.previous.length}):\n${bullets(input.previous.map((c) => `${c.title}: ${c.summary}`))}`,
    `This chapter's beat (${input.beat === "boss" ? "a boss challenge just ended" : "session wrap-up"}): ${beat}`,
  ].join("\n");
}

export const generateChapter: ContentApi["generateChapter"] = async (input) => {
  const out = await callStructured({ task: "generateChapter", route: MODELS.story, system: CHAPTER_SYSTEM, user: chapterPrompt(input), schema: ChapterOutputSchema, timeoutMs: 120_000 });
  return { title: truncate(out.title.trim(), 80), text: out.text.trim(), summary: out.summary.trim() };
};
