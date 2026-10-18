/**
 * POST /api/chat: one work turn, streamed as NDJSON ChatStreamEvents (lib/contracts/stream.ts).
 * No `runtime` export: cacheComponents is on, which requires (and defaults to) the Node.js runtime.
 */
import { clientIp, readAnonId } from "@/lib/platform/anon";
import { defaultDeps } from "@/lib/claude/work/deps";
import { runTurn } from "@/lib/claude/work/loop";
import { ndjsonResponse } from "@/lib/claude/work/ndjson";
import { prepareTurn } from "@/lib/claude/work/prepare";

export const maxDuration = 300;

export async function POST(request: Request) {
  const anonId = await readAnonId();
  if (!anonId) return Response.json({ error: "Type /co-learn to start." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const deps = defaultDeps();
  const prepared = await prepareTurn(deps.store, anonId, clientIp(request), body);
  if (!prepared.ok) return Response.json({ error: prepared.error }, { status: prepared.status });

  return ndjsonResponse((emit, signal) => runTurn(deps, prepared.plan, emit, signal), request.signal);
}
