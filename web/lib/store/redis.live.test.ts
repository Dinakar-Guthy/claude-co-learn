/**
 * Live round trip against real Upstash Redis. Skipped unless LIVE_REDIS=1 and credentials are set:
 *   LIVE_REDIS=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/store/redis.live.test.ts
 * Uses unique ids, never touches the global usage counter or shared event lists, and deletes its keys.
 */
import { afterAll, describe, expect, it } from "vitest";
import { Redis } from "@upstash/redis";
import { createUpstashKv, upstashCredentials } from "./redis-kv";
import { RedisStore, DATA_TTL_S, USAGE_TTL_S, keys, utcDay } from "./redis";
import { newUser } from "./defaults";
import { makeMoment, makeSession } from "./fixtures";
import { upstashRateLimiter } from "@/lib/platform/ratelimit";

const creds = upstashCredentials();
const enabled = process.env.LIVE_REDIS === "1" && creds !== null;
const id = `livetest-${crypto.randomUUID()}`;

describe.skipIf(!enabled)("RedisStore (live Upstash)", () => {
  const kv = enabled ? createUpstashKv(creds!) : null!;
  const store = new RedisStore(kv);
  const raw = enabled ? new Redis(creds!) : null!;

  afterAll(async () => {
    const leftovers = [
      keys.user(id), keys.userSessions(id), keys.mastery(id), keys.session(id), keys.messages(id), keys.moments(id),
      keys.usage({ kind: "anon", id }, utcDay(Date.now())), keys.usage({ kind: "ip", id }, utcDay(Date.now())), `${id}:list`,
      ...(await raw.keys(`ratelimit:${id}*`)),
    ];
    await kv.exec([["del", leftovers]]);
    const [remaining] = await kv.exec([["mget", leftovers]]);
    expect(remaining.every((v) => v === null)).toBe(true);
  });

  it("round-trips JSON values, hashes and the session index with TTLs", async () => {
    const user = newUser(id);
    await store.putUser(user);
    expect(await store.getUser(id)).toEqual(user);

    await store.putSession(makeSession(id, id, 42, { title: "123" }));
    expect(await store.listSessions(id)).toEqual([{ id, title: "123", createdAt: 42, status: "active" }]);
    await store.putApiMessages(id, [{ role: "user", content: "émoji ✓ 🚀" }]);
    expect(await store.getApiMessages(id)).toEqual([{ role: "user", content: "émoji ✓ 🚀" }]);

    await store.putMoment(makeMoment("m1", id, 2));
    await store.putMoment(makeMoment("m0", id, 1));
    expect((await store.listMoments(id)).map((m) => m.id)).toEqual(["m0", "m1"]);
    expect((await store.getMoment(id, "m1"))?.candidate.mc_fallback.correct_index).toBe(1);

    await store.putMastery(id, "overfitting", { theta: 0.5, n: 1, lastSeen: 1 });
    expect(await store.getMastery(id)).toEqual({ overfitting: { theta: 0.5, n: 1, lastSeen: 1 } });

    const ttls = await kv.exec([["ttl", keys.user(id)], ["ttl", keys.userSessions(id)], ["ttl", keys.moments(id)], ["ttl", keys.mastery(id)]]);
    for (const t of ttls) expect(t).toBeGreaterThan(DATA_TTL_S - 60);
  });

  it("accumulates usage with INCRBY and a 2-day TTL", async () => {
    const scopes = [{ kind: "anon", id }, { kind: "ip", id }] as const;
    expect(await store.addUsage([...scopes], 10)).toEqual([10, 10]);
    expect(await store.addUsage([...scopes], 5)).toEqual([15, 15]);
    expect(await store.getUsage([...scopes])).toEqual([15, 15]);
    const [ttl] = await kv.exec([["ttl", keys.usage(scopes[0], utcDay(Date.now()))]]);
    expect(ttl).toBeGreaterThan(USAGE_TTL_S - 60);
  });

  it("supports list push/trim/range", async () => {
    await kv.exec([["lpush", `${id}:list`, "a"], ["lpush", `${id}:list`, "b"], ["lpush", `${id}:list`, "c"], ["ltrim", `${id}:list`, 0, 1]]);
    expect((await kv.exec([["lrange", `${id}:list`, 0, -1]]))[0]).toEqual(["c", "b"]);
  });

  it("rate-limits with Upstash sliding windows", async () => {
    const rl = upstashRateLimiter(creds!, 2, 60, `ratelimit:${id}`);
    expect((await rl.limit("k")).success).toBe(true);
    expect((await rl.limit("k")).success).toBe(true);
    expect((await rl.limit("k")).success).toBe(false);
  });
});
