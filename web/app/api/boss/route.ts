import { z } from "zod";
import type { StartBossResponse } from "@/lib/contracts/api";
import { startBoss } from "@/lib/learning/boss";
import { defaultDeps } from "@/lib/learning/deps";
import { errorResponse, limitBlock, metered, readBody, requireCaller, schedule } from "@/lib/learning/http";
import { loadOwnedSession } from "@/lib/learning/sessionStore";

export const maxDuration = 300;

const StartBossRequestSchema = z.object({ sessionId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  try {
    const caller = await requireCaller(request);
    const { sessionId } = await readBody(request, StartBossRequestSchema);
    const deps = defaultDeps();
    const session = await loadOwnedSession(deps, caller.anonId, sessionId);
    const blocked = await limitBlock(caller);
    if (blocked) return blocked;

    const { body, background } = await metered(caller, () => startBoss(deps, session));
    schedule(deps, caller, sessionId, background);
    return Response.json(body satisfies StartBossResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
