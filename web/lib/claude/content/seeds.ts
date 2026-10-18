/**
 * Story variety without temperature control: seeds are drawn in code and injected into the prompt.
 */
export const GENRES = [
  "cozy space opera",
  "seaside mystery",
  "clockwork fantasy",
  "deep-sea expedition",
  "desert caravan adventure",
  "haunted library comedy",
  "mountain rescue tale",
  "sky-pirate romp",
  "jungle-ruins quest",
  "time-travel caper",
  "dragon-sanctuary fable",
  "solarpunk city heist",
] as const;

export const NARRATORS = [
  "a wry ship's computer",
  "a breathless sports commentator",
  "an old lighthouse keeper telling it years later",
  "a nervous apprentice writing in a journal",
  "a cheerful talking map",
  "a noir detective",
  "a grandparent at bedtime",
  "a field naturalist taking notes",
] as const;

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
  genre: string;
  narrator: string;
  twist: string;
}

type Rng = () => number;

const pick = <T,>(list: readonly T[], rng: Rng): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

export function pickSeeds(rng: Rng = Math.random): StorySeeds {
  return { genre: pick(GENRES, rng), narrator: pick(NARRATORS, rng), twist: pick(TWISTS, rng) };
}
