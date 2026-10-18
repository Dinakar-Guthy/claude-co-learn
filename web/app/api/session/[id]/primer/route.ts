import type { PrimerResponse } from "@/lib/contracts/api";
import { defaultDeps } from "@/lib/learning/deps";
import { readBody, requireCaller } from "@/lib/learning/http";
import { handlePrimer, PrimerRequestSchema } from "@/lib/learning/primer";
import { loadOwnedSession } from "@/lib/learning/sessionStore";
import { routeErrorResponse } from "@/lib/platform/http";
import { toPrimerView } from "@/lib/views";

/** GET: the novice primer, or null while it's generating (or for non-novice sessions). Cheap enough to poll. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireCaller(request);
    const { id } = await ctx.params;
    const session = await loadOwnedSession(defaultDeps(), caller.anonId, id);
    return Response.json({ primer: session.primer ? toPrimerView(session.primer) : null });
  } catch (err) {
    return routeErrorResponse(err, "GET /api/session/[id]/primer");
  }
}

/** POST: answer the warm-up check or dismiss the card (no Claude call). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireCaller(request);
    const { id } = await ctx.params;
    const req = await readBody(request, PrimerRequestSchema);
    const { body } = await handlePrimer(defaultDeps(), caller.anonId, id, req);
    return Response.json(body satisfies PrimerResponse);
  } catch (err) {
    return routeErrorResponse(err, "POST /api/session/[id]/primer");
  }
}
