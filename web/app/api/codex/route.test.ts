/** Route-level tests for GET /api/codex (cookies mocked, in-memory store). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/lib/store/memory";
import { StoreError } from "@/lib/store/errors";
import type { CodexResponse } from "@/lib/codex";

const ANON = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined), set: vi.fn() }),
}));

const codex = await import("./route");

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as { __colearnStore?: unknown }).__colearnStore = store;
  cookie.value = ANON;
});

const get = async () => {
  const res = await codex.GET();
  return { res, body: (await res.json()) as CodexResponse };
};

describe("GET /api/codex", () => {
  it("401s without a valid cookie", async () => {
    cookie.value = undefined;
    expect((await codex.GET()).status).toBe(401);
    cookie.value = "not-a-uuid";
    expect((await codex.GET()).status).toBe(401);
  });

  it("returns an empty Codex for a new learner", async () => {
    const { res, body } = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ concepts: [] });
  });

  it("lists only the caller's concepts with strength, attempts, lastSeen and status, grouped by status", async () => {
    const now = Date.now();
    await store.putMastery(ANON, "class imbalance", { theta: 5, n: 3, lastSeen: now - 5 * MIN });
    await store.putMastery(ANON, "train/test split", { theta: 5, n: 4, lastSeen: now - 3 * DAY });
    await store.putMastery(ANON, "data leakage", { theta: 2, n: 2, lastSeen: now - DAY });
    await store.putMastery(ANON, "precision", { theta: 3.8, n: 1, lastSeen: now - 2 * MIN });
    await store.putMastery(OTHER, "someone else's", { theta: 5, n: 5, lastSeen: now });

    const { res, body } = await get();
    expect(res.status).toBe(200);
    expect(body.concepts.map((c) => [c.concept, c.status])).toEqual([
      ["class imbalance", "mastered"],
      ["precision", "growing"],
      ["data leakage", "review"], // shaky, from an earlier session: newest review first
      ["train/test split", "review"], // mastered but not seen for over a day
    ]);
    const leakage = body.concepts.find((c) => c.concept === "data leakage")!;
    expect(leakage.n).toBe(2);
    expect(leakage.lastSeen).toBe(now - DAY);
    expect(leakage.strength).toBeGreaterThan(0);
    expect(leakage.strength).toBeLessThan(0.6);
    expect(body.concepts.every((c) => c.strength >= 0 && c.strength <= 1)).toBe(true);
  });

  it("maps store failures to a friendly 503", async () => {
    store.getMastery = () => Promise.reject(new StoreError("getMastery"));
    const res = await codex.GET();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("store_unavailable");
  });
});
