import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatStreamEvent } from "@/lib/contracts/stream";
import { parseNdjsonChunks, streamChat } from "./chatStream";

const line = (e: ChatStreamEvent) => `${JSON.stringify(e)}\n`;
const thinking: ChatStreamEvent = { type: "status", status: "thinking" };
const end: ChatStreamEvent = { type: "turn_end", reason: "end_turn" };

describe("parseNdjsonChunks", () => {
  it("parses complete lines and keeps the partial tail", () => {
    const full = line(thinking) + line(end);
    const cut = full.length - 5;
    const a = parseNdjsonChunks("", full.slice(0, cut));
    expect(a.events).toEqual([thinking]);
    const b = parseNdjsonChunks(a.rest, full.slice(cut));
    expect(b.events).toEqual([end]);
    expect(b.rest).toBe("");
  });

  it("handles a line split across many chunks", () => {
    const full = line({ type: "text_delta", itemId: "m:0", text: "héllo\nworld" });
    let rest = "";
    const events: ChatStreamEvent[] = [];
    for (const ch of full) {
      const r = parseNdjsonChunks(rest, ch);
      rest = r.rest;
      events.push(...r.events);
    }
    expect(events).toEqual([{ type: "text_delta", itemId: "m:0", text: "héllo\nworld" }]);
  });

  it("skips blank and malformed lines", () => {
    expect(parseNdjsonChunks("", `\n{oops\n${line(end)}\r\n"str"\n`).events).toEqual([end]);
  });
});

function bodyFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

describe("streamChat", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the request and delivers events across chunk boundaries", async () => {
    const all = line(thinking) + line(end);
    const fetchMock = vi.fn(async () => new Response(bodyFrom([all.slice(0, 7), all.slice(7, 40), all.slice(40)]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const events: ChatStreamEvent[] = [];
    await streamChat({ sessionId: "s1", kind: "continue" }, (e) => events.push(e));
    expect(events).toEqual([thinking, end]);
    expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST", body: JSON.stringify({ sessionId: "s1", kind: "continue" }) }));
  });

  it("turns HTTP errors into error + turn_end events", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Session not found." }, { status: 404 })));
    const events: ChatStreamEvent[] = [];
    await streamChat({ sessionId: "s1", kind: "continue" }, (e) => events.push(e));
    expect(events).toEqual([
      { type: "error", message: "Session not found.", retryable: false, code: "bad_request" },
      { type: "turn_end", reason: "error" },
    ]);
  });

  it("reports a dropped connection when the stream ends without turn_end", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bodyFrom([line(thinking)]), { status: 200 })));
    const events: ChatStreamEvent[] = [];
    await streamChat({ sessionId: "s1", kind: "continue" }, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(["status", "error", "turn_end"]);
  });

  it("stays quiet when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("aborted", "AbortError"); }));
    const events: ChatStreamEvent[] = [];
    await streamChat({ sessionId: "s1", kind: "continue" }, (e) => events.push(e), controller.signal);
    expect(events).toEqual([]);
  });
});
