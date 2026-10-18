/**
 * POST /api/chat: one work turn, streamed as NDJSON ChatStreamEvents (lib/contracts/stream.ts).
 * Limits are checked inside the turn (lib/claude/work/loop.ts): a block arrives as an `error` event with its
 * code, a fail-open warning as a `notice` event.
 * No `runtime` export: cacheComponents is on, which requires (and defaults to) the Node.js runtime.
 */
import { clientIp, readAnonId } from "@/lib/platform/anon";
import { jsonError, routeErrorResponse, unauthorized } from "@/lib/platform/http";
import { defaultDeps } from "@/lib/claude/work/deps";
import { runTurn } from "@/lib/claude/work/loop";
import { ndjsonResponse } from "@/lib/claude/work/ndjson";
import { prepareTurn } from "@/lib/claude/work/prepare";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const anonId = await readAnonId();
    if (!anonId) return unauthorized("Type /co-learn to start.");

    const body: unknown = await request.json().catch(() => null);
    const deps = defaultDeps();
    const prepared = await prepareTurn(deps.store, anonId, clientIp(request), body);
    if (!prepared.ok) return jsonError(prepared.status, prepared.error);

    return ndjsonResponse((emit, signal) => runTurn(deps, prepared.plan, emit, signal), request.signal);
  } catch (err) {
    return routeErrorResponse(err, "POST /api/chat");
  }
}
