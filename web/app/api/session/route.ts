import type { CreateSessionResponse } from "@/lib/contracts/api";
import { defaultDeps } from "@/lib/learning/deps";
import { checkCallerLimits, readBody, requireCaller, schedule } from "@/lib/learning/http";
import { routeErrorResponse } from "@/lib/platform/http";
import { CreateSessionRequestSchema, createSession } from "@/lib/learning/session";

// The background sketch (Opus, high effort) and story bible run in after(); give them room.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const caller = await requireCaller(request);
    const { intent } = await readBody(request, CreateSessionRequestSchema);
    const limits = await checkCallerLimits(caller);
    if (limits.blocked) return limits.blocked;

    const deps = defaultDeps();
    const { body, background } = await createSession(deps, caller.anonId, intent);
    schedule(deps, caller, body.sessionId, background);
    return Response.json(body satisfies CreateSessionResponse, { headers: limits.headers });
  } catch (err) {
    return routeErrorResponse(err, "POST /api/session");
  }
}
