import { ensureAnonId, readAnonId } from "@/lib/platform/anon";
import { jsonError, routeErrorResponse, unauthorized } from "@/lib/platform/http";
import { applySettingsUpdate } from "@/lib/platform/settings";
import { getStore } from "@/lib/store";
import { newUser } from "@/lib/store/defaults";
import type { User } from "@/lib/contracts/session";
import type { UserView } from "@/lib/contracts/api";
import { toUserView } from "@/lib/views";

/** Loads the cookie's user, recreating it if the record expired or was never written. */
async function loadUser(anonId: string): Promise<User> {
  const store = getStore();
  const existing = await store.getUser(anonId);
  if (existing) return existing;
  const user = newUser(anonId);
  await store.putUser(user);
  return user;
}

export async function GET() {
  const anonId = await readAnonId();
  if (!anonId) return unauthorized();
  try {
    const user = await loadUser(anonId);
    await ensureAnonId(); // slide the cookie's 60-day expiry along with the stored user
    return Response.json(toUserView(user) satisfies UserView);
  } catch (e) {
    return routeErrorResponse(e, "GET /api/user");
  }
}

export async function PATCH(request: Request) {
  const anonId = await readAnonId();
  if (!anonId) return unauthorized();
  const body: unknown = await request.json().catch(() => undefined);
  try {
    const store = getStore();
    const result = applySettingsUpdate(await loadUser(anonId), body);
    if (!result.ok) return jsonError(400, result.error, "invalid_settings");
    await store.putUser(result.user);
    if (result.guardrailsEvent) {
      await store.logEvent({ at: Date.now(), anonId, ...result.guardrailsEvent });
    }
    return Response.json(toUserView(result.user) satisfies UserView);
  } catch (e) {
    return routeErrorResponse(e, "PATCH /api/user");
  }
}
