import { z } from "zod";
import type { WrapUpResponse } from "@/lib/contracts/api";
import { defaultDeps } from "@/lib/learning/deps";
import { errorResponse, limitBlock, metered, readBody, requireCaller, schedule } from "@/lib/learning/http";
import { loadOwnedSession } from "@/lib/learning/sessionStore";
import { handleWrapUp } from "@/lib/learning/wrapup";

export const maxDuration = 300;

const WrapUpRequestSchema = z.object({ sessionId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  try {
    const caller = await requireCaller(request);
    const { sessionId } = await readBody(request, WrapUpRequestSchema);
    const deps = defaultDeps();
    await loadOwnedSession(deps, caller.anonId, sessionId);
    const blocked = await limitBlock(caller);
    if (blocked) return blocked;

    const { body, background } = await metered(caller, () => handleWrapUp(deps, caller.anonId, sessionId));
    schedule(deps, caller, sessionId, background);
    return Response.json(body satisfies WrapUpResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
