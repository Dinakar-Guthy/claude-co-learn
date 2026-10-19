import { z } from "zod";
import type { ReadingResponse } from "@/lib/contracts/api";
import { defaultDeps } from "@/lib/learning/deps";
import { checkCallerLimits, metered, readBody, requireCaller } from "@/lib/learning/http";
import { loadOwnedSession } from "@/lib/learning/sessionStore";
import { handleReading } from "@/lib/learning/reading";
import { routeErrorResponse } from "@/lib/platform/http";

export const maxDuration = 300;

const ReadingRequestSchema = z.object({ sessionId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  try {
    const caller = await requireCaller(request);
    const { sessionId } = await readBody(request, ReadingRequestSchema);
    const deps = defaultDeps();
    await loadOwnedSession(deps, caller.anonId, sessionId);
    const limits = await checkCallerLimits(caller);
    if (limits.blocked) return limits.blocked;

    const { body } = await metered(caller, () => handleReading(deps, caller.anonId, sessionId));
    return Response.json(body satisfies ReadingResponse, { headers: limits.headers });
  } catch (err) {
    return routeErrorResponse(err, "POST /api/reading");
  }
}
