import type { StoryChapter } from "@/lib/contracts/session";
import { defaultDeps, HttpError } from "@/lib/learning/deps";
import { requireCaller } from "@/lib/learning/http";
import { routeErrorResponse } from "@/lib/platform/http";
import { getChapter } from "@/lib/learning/view";

/** GET /api/story?sessionId=&trigger= → { chapter } (null while it's still generating). */
export async function GET(request: Request) {
  try {
    const caller = await requireCaller(request);
    const params = new URL(request.url).searchParams;
    const sessionId = params.get("sessionId");
    const trigger = params.get("trigger");
    if (!sessionId || !trigger) throw new HttpError(400, "sessionId and trigger are required");
    const chapter: StoryChapter | null = await getChapter(defaultDeps(), caller.anonId, sessionId, trigger);
    return Response.json({ chapter });
  } catch (err) {
    return routeErrorResponse(err, "GET /api/story");
  }
}
