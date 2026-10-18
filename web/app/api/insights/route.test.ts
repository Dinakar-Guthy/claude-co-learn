/** Route tests for GET /api/insights (MemoryStore; no network). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/lib/store/memory";
import { StoreError } from "@/lib/store/errors";
import type { Insights } from "@/lib/platform/insights";
import { GET } from "./route";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const ANON = "11111111-2222-3333-4444-555555555555";

let store: MemoryStore;
beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  store = new MemoryStore();
  (globalThis as { __colearnStore?: unknown }).__colearnStore = store;
});

afterEach(() => vi.useRealTimers());

const get = (query = "") => GET(new Request(`http://x/api/insights${query}`));

describe("GET /api/insights", () => {
  it("defaults to a 7-day window and returns an empty but well-formed report", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as Insights;
    expect(body.window).toEqual({ days: 7, from: "2026-10-12", to: "2026-10-18", events: 0 });
    expect(body.daily).toHaveLength(7);
  });

  it("aggregates events inside the window only, and caps days at 30", async () => {
    await store.logEvent({ at: NOW - 60_000, anonId: ANON, sessionId: "s1", name: "session_created" });
    await store.logEvent({ at: NOW - 2 * 86_400_000, anonId: ANON, sessionId: "s0", name: "session_created" });
    await store.logEvent({ at: NOW - 40 * 86_400_000, anonId: ANON, sessionId: "old", name: "session_created" });

    const today = (await (await get("?days=1")).json()) as Insights;
    expect(today.volume.sessionsCreated).toBe(1);

    const month = (await (await get("?days=90")).json()) as Insights;
    expect(month.window.days).toBe(30);
    expect(month.volume.sessionsCreated).toBe(2);
    expect(JSON.stringify(month)).not.toContain(ANON);
  });

  it("400s on an invalid days value", async () => {
    const res = await get("?days=week");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "bad_request" });
  });

  it("maps store failures to a retryable 503", async () => {
    vi.spyOn(store, "listEvents").mockRejectedValue(new StoreError("listEvents"));
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "store_unavailable", retryable: true });
  });
});
