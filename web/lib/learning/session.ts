/** Session creation and background enrichment (sketch + story bible). */
import { z } from "zod";
import type { CreateSessionResponse } from "@/lib/contracts/api";
import { initialEngineState } from "@/lib/contracts/engine";
import type { Intent, Session } from "@/lib/contracts/session";
import type { HandlerResult, LearningDeps } from "./deps";
import { patchSession } from "./sessionStore";

export const IntentSchema = z.object({
  goal: z.string().trim().min(1, "Tell us what you're working on").max(2000),
  familiarity: z.enum(["new", "some", "comfortable"]),
  minutes: z.number().int().min(5).max(120).default(10),
  demo: z.boolean().default(false),
});
export const CreateSessionRequestSchema = z.object({ intent: IntentSchema });

/** A provisional title from the goal (≤ 40 chars, cut at a word boundary); the sketch replaces it later. */
export function titleFromGoal(goal: string, max = 40): string {
  const clean = goal.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max / 2 ? cut.slice(0, atWord) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

export async function createSession(deps: LearningDeps, anonId: string, intent: Intent): Promise<HandlerResult<CreateSessionResponse>> {
  const now = deps.now();
  const session: Session = {
    id: deps.newId(),
    anonId,
    createdAt: now,
    title: titleFromGoal(intent.goal),
    intent,
    fileIds: [],
    demoFileAttached: false,
    status: "active",
    engine: initialEngineState(),
    story: { chapters: [] },
  };
  await deps.store.putSession(session);
  await deps.store.putTranscript(session.id, []);
  await deps.store.logEvent({ at: now, anonId, sessionId: session.id, name: "session_created", props: { demo: intent.demo, familiarity: intent.familiarity, minutes: intent.minutes } });
  return { body: { sessionId: session.id }, background: [() => enrichSession(deps, session.id)] };
}

/**
 * Generates the sketch and story bible in parallel, then patches only `sketch`, `title`, and
 * `story.bible` onto the latest session (the work loop writes engine/containerId/fileIds concurrently).
 */
export async function enrichSession(deps: LearningDeps, sessionId: string): Promise<void> {
  const session = await deps.store.getSession(sessionId);
  if (!session) return;
  // The primer is the fastest call and is meant to appear during the first work turn, so it saves on its own.
  const primerTask =
    session.intent.familiarity === "new" && !session.primer
      ? deps.content.generatePrimer({ intent: session.intent }).then((draft) =>
          patchSession(deps, sessionId, (latest) => ({ primer: latest.primer ?? { ...draft, createdAt: deps.now() } })),
        )
      : Promise.resolve(null);
  const [sketch, bible, primer] = await Promise.allSettled([
    deps.content.generateSketch({ intent: session.intent }),
    session.story.bible ? Promise.resolve(session.story.bible) : deps.content.generateStoryBible({ intent: session.intent }),
    primerTask,
  ]);
  await patchSession(deps, sessionId, (latest) => ({
    ...(sketch.status === "fulfilled" ? { sketch: sketch.value, title: sketch.value.title || latest.title } : {}),
    story: { ...latest.story, bible: latest.story.bible ?? (bible.status === "fulfilled" ? bible.value : undefined) },
  }));
  for (const r of [sketch, bible, primer]) {
    if (r.status === "rejected") {
      await deps.store.logEvent({ at: deps.now(), anonId: session.anonId, sessionId, name: "error", props: { where: "enrichSession", message: String(r.reason).slice(0, 200) } });
    }
  }
}
