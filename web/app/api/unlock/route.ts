import { ensureAnonId } from "@/lib/platform/anon";
import { jsonError, routeErrorResponse } from "@/lib/platform/http";
import { getStore } from "@/lib/store";
import { newUser } from "@/lib/store/defaults";
import { UNLOCK_PHRASE, type UnlockRequest, type UnlockResponse } from "@/lib/contracts/api";
import { toUserView } from "@/lib/views";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as UnlockRequest | null;
  if (body?.phrase?.trim().toLowerCase() !== UNLOCK_PHRASE) {
    return jsonError(400, "Type /co-learn to switch on Co-learn mode.", "bad_phrase");
  }
  try {
    const anonId = await ensureAnonId();
    const store = getStore();
    let user = await store.getUser(anonId);
    if (!user) {
      user = newUser(anonId);
      await store.putUser(user);
    }
    await store.logEvent({ at: Date.now(), anonId, name: "unlock" });
    const res: UnlockResponse = { ok: true, user: toUserView(user), sessions: await store.listSessions(anonId) };
    return Response.json(res);
  } catch (err) {
    return routeErrorResponse(err, "POST /api/unlock");
  }
}
