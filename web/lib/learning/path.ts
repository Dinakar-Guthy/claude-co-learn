/** POST /api/session/[id]/path: the learner reorders the parts still to come (Learn mode; decision log 2026-10-18). */
import { z } from "zod";
import type { PathResponse } from "@/lib/contracts/api";
import type { LearningPath } from "@/lib/contracts/session";
import { HttpError, type HandlerResult, type LearningDeps } from "./deps";
import { loadOwnedSession, patchSession } from "./sessionStore";

export const MovePartRequestSchema = z.object({ from: z.number().int().min(0).max(20), to: z.number().int().min(0).max(20) });

/**
 * Moves a part that hasn't started yet to another not-yet-started slot. Done and current parts stay put, so
 * "do this next" is a move to the first open slot. The tutor sees the new order in its next turn's context.
 */
export function movePart(path: LearningPath, from: number, to: number): LearningPath {
  const firstOpen = path.parts.findIndex((p) => p.status === "todo");
  if (firstOpen === -1 || path.parts[from]?.status !== "todo") throw new HttpError(400, "Only parts that haven't started can be moved");
  const target = Math.min(Math.max(to, firstOpen), path.parts.length - 1);
  const parts = [...path.parts];
  const [moved] = parts.splice(from, 1);
  parts.splice(target, 0, moved);
  return { ...path, parts };
}

export async function handleMovePart(deps: LearningDeps, anonId: string, sessionId: string, req: z.infer<typeof MovePartRequestSchema>): Promise<HandlerResult<PathResponse>> {
  const session = await loadOwnedSession(deps, anonId, sessionId);
  if (!session.path) throw new HttpError(409, "This session has no learning path yet");
  let next: LearningPath | undefined;
  const saved = await patchSession(deps, sessionId, (latest) => {
    next = movePart(latest.path ?? session.path!, req.from, req.to);
    return { path: next };
  });
  return { body: { path: saved?.path ?? next! }, background: [] };
}
