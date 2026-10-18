/**
 * Browser helper for POST /api/chat: posts a ChatRequest and delivers each NDJSON ChatStreamEvent.
 * Every stream ends with a `turn_end` event; if the connection drops first, a synthetic error + turn_end is delivered.
 */
import type { ChatRequest } from "@/lib/contracts/api";
import type { ChatStreamEvent } from "@/lib/contracts/stream";

export interface NdjsonParse {
  events: ChatStreamEvent[];
  /** Incomplete trailing line, to prepend to the next chunk. */
  rest: string;
}

/** Splits buffered text into complete NDJSON lines. Blank and malformed lines are skipped. */
export function parseNdjsonChunks(buffer: string, chunk: string): NdjsonParse {
  const lines = (buffer + chunk).split("\n");
  const rest = lines.pop() ?? "";
  const events: ChatStreamEvent[] = [];
  for (const line of lines) {
    const event = parseLine(line);
    if (event) events.push(event);
  }
  return { events, rest };
}

function parseLine(line: string): ChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const value: unknown = JSON.parse(trimmed);
    return value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string" ? (value as ChatStreamEvent) : null;
  } catch {
    return null;
  }
}

const lostConnection: Extract<ChatStreamEvent, { type: "error" }> = { type: "error", message: "The connection dropped before Claude finished. Try again.", retryable: true, code: "upstream" };

export async function streamChat(req: ChatRequest, onEvent: (event: ChatStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  let ended = false;
  const deliver = (event: ChatStreamEvent) => {
    if (event.type === "turn_end") ended = true;
    onEvent(event);
  };
  const fail = (event: ChatStreamEvent) => {
    deliver(event);
    deliver({ type: "turn_end", reason: "error" });
  };

  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch {
    if (signal?.aborted) return;
    return fail({ ...lostConnection, message: "Couldn't reach the server. Check your connection and try again." });
  }

  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return fail({
      type: "error",
      message: body?.error ?? "Something went wrong. Try again.",
      retryable: res.status >= 500 || res.status === 429,
      code: res.status === 429 ? "rate_limited" : res.status >= 500 ? "upstream" : "bad_request",
    });
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const parsed = parseNdjsonChunks(buffer, value);
      buffer = parsed.rest;
      parsed.events.forEach(deliver);
    }
    parseNdjsonChunks(buffer, "\n").events.forEach(deliver);
  } catch {
    if (signal?.aborted) return;
  } finally {
    reader.releaseLock();
  }
  if (!ended && !signal?.aborted) fail(lostConnection);
}

export { applyEvent } from "./transcript";
