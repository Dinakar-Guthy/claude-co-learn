import { computeInsights, parseDays, windowDays, withoutTestTraffic, type Insights } from "@/lib/platform/insights";
import { HttpError, routeErrorResponse } from "@/lib/platform/http";
import { getStore } from "@/lib/store";

/**
 * GET /api/insights?days=N (default 7, max 30)&includeTest=1: aggregated "is Co-learn working?" metrics.
 * Events from test requests (tagged per request, see lib/store/testTraffic.ts) are excluded unless includeTest=1.
 * Behind the site password gate (proxy.ts) like every route. Counts and rates only: no anonIds or free text.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const days = parseDays(params.get("days"));
    const includeTest = params.get("includeTest") === "1";
    if (days === null) throw new HttpError(400, "days must be a whole number from 1 to 30.", "bad_request");
    const store = getStore();
    const window = windowDays(Date.now(), days);
    const perDay = await Promise.all(window.map(async (day) => ({ day, events: await store.listEvents(day) })));
    const filtered = withoutTestTraffic(perDay, includeTest);
    const body: Insights = {
      ...computeInsights(filtered.days),
      testTraffic: { included: includeTest, eventsExcluded: filtered.excluded },
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return routeErrorResponse(e, "GET /api/insights");
  }
}
