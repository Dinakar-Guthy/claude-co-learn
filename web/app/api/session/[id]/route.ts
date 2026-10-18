import type { SessionView } from "@/lib/contracts/api";
import { defaultDeps } from "@/lib/learning/deps";
import { requireCaller } from "@/lib/learning/http";
import { routeErrorResponse } from "@/lib/platform/http";
import { getSessionView } from "@/lib/learning/view";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireCaller(request);
    const { id } = await ctx.params;
    const view: SessionView = await getSessionView(defaultDeps(), caller.anonId, id);
    return Response.json(view);
  } catch (err) {
    return routeErrorResponse(err, "GET /api/session/[id]");
  }
}
