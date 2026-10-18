/** Read-side helpers for GET /api/session/[id] and GET /api/story. */
import type { SessionView } from "@/lib/contracts/api";
import type { BossState, StoryChapter } from "@/lib/contracts/session";
import { toSessionView } from "@/lib/views";
import type { LearningDeps } from "./deps";
import { loadOwnedSession } from "./sessionStore";

export async function getSessionView(deps: LearningDeps, anonId: string, sessionId: string): Promise<SessionView> {
  const session = await loadOwnedSession(deps, anonId, sessionId);
  const [transcript, moments] = await Promise.all([deps.store.getTranscript(sessionId), deps.store.listMoments(sessionId)]);
  const bossIds = [...new Set([...session.engine.bosses.map((b) => b.id), ...moments.flatMap((m) => (m.bossId ? [m.bossId] : []))])];
  const bosses = (await Promise.all(bossIds.map((id) => deps.store.getBoss(sessionId, id)))).filter((b): b is BossState => !!b);
  return toSessionView(session, transcript, moments, bosses);
}

export async function getChapter(deps: LearningDeps, anonId: string, sessionId: string, trigger: string): Promise<StoryChapter | null> {
  const session = await loadOwnedSession(deps, anonId, sessionId);
  return session.story.chapters.find((c) => c.trigger === trigger) ?? null;
}
