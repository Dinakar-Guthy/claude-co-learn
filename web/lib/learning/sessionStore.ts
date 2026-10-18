/** Ownership checks and race-safe partial writes for sessions and transcripts. */
import type { Session, TranscriptItem } from "@/lib/contracts/session";
import { HttpError, type LearningDeps } from "./deps";

/** Loads a session the caller owns; a session owned by someone else is indistinguishable from a missing one. */
export async function loadOwnedSession(deps: LearningDeps, anonId: string, sessionId: string): Promise<Session> {
  const session = typeof sessionId === "string" && sessionId ? await deps.store.getSession(sessionId) : null;
  if (!session || session.anonId !== anonId) throw new HttpError(404, "Session not found");
  return session;
}

/**
 * Re-reads the latest session immediately before writing and applies only the given change, so
 * concurrent writers (e.g. the work loop updating engine/containerId/fileIds) aren't clobbered.
 */
export async function patchSession(deps: LearningDeps, sessionId: string, change: (latest: Session) => Partial<Session>): Promise<Session | null> {
  const latest = await deps.store.getSession(sessionId);
  if (!latest) return null;
  const next = { ...latest, ...change(latest) };
  await deps.store.putSession(next);
  return next;
}

export async function appendTranscript(deps: LearningDeps, sessionId: string, item: TranscriptItem): Promise<void> {
  const items = await deps.store.getTranscript(sessionId);
  if (items.some((i) => i.id === item.id)) return;
  await deps.store.putTranscript(sessionId, [...items, item]);
}
