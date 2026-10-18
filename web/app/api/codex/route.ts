import { readAnonId } from "@/lib/platform/anon";
import { routeErrorResponse, unauthorized } from "@/lib/platform/http";
import { getStore } from "@/lib/store";
import { buildCodex, type CodexResponse } from "@/lib/codex";

/** GET /api/codex: every concept the cookie's user has practised, across sessions, with its strength and status. */
export async function GET() {
  const anonId = await readAnonId();
  if (!anonId) return unauthorized();
  try {
    const mastery = await getStore().getMastery(anonId);
    const body: CodexResponse = { concepts: buildCodex(mastery, Date.now()) };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return routeErrorResponse(e, "GET /api/codex");
  }
}
