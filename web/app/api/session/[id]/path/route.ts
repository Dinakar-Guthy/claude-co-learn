import type { PathResponse } from "@/lib/contracts/api";
import { defaultDeps } from "@/lib/learning/deps";
import { readBody, requireCaller } from "@/lib/learning/http";
import { handleMovePart, MovePartRequestSchema } from "@/lib/learning/path";
import { routeErrorResponse } from "@/lib/platform/http";

/** POST { from, to }: reorder the parts of the learning path that haven't started yet (no Claude call). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireCaller(request);
    const { id } = await ctx.params;
    const req = await readBody(request, MovePartRequestSchema);
    const { body } = await handleMovePart(defaultDeps(), caller.anonId, id, req);
    return Response.json(body satisfies PathResponse);
  } catch (err) {
    return routeErrorResponse(err, "POST /api/session/[id]/path");
  }
}
