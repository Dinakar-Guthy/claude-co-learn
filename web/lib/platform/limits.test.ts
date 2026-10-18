import { beforeEach, describe, expect, it } from "vitest";
import type { Store } from "@/lib/contracts/store";
import { MemoryStore } from "@/lib/store/memory";
import { StoreError } from "@/lib/store/errors";
import { createLimits, LIMIT_MESSAGES, RATE_LIMITS, SPEND_CAPS_MICRO_USD, type Limits } from "./limits";
import { MemoryRateLimiter, type RateLimiter } from "./ratelimit";

let clock: number;
let store: MemoryStore;
let logs: string[];
let limits: Limits;

const build = (overrides: Partial<{ store: Store; anonLimiter: RateLimiter; ipLimiter: RateLimiter }> = {}) =>
  createLimits({
    store,
    anonLimiter: new MemoryRateLimiter(RATE_LIMITS.anon.max, RATE_LIMITS.anon.windowS * 1000, () => clock),
    ipLimiter: new MemoryRateLimiter(RATE_LIMITS.ip.max, RATE_LIMITS.ip.windowS * 1000, () => clock),
    now: () => clock,
    log: (l) => logs.push(l),
    ...overrides,
  });

beforeEach(() => {
  clock = 1_000_000;
  store = new MemoryStore();
  logs = [];
  limits = build();
});

describe("MemoryRateLimiter", () => {
  it("allows max requests per sliding window, then frees slots as old hits age out", async () => {
    const rl = new MemoryRateLimiter(3, 60_000, () => clock);
    for (let i = 0; i < 3; i++) {
      expect((await rl.limit("k")).success).toBe(true);
      clock += 10_000; // hits at 0s, 10s, 20s
    }
    const blocked = await rl.limit("k"); // at 30s
    expect(blocked).toEqual({ success: false, reset: 1_000_000 + 60_000 });
    clock = 1_000_000 + 59_999;
    expect((await rl.limit("k")).success).toBe(false);
    clock = 1_000_000 + 60_000; // the 0s hit has left the window
    expect((await rl.limit("k")).success).toBe(true);
    expect((await rl.limit("k")).success).toBe(false);
    expect((await rl.limit("other")).success).toBe(true);
  });
});

describe("checkLimits: rate limits", () => {
  it("allows 20 requests/min per anon ID, then rate-limits with a retry hint", async () => {
    for (let i = 0; i < 20; i++) expect(await limits.checkLimits("a1", "1.1.1.1")).toEqual({ ok: true });
    clock += 15_000;
    const check = await limits.checkLimits("a1", "1.1.1.1");
    expect(check).toEqual({ ok: false, code: "rate_limited", message: LIMIT_MESSAGES.rateLimited(45), retryAfterS: 45 });
    expect(await limits.checkLimits("a2", "1.1.1.1")).toEqual({ ok: true }); // other browser, same IP
    clock += 45_000;
    expect(await limits.checkLimits("a1", "1.1.1.1")).toEqual({ ok: true });
  });

  it("allows 60 requests/min per IP across browsers", async () => {
    for (let i = 0; i < 60; i++) expect((await limits.checkLimits(`a${i % 4}x${Math.floor(i / 20)}`, "2.2.2.2")).ok).toBe(true);
    const check = await limits.checkLimits("fresh", "2.2.2.2");
    expect(check.ok === false && check.code).toBe("rate_limited");
    expect((await limits.checkLimits("fresh", "3.3.3.3")).ok).toBe(true);
  });

  it("fails open when the rate limiter errors", async () => {
    const broken: RateLimiter = { limit: () => Promise.reject(new Error("redis down")) };
    limits = build({ anonLimiter: broken, ipLimiter: broken });
    expect(await limits.checkLimits("a1", "1.1.1.1")).toEqual({ ok: true });
    expect(logs[0]).toMatch(/allowing request/);
  });
});

describe("checkLimits: spend caps", () => {
  const spend = (scope: Parameters<Store["addUsage"]>[0][number], micro: number) => store.addUsage([scope], micro);

  it("blocks an anon ID at $5", async () => {
    await spend({ kind: "anon", id: "a1" }, SPEND_CAPS_MICRO_USD.anon - 1);
    expect(await limits.checkLimits("a1", "1.1.1.1")).toEqual({ ok: true });
    await spend({ kind: "anon", id: "a1" }, 1);
    expect(await limits.checkLimits("a1", "1.1.1.1")).toEqual({ ok: false, code: "spend_cap", message: LIMIT_MESSAGES.anonCap });
    expect((await limits.checkLimits("a2", "1.1.1.1")).ok).toBe(true);
  });

  it("blocks an IP at $25", async () => {
    await spend({ kind: "ip", id: "1.1.1.1" }, SPEND_CAPS_MICRO_USD.ip);
    expect(await limits.checkLimits("a1", "1.1.1.1")).toEqual({ ok: false, code: "spend_cap", message: LIMIT_MESSAGES.ipCap });
    expect((await limits.checkLimits("a1", "9.9.9.9")).ok).toBe(true);
  });

  it("blocks everyone at the $75 global cap", async () => {
    await spend({ kind: "global" }, SPEND_CAPS_MICRO_USD.global);
    expect(await limits.checkLimits("anyone", "9.9.9.9")).toEqual({ ok: false, code: "spend_cap", message: LIMIT_MESSAGES.globalCap });
  });

  it("fails closed when usage can't be read", async () => {
    const broken = new MemoryStore();
    broken.getUsage = () => Promise.reject(new StoreError("getUsage"));
    limits = build({ store: broken });
    const check = await limits.checkLimits("a1", "1.1.1.1");
    expect(check).toEqual({ ok: false, code: "spend_cap", message: LIMIT_MESSAGES.capUnavailable, retryAfterS: 60 });
  });
});

describe("recordUsage", () => {
  it("adds the estimated cost to anon, IP and global scopes", async () => {
    await limits.recordUsage("a1", "1.1.1.1", "claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 500 });
    await limits.recordUsage("a2", "1.1.1.1", "claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 0 });
    expect(await store.getUsage([{ kind: "anon", id: "a1" }, { kind: "ip", id: "1.1.1.1" }, { kind: "global" }])).toEqual([7000, 9000, 9000]);
  });

  it("accumulates up to the cap and then blocks", async () => {
    // Opus: 250k output tokens = $5
    await limits.recordUsage("a1", "1.1.1.1", "claude-opus-5-5", { input_tokens: 0, output_tokens: 250_000 });
    const check = await limits.checkLimits("a1", "1.1.1.1");
    expect(check.ok === false && check.message).toBe(LIMIT_MESSAGES.anonCap);
  });

  it("never throws when the store fails", async () => {
    const broken = new MemoryStore();
    broken.addUsage = () => Promise.reject(new StoreError("addUsage"));
    limits = build({ store: broken });
    await expect(limits.recordUsage("a1", "1.1.1.1", "claude-sonnet-5-5", { input_tokens: 1, output_tokens: 1 })).resolves.toBeUndefined();
    expect(logs).toHaveLength(1);
  });
});
