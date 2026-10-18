/** Streams ChatStreamEvents as newline-delimited JSON. */
import type { ChatStreamEvent } from "@/lib/contracts/stream";
import type { Emit } from "./stream";

export const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

export const encodeEvent = (event: ChatStreamEvent) => `${JSON.stringify(event)}\n`;

/**
 * Runs `work` and streams what it emits. If the client disconnects, the signal passed to `work` aborts
 * (so the model request is cancelled) and later emits are dropped.
 */
export function ndjsonResponse(work: (emit: Emit, signal: AbortSignal) => Promise<void>, requestSignal?: AbortSignal): Response {
  const abort = new AbortController();
  requestSignal?.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit: Emit = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          closed = true;
        }
      };
      work(emit, abort.signal)
        .catch((err) => {
          console.error("chat stream failed:", err instanceof Error ? err.message : err);
          emit({ type: "error", message: "Something went wrong on our side. Try again.", retryable: true });
          emit({ type: "turn_end", reason: "error" });
        })
        .finally(() => {
          if (closed) return;
          closed = true;
          controller.close();
        });
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
  return new Response(body, { headers: NDJSON_HEADERS });
}
