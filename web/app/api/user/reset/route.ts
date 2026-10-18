import { readAnonId, rotateAnonId } from "@/lib/platform/anon";
import { routeErrorResponse, unauthorized } from "@/lib/platform/http";
import { getStore } from "@/lib/store";
import { newUser } from "@/lib/store/defaults";
import type { UserView } from "@/lib/contracts/api";
import { toUserView } from "@/lib/views";

/**
 * POST /api/user/reset: "Start over as a new user". This browser gets a fresh anonymous identity (level 1,
 * no past sessions). The previous identity's data isn't reachable from this browser anymore and ages out
 * with the normal 60-day TTL.
 */
export async function POST() {
  if (!(await readAnonId())) return unauthorized();
  try {
    const anonId = await rotateAnonId();
    const user = newUser(anonId);
    await getStore().putUser(user);
    return Response.json(toUserView(user) satisfies UserView);
  } catch (e) {
    return routeErrorResponse(e, "POST /api/user/reset");
  }
}
