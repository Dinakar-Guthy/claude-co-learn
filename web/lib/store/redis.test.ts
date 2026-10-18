import { beforeEach, describe, expect, it } from "vitest";
import { RedisStore, DATA_TTL_S, USAGE_TTL_S, EVENTS_MAX } from "./redis";
import { FakeRedis } from "./fake-redis";
import { StoreError, isStoreError } from "./errors";
import { newUser } from "./defaults";
import { makeBoss, makeMoment, makeSession } from "./fixtures";
import type { UsageScope } from "@/lib/contracts/store";

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 17, 12, 0, 0);

let clock: number;
let redis: FakeRedis;
let logs: string[];
let store: RedisStore;

beforeEach(() => {
  clock = T0;
  redis = new FakeRedis(() => clock);
  logs = [];
  store = new RedisStore(redis, { now: () => clock, log: (l) => logs.push(l) });
});

const rawGet = async (key: string) => (await redis.exec([["get", key]]))[0];

describe("RedisStore key layout and encoding", () => {
  it("stores the user as a JSON string under user:{anonId} with a 60-day TTL", async () => {
    const user = newUser("u1", 5);
    await store.putUser(user);
    expect(redis.typeOf("user:u1")).toBe("string");
    expect(JSON.parse((await rawGet("user:u1"))!)).toEqual(user);
    expect(redis.ttl("user:u1")).toBe(DATA_TTL_S);
  });

  it("slides the user TTL (and per-user index/mastery TTLs) on read", async () => {
    await store.putUser(newUser("u1"));
    await store.putSession(makeSession("s1", "u1", 1));
    await store.putMastery("u1", "overfitting", { theta: 0, n: 1, lastSeen: 1 });
    clock += 30 * DAY_MS;
    expect(redis.ttl("user:u1")).toBe(DATA_TTL_S - 30 * 24 * 3600);
    await store.getUser("u1");
    for (const key of ["user:u1", "user:u1:sessions", "mastery:u1"]) expect(redis.ttl(key)).toBe(DATA_TTL_S);
  });

  it("reads and refreshes in a single round trip", async () => {
    await store.getUser("u1");
    expect(redis.batches).toHaveLength(1);
    expect(redis.batches[0].map((c) => c[0])).toEqual(["get", "expire", "expire", "expire"]);
  });

  it("expires users after 60 idle days", async () => {
    await store.putUser(newUser("u1"));
    clock += DATA_TTL_S * 1000;
    expect(await store.getUser("u1")).toBeNull();
  });

  it("indexes sessions in a zset scored by createdAt", async () => {
    await store.putSession(makeSession("s1", "u1", 100));
    await store.putSession(makeSession("s2", "u1", 200));
    expect(redis.typeOf("user:u1:sessions")).toBe("zset");
    expect((await redis.exec([["zrevrange", "user:u1:sessions"]]))[0]).toEqual(["s2", "s1"]);
    expect(redis.typeOf("session:s1")).toBe("string");
    expect(redis.ttl("session:s1")).toBe(DATA_TTL_S);
    expect(redis.ttl("user:u1:sessions")).toBe(DATA_TTL_S);
  });

  it("skips index entries whose session has expired", async () => {
    await store.putSession(makeSession("old", "u1", 100));
    clock += 59 * DAY_MS;
    await store.putSession(makeSession("new", "u1", 200)); // refreshes the index, not "old"
    clock += 2 * DAY_MS;
    expect((await store.listSessions("u1")).map((s) => s.id)).toEqual(["new"]);
  });

  it("uses session-scoped keys for messages, transcript, moments (hash) and bosses", async () => {
    await store.putApiMessages("s1", [{ role: "user", content: "hi" }]);
    await store.putTranscript("s1", [{ kind: "notice", id: "n1", text: "hello" }]);
    await store.putMoment(makeMoment("m1", "s1", 1));
    await store.putBoss(makeBoss("b1", "s1"));
    expect(redis.keys().sort()).toEqual(["session:s1:boss:b1", "session:s1:messages", "session:s1:moments", "session:s1:transcript"]);
    expect(redis.typeOf("session:s1:moments")).toBe("hash");
    for (const key of redis.keys()) expect(redis.ttl(key)).toBe(DATA_TTL_S);
    const [hash] = await redis.exec([["hgetall", "session:s1:moments"]]);
    expect(Object.keys(hash)).toEqual(["m1"]);
    expect(JSON.parse(hash.m1)).toEqual(makeMoment("m1", "s1", 1));
  });

  it("stores mastery as a hash of concept → JSON", async () => {
    await store.putMastery("u1", "data leakage", { theta: 1, n: 3, lastSeen: 9 });
    expect(redis.typeOf("mastery:u1")).toBe("hash");
    const [hash] = await redis.exec([["hgetall", "mastery:u1"]]);
    expect(JSON.parse(hash["data leakage"])).toEqual({ theta: 1, n: 3, lastSeen: 9 });
    expect(redis.ttl("mastery:u1")).toBe(DATA_TTL_S);
  });

  it("keeps strings that look like JSON scalars intact", async () => {
    await store.putSession(makeSession("s1", "u1", 1, { title: "123", rollingSummary: "null" }));
    const s = await store.getSession("s1");
    expect(s?.title).toBe("123");
    expect(s?.rollingSummary).toBe("null");
  });
});

describe("RedisStore usage", () => {
  const scopes: UsageScope[] = [{ kind: "anon", id: "u1" }, { kind: "ip", id: "::1" }, { kind: "global" }];

  it("INCRBYs per-scope daily keys with a 2-day TTL in one round trip", async () => {
    expect(await store.addUsage(scopes, 250)).toEqual([250, 250, 250]);
    expect(await store.addUsage(scopes, 100)).toEqual([350, 350, 350]);
    expect(redis.batches).toHaveLength(2);
    for (const key of ["usage:anon:u1:2026-10-17", "usage:ip:::1:2026-10-17", "usage:global:all:2026-10-17"]) {
      expect(await rawGet(key)).toBe("350");
      expect(redis.ttl(key)).toBe(USAGE_TTL_S);
    }
  });

  it("rounds fractional spend up so it is never under-counted", async () => {
    expect(await store.addUsage([{ kind: "global" }], 0.2)).toEqual([1]);
  });

  it("starts fresh at midnight UTC", async () => {
    await store.addUsage(scopes, 400);
    clock = Date.UTC(2026, 9, 18, 0, 0, 1);
    expect(await store.getUsage(scopes)).toEqual([0, 0, 0]);
    expect(await store.addUsage(scopes, 1)).toEqual([1, 1, 1]);
  });

  it("handles empty scope lists without calling Redis", async () => {
    expect(await store.addUsage([], 10)).toEqual([]);
    expect(await store.getUsage([])).toEqual([]);
    expect(redis.batches).toHaveLength(0);
  });
});

describe("RedisStore events", () => {
  it("LPUSHes to events:{day} and trims to the newest 5,000", async () => {
    for (let i = 0; i < EVENTS_MAX + 3; i++) await store.logEvent({ at: T0, anonId: "u1", name: "moment_shown", props: { i } });
    const [items] = await redis.exec([["lrange", "events:2026-10-17", 0, -1]]);
    expect(items).toHaveLength(EVENTS_MAX);
    expect(JSON.parse(items[0]).props.i).toBe(EVENTS_MAX + 2);
    expect(redis.ttl("events:2026-10-17")).toBe(DATA_TTL_S);
  });

  it("listEvents skips corrupt entries and logs a count without the contents", async () => {
    await store.logEvent({ at: T0, anonId: "u1", name: "moment_shown" });
    await redis.exec([["lpush", "events:2026-10-17", "{not json"]]);
    await store.logEvent({ at: T0 + 1, anonId: "u1", name: "moment_answered" });
    expect((await store.listEvents("2026-10-17")).map((e) => e.name)).toEqual(["moment_shown", "moment_answered"]);
    expect(logs).toEqual(["[store] skipped 1 corrupt event(s) in listEvents"]);
  });
});

describe("RedisStore failures", () => {
  it("wraps Redis errors in StoreError and logs one redacted line", async () => {
    redis.failNext = new Error("fetch failed for https://secret-host.upstash.io token AAAAbbbbCCCCddddEEEEffffGGGGhhhh1234");
    const err = await store.putUser(newUser("u1")).catch((e: unknown) => e);
    expect(isStoreError(err)).toBe(true);
    expect((err as StoreError).op).toBe("putUser");
    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toMatch(/secret-host|AAAAbbbb/);
    expect(logs[0]).toContain("putUser");
  });

  it("treats corrupt JSON as a StoreError", async () => {
    await redis.exec([["set", "session:bad", "{not json", 60]]);
    await expect(store.getSession("bad")).rejects.toBeInstanceOf(StoreError);
  });
});
