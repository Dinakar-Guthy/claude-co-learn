/** Story bible and chapter generation, persisted as race-safe patches on the session. */
import type { BossOutcome } from "@/lib/contracts/engine";
import type { StoryBible, StoryChapter } from "@/lib/contracts/session";
import { ContentRefusalError } from "@/lib/claude/content/errors";
import type { LearningDeps } from "./deps";
import { appendTranscript, patchSession } from "./sessionStore";

export async function ensureBible(deps: LearningDeps, sessionId: string): Promise<StoryBible | null> {
  const session = await deps.store.getSession(sessionId);
  if (!session) return null;
  if (session.story.bible) return session.story.bible;
  const bible = await deps.content.generateStoryBible({ intent: session.intent });
  const saved = await patchSession(deps, sessionId, (latest) => ({ story: { ...latest.story, bible: latest.story.bible ?? bible } }));
  return saved?.story.bible ?? bible;
}

/** Shown if the story model declines: gentle, generic, and still continues the session's story. */
export function fallbackChapter(beat: "boss" | "wrapup", performance?: BossOutcome): Omit<StoryChapter, "id" | "createdAt" | "trigger"> {
  const ending =
    beat === "wrapup"
      ? "As the lanterns dimmed, the crew agreed it had been a good day's journey, and somewhere ahead a new path was already waiting."
      : performance === "retreat"
        ? "The trouble slipped away into the fog for now. The crew traded a knowing look: next time, they would be ready."
        : "With a final clever move the trouble was undone, and a cheer rang out across the deck.";
  return {
    title: beat === "wrapup" ? "Lanterns at Dusk" : "A Turn in the Tale",
    text: `The wind changed, as it always did when something important was about to happen. Our travellers checked their maps, compared notes, and listened to the small voice of experience that had been growing louder all day.\n\n${ending}`,
    summary: beat === "wrapup" ? "The crew rested after a day of progress, with a new path ahead." : "The crew faced a challenge and pressed on together.",
  };
}

/**
 * Generates and appends the chapter for `trigger` (idempotent per trigger), generating the bible
 * first if the background job hasn't produced one yet. Null when the session's mode has no story.
 */
export async function addChapter(
  deps: LearningDeps,
  sessionId: string,
  trigger: string,
  beat: "boss" | "wrapup",
  performance?: BossOutcome,
): Promise<StoryChapter | null> {
  const session = await deps.store.getSession(sessionId);
  if (!session?.story.enabled) return null;
  const existing = session.story.chapters.find((c) => c.trigger === trigger);
  if (existing) return existing;

  const bible = await ensureBible(deps, sessionId);
  if (!bible) return null;

  let draft: Omit<StoryChapter, "id" | "createdAt" | "trigger">;
  try {
    const previous = session.story.chapters.map(({ title, summary }) => ({ title, summary }));
    draft = await deps.content.generateChapter({ bible, previous, trigger, beat, performance });
  } catch (err) {
    if (!(err instanceof ContentRefusalError)) throw err;
    draft = fallbackChapter(beat, performance);
  }

  const chapter: StoryChapter = { id: deps.newId(), trigger, createdAt: deps.now(), ...draft };
  const saved = await patchSession(deps, sessionId, (latest) => ({
    story: {
      ...latest.story,
      chapters: latest.story.chapters.some((c) => c.trigger === trigger) ? latest.story.chapters : [...latest.story.chapters, chapter],
    },
  }));
  const stored = saved?.story.chapters.find((c) => c.trigger === trigger) ?? chapter;
  if (stored.id === chapter.id) await appendTranscript(deps, sessionId, { kind: "story", id: `story-${chapter.id}`, chapterId: chapter.id });
  return stored;
}
