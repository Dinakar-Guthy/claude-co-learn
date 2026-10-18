import { computeInsights, parseDays, windowDays, type Insights } from "@/lib/platform/insights";
import { HttpError, routeErrorResponse } from "@/lib/platform/http";
import { getStore } from "@/lib/store";

/**
 * GET /api/insights?days=N (default 7, max 30): aggregated "is Co-learn working?" metrics.
 * Behind the site password gate (proxy.ts) like every route. Counts and rates only: no anonIds or free text.
 */
export async function GET(request: Request) {
  try {
    const days = parseDays(new URL(request.url).searchParams.get("days"));
    if (days === null) throw new HttpError(400, "days must be a whole number from 1 to 30.", "bad_request");
    const store = getStore();
    const window = windowDays(Date.now(), days);
    const perDay = await Promise.all(window.map(async (day) => ({ day, events: await store.listEvents(day) })));
    const body: Insights = computeInsights(perDay);
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return routeErrorResponse(e, "GET /api/insights");
  }
}
