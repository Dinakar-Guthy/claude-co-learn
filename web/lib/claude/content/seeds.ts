/**
 * Story variety without temperature control: a twist card is drawn in code and injected into the prompt.
 * The world, genre, and narrator come from the topic instead (Dinakar, 2026-10-19: stories echo the topic).
 */
export const TWISTS = [
  "the villain turns out to be a misunderstood helper",
  "a map is upside down",
  "two rivals must share one key",
  "the treasure is a lesson, not gold",
  "a tiny creature holds the answer",
  "the weather itself is a character",
  "an old message arrives decades late",
  "the hero's sidekick knew all along",
] as const;

export interface StorySeeds {
  twist: string;
}

type Rng = () => number;

const pick = <T,>(list: readonly T[], rng: Rng): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

export function pickSeeds(rng: Rng = Math.random): StorySeeds {
  return { twist: pick(TWISTS, rng) };
}
