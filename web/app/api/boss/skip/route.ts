import { z } from "zod";
import type { SkipBossResponse } from "@/lib/contracts/api";
import { skipBoss } from "@/lib/learning/boss";
import { defaultDeps } from "@/lib/learning/deps";
import { readBody, requireCaller } from "@/lib/learning/http";
import { loadOwnedSession } from "@/lib/learning/sessionStore";
import { routeErrorResponse } from "@/lib/platform/http";

const SkipBossRequestSchema = z.object({ sessionId: z.string().min(1).max(100), bossId: z.string().min(1).max(100) });

/** POST /api/boss/skip: "Skip this boss" (no Claude call, so no limit check). */
export async function POST(request: Request) {
  try {
    const caller = await requireCaller(request);
    const { sessionId, bossId } = await readBody(request, SkipBossRequestSchema);
    const deps = defaultDeps();
    const session = await loadOwnedSession(deps, caller.anonId, sessionId);
    const { body } = await skipBoss(deps, session, bossId);
    return Response.json(body satisfies SkipBossResponse);
  } catch (err) {
    return routeErrorResponse(err, "POST /api/boss/skip");
  }
}
