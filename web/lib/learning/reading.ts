/** POST /api/reading logic: the session's "Learn more" readings, generated once (after wrap-up) and saved. */
import type { ReadingResponse } from "@/lib/contracts/api";
import type { Reading, Source, TranscriptItem } from "@/lib/contracts/session";
import { MAX_READINGS } from "@/lib/claude/content/reading";
import type { HandlerResult, LearningDeps } from "./deps";
import { loadOwnedSession, patchSession } from "./sessionStore";
import { outcomesFrom } from "./wrapup";

/** Every source Claude cited in the session, in order, deduped by URL. */
export function citedSources(transcript: TranscriptItem[]): Source[] {
  const seen = new Map<string, Source>();
  for (const item of transcript) {
    if (item.kind !== "assistant_text") continue;
    for (const s of item.sources ?? []) if (!seen.has(s.url)) seen.set(s.url, s);
  }
  return [...seen.values()];
}

export async function handleReading(deps: LearningDeps, anonId: string, sessionId: string): Promise<HandlerResult<ReadingResponse>> {
  const session = await loadOwnedSession(deps, anonId, sessionId);
  if (session.furtherReading) return { body: { reading: session.furtherReading }, background: [] };

  const [moments, transcript] = await Promise.all([deps.store.listMoments(sessionId), deps.store.getTranscript(sessionId)]);
  const concepts = [...new Set(outcomesFrom(moments).map((o) => o.concept))];
  const cited = citedSources(transcript);

  let reading: Reading[];
  try {
    reading = await deps.content.generateFurtherReading({ intent: session.intent, concepts, cited });
  } catch (err) {
    await deps.store.logEvent({ at: deps.now(), anonId, sessionId, name: "error", props: { where: "generateFurtherReading", message: String(err).slice(0, 200) } });
    reading = [];
  }
  // Never empty-handed if the session cited anything; a failed search isn't saved, so the next visit tries again.
  if (!reading.length) return { body: { reading: cited.slice(0, MAX_READINGS).map((s) => ({ ...s, why: "Cited during this session." })) }, background: [] };

  const saved = await patchSession(deps, sessionId, (latest) => ({ furtherReading: latest.furtherReading ?? reading }));
  return { body: { reading: saved?.furtherReading ?? reading }, background: [] };
}
