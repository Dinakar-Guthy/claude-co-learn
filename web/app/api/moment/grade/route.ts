import type { GradeResponse } from "@/lib/contracts/api";
import { defaultDeps } from "@/lib/learning/deps";
import { GradeRequestSchema, handleGrade } from "@/lib/learning/grade";
import { checkCallerLimits, metered, readBody, requireCaller, schedule, type LimitGate } from "@/lib/learning/http";
import { routeErrorResponse } from "@/lib/platform/http";

// A finished boss generates its story chapter in after().
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const caller = await requireCaller(request);
    const req = await readBody(request, GradeRequestSchema);
    // Only free-form grading calls Claude; skip/defer/report/MC must keep working even at a cap.
    const limits: LimitGate = req.action === "submit" ? await checkCallerLimits(caller) : {};
    if (limits.blocked) return limits.blocked;

    const deps = defaultDeps();
    const { body, background } = await metered(caller, () => handleGrade(deps, caller.anonId, req));
    schedule(deps, caller, req.sessionId, background);
    return Response.json(body satisfies GradeResponse, { headers: limits.headers });
  } catch (err) {
    return routeErrorResponse(err, "POST /api/moment/grade");
  }
}
