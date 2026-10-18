import type { GradeResponse } from "@/lib/contracts/api";
import { defaultDeps } from "@/lib/learning/deps";
import { GradeRequestSchema, handleGrade } from "@/lib/learning/grade";
import { errorResponse, limitBlock, metered, readBody, requireCaller, schedule } from "@/lib/learning/http";

// A finished boss generates its story chapter in after().
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const caller = await requireCaller(request);
    const req = await readBody(request, GradeRequestSchema);
    // Only free-form grading calls Claude; skip/defer/report/MC must keep working even at a cap.
    if (req.action === "submit") {
      const blocked = await limitBlock(caller);
      if (blocked) return blocked;
    }

    const deps = defaultDeps();
    const { body, background } = await metered(caller, () => handleGrade(deps, caller.anonId, req));
    schedule(deps, caller, req.sessionId, background);
    return Response.json(body satisfies GradeResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
