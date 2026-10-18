import type { HelpResponse } from "@/lib/contracts/api";
import { defaultDeps } from "@/lib/learning/deps";
import { HelpRequestSchema, handleHelp } from "@/lib/learning/help";
import { checkCallerLimits, metered, readBody, requireCaller } from "@/lib/learning/http";
import { routeErrorResponse } from "@/lib/platform/http";

export const maxDuration = 120;

/** POST /api/moment/help: hints, "Teach me", and "Ask Claude" on one question. */
export async function POST(request: Request) {
  try {
    const caller = await requireCaller(request);
    const req = await readBody(request, HelpRequestSchema);
    const limits = await checkCallerLimits(caller);
    if (limits.blocked) return limits.blocked;
    const { body } = await metered(caller, () => handleHelp(defaultDeps(), caller.anonId, req));
    return Response.json(body satisfies HelpResponse, { headers: limits.headers });
  } catch (err) {
    return routeErrorResponse(err, "POST /api/moment/help");
  }
}
