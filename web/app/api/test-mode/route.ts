import { readAnonId } from "@/lib/platform/anon";
import { routeErrorResponse } from "@/lib/platform/http";
import { isTestBrowser, setTestMode } from "@/lib/platform/testTraffic";
import { getStore } from "@/lib/store";

/**
 * GET /api/test-mode?on=1 (or ?on=0): marks this browser as test traffic (its identities are excluded from
 * /insights). Without `on`, reports the current mode. Behind the site password gate like every route.
 */
export async function GET(request: Request) {
  try {
    const on = new URL(request.url).searchParams.get("on");
    if (on !== "1" && on !== "0") return Response.json({ testMode: await isTestBrowser() });
    await setTestMode(on === "1");
    const anonId = await readAnonId();
    if (on === "1" && anonId) await getStore().markTestUser(anonId);
    return Response.json({ testMode: on === "1" });
  } catch (e) {
    return routeErrorResponse(e, "GET /api/test-mode");
  }
}
