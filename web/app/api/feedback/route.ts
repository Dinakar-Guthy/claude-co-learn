import { z } from "zod";
import { defaultDeps } from "@/lib/learning/deps";
import { readBody, requireCaller } from "@/lib/learning/http";
import { loadOwnedSession } from "@/lib/learning/sessionStore";
import { routeErrorResponse } from "@/lib/platform/http";

const FeedbackSchema = z.object({ sessionId: z.string().min(1).max(100), helpful: z.boolean() });

/** POST /api/feedback: the wrap-up "Did you learn something?" thumbs (feeds /insights). No Claude call. */
export async function POST(request: Request) {
  try {
    const caller = await requireCaller(request);
    const { sessionId, helpful } = await readBody(request, FeedbackSchema);
    const deps = defaultDeps();
    await loadOwnedSession(deps, caller.anonId, sessionId);
    await deps.store.logEvent({ at: deps.now(), anonId: caller.anonId, sessionId, name: "learned_feedback", props: { helpful } });
    return Response.json({ ok: true });
  } catch (err) {
    return routeErrorResponse(err, "POST /api/feedback");
  }
}
