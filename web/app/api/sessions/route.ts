import { readAnonId } from "@/lib/platform/anon";
import { routeErrorResponse, unauthorized } from "@/lib/platform/http";
import { getStore } from "@/lib/store";
import type { SessionSummary } from "@/lib/contracts/session";

export async function GET() {
  const anonId = await readAnonId();
  if (!anonId) return unauthorized();
  try {
    const sessions: SessionSummary[] = await getStore().listSessions(anonId);
    return Response.json(sessions);
  } catch (e) {
    return routeErrorResponse(e, "GET /api/sessions");
  }
}
