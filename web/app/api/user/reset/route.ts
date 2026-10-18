import { readAnonId, rotateAnonId } from "@/lib/platform/anon";
import { routeErrorResponse, unauthorized } from "@/lib/platform/http";
import { tagIfTest } from "@/lib/platform/testTraffic";
import { getStore } from "@/lib/store";
import { newUser } from "@/lib/store/defaults";
import type { UserView } from "@/lib/contracts/api";
import { toUserView } from "@/lib/views";

/**
 * POST /api/user/reset: "Reset my data" / "Start over as a new user". Deletes the current identity's profile,
 * mastery, and sessions, then gives this browser a fresh anonymous identity (level 1, no past sessions).
 * Anonymous telemetry events are kept (they feed /insights).
 */
export async function POST() {
  const previous = await readAnonId();
  if (!previous) return unauthorized();
  try {
    await getStore().deleteUserData(previous);
    const anonId = await rotateAnonId();
    await tagIfTest(anonId); // a tester starting over stays a tester
    const user = newUser(anonId);
    await getStore().putUser(user);
    return Response.json(toUserView(user) satisfies UserView);
  } catch (e) {
    return routeErrorResponse(e, "POST /api/user/reset");
  }
}
