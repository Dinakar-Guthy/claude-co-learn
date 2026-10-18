import { z } from "zod";
import type { WrapUpResponse } from "@/lib/contracts/api";
import { defaultDeps } from "@/lib/learning/deps";
import { checkCallerLimits, metered, readBody, requireCaller, schedule } from "@/lib/learning/http";
import { loadOwnedSession } from "@/lib/learning/sessionStore";
import { routeErrorResponse } from "@/lib/platform/http";
import { handleWrapUp } from "@/lib/learning/wrapup";

export const maxDuration = 300;

const WrapUpRequestSchema = z.object({ sessionId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  try {
    const caller = await requireCaller(request);
    const { sessionId } = await readBody(request, WrapUpRequestSchema);
    const deps = defaultDeps();
    await loadOwnedSession(deps, caller.anonId, sessionId);
    const limits = await checkCallerLimits(caller);
    if (limits.blocked) return limits.blocked;

    const { body, background } = await metered(caller, () => handleWrapUp(deps, caller.anonId, sessionId));
    schedule(deps, caller, sessionId, background);
    return Response.json(body satisfies WrapUpResponse, { headers: limits.headers });
  } catch (err) {
    return routeErrorResponse(err, "POST /api/wrapup");
  }
}
