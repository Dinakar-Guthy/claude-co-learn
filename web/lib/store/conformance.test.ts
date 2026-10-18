/** Behaviour every Store must share: runs against MemoryStore and RedisStore (in-memory fake Redis). */
import { describe, expect, it } from "vitest";
import type { Store, UsageScope } from "@/lib/contracts/store";
import type { TranscriptItem } from "@/lib/contracts/session";
import type { ApiMessages } from "@/lib/contracts/session";
import { MemoryStore } from "./memory";
import { RedisStore } from "./redis";
import { FakeRedis } from "./fake-redis";
import { newUser } from "./defaults";
import { makeBoss, makeMoment, makeSession } from "./fixtures";

const factories: [string, () => Store][] = [
  ["MemoryStore", () => new MemoryStore()],
  ["RedisStore (fake)", () => new RedisStore(new FakeRedis())],
];

describe.each(factories)("Store conformance: %s", (_name, make) => {
  it("round-trips users and returns null for unknown ids", async () => {
    const store = make();
    expect(await store.getUser("nobody")).toBeNull();
    const user = newUser("u1", 1000);
    user.settings.guardrails = { enabled: true, mode: "strict" };
    await store.putUser(user);
    expect(await store.getUser("u1")).toEqual(user);
  });

  it("returns copies, not live references", async () => {
    const store = make();
    const user = newUser("u1", 1000);
    await store.putUser(user);
    user.xp = 999;
    const read = await store.getUser("u1");
    expect(read?.xp).toBe(0);
    read!.xp = 5;
    expect((await store.getUser("u1"))?.xp).toBe(0);
  });

  it("indexes sessions per user, newest first, without duplicates on update", async () => {
    const store = make();
    await store.putSession(makeSession("s1", "u1", 100));
    await store.putSession(makeSession("s2", "u1", 300));
    await store.putSession(makeSession("s3", "u1", 200));
    await store.putSession(makeSession("other", "u2", 400));
    await store.putSession(makeSession("s1", "u1", 100, { status: "wrapped", title: "Renamed" }));

    expect(await store.listSessions("u1")).toEqual([
      { id: "s2", title: "Session s2", createdAt: 300, status: "active" },
      { id: "s3", title: "Session s3", createdAt: 200, status: "active" },
      { id: "s1", title: "Renamed", createdAt: 100, status: "wrapped" },
    ]);
    expect(await store.listSessions("nobody")).toEqual([]);
    expect(await store.getSession("s1")).toEqual(makeSession("s1", "u1", 100, { status: "wrapped", title: "Renamed" }));
    expect(await store.getSession("missing")).toBeNull();
  });

  it("round-trips API messages and transcripts, defaulting to empty", async () => {
    const store = make();
    expect(await store.getApiMessages("s1")).toEqual([]);
    expect(await store.getTranscript("s1")).toEqual([]);
    const messages: ApiMessages = [
      { role: "user", content: "Hi — let's train a model 🚀" },
      { role: "assistant", content: [{ type: "text", text: "Sure.", citations: null }] },
    ];
    const transcript: TranscriptItem[] = [
      { kind: "user", id: "t1", text: "Hi", at: 1 },
      { kind: "code_run", id: "t2", language: "python", code: "print(1)", stdout: "1\n", returnCode: 0, fileIds: ["f1"] },
    ];
    await store.putApiMessages("s1", messages);
    await store.putTranscript("s1", transcript);
    expect(await store.getApiMessages("s1")).toEqual(messages);
    expect(await store.getTranscript("s1")).toEqual(transcript);
    await store.putTranscript("s1", transcript.slice(0, 1));
    expect(await store.getTranscript("s1")).toEqual(transcript.slice(0, 1));
  });

  it("stores moments per session, upserts by id, lists by creation time", async () => {
    const store = make();
    await store.putMoment(makeMoment("m2", "s1", 20));
    await store.putMoment(makeMoment("m1", "s1", 10));
    await store.putMoment(makeMoment("x", "s2", 5));
    await store.putMoment(makeMoment("m2", "s1", 20, { status: "answered", verdict: "correct", xp: 15 }));

    expect((await store.listMoments("s1")).map((m) => [m.id, m.status])).toEqual([
      ["m1", "awaiting_answer"],
      ["m2", "answered"],
    ]);
    expect(await store.getMoment("s1", "m2")).toEqual(makeMoment("m2", "s1", 20, { status: "answered", verdict: "correct", xp: 15 }));
    expect(await store.getMoment("s1", "x")).toBeNull();
    expect(await store.listMoments("empty")).toEqual([]);
  });

  it("deletes a user's data and leaves other users alone", async () => {
    const store = make();
    await store.putUser(newUser("u1"));
    await store.putUser(newUser("u2"));
    const s1 = makeSession("s1", "u1", 1);
    await store.putSession({ ...s1, engine: { ...s1.engine, bosses: [{ id: "b1", startedAt: 1, concepts: [] }] } });
    await store.putSession(makeSession("s2", "u2", 2));
    await store.putTranscript("s1", [{ kind: "notice", id: "n1", text: "hi" }]);
    await store.putMoment(makeMoment("m1", "s1", 1));
    await store.putBoss(makeBoss("b1", "s1"));
    await store.putMastery("u1", "leakage", { theta: 2, n: 1, lastSeen: 1 });

    await store.deleteUserData("u1");
    expect(await store.getUser("u1")).toBeNull();
    expect(await store.listSessions("u1")).toEqual([]);
    expect(await store.getSession("s1")).toBeNull();
    expect(await store.getTranscript("s1")).toEqual([]);
    expect(await store.listMoments("s1")).toEqual([]);
    expect(await store.getBoss("s1", "b1")).toBeNull();
    expect(await store.getMastery("u1")).toEqual({});
    expect(await store.getUser("u2")).not.toBeNull();
    expect(await store.getSession("s2")).not.toBeNull();
  });

  it("stores bosses per session", async () => {
    const store = make();
    const boss = makeBoss("b1", "s1");
    await store.putBoss(boss);
    expect(await store.getBoss("s1", "b1")).toEqual(boss);
    expect(await store.getBoss("s2", "b1")).toBeNull();
    await store.putBoss({ ...boss, hp: 1, outcome: "victory" });
    expect((await store.getBoss("s1", "b1"))?.hp).toBe(1);
  });

  it("merges mastery per concept", async () => {
    const store = make();
    expect(await store.getMastery("u1")).toEqual({});
    await store.putMastery("u1", "overfitting", { theta: 0.2, n: 1, lastSeen: 10 });
    await store.putMastery("u1", "class imbalance", { theta: -0.5, n: 2, lastSeen: 20 });
    await store.putMastery("u1", "overfitting", { theta: 0.6, n: 2, lastSeen: 30 });
    expect(await store.getMastery("u1")).toEqual({
      overfitting: { theta: 0.6, n: 2, lastSeen: 30 },
      "class imbalance": { theta: -0.5, n: 2, lastSeen: 20 },
    });
    expect(await store.getMastery("u2")).toEqual({});
  });

  it("accumulates usage per scope and reports totals in order", async () => {
    const store = make();
    const scopes: UsageScope[] = [{ kind: "anon", id: "u1" }, { kind: "ip", id: "1.2.3.4" }, { kind: "global" }];
    expect(await store.getUsage(scopes)).toEqual([0, 0, 0]);
    expect(await store.addUsage(scopes, 1500)).toEqual([1500, 1500, 1500]);
    expect(await store.addUsage([{ kind: "anon", id: "u2" }, { kind: "global" }], 500)).toEqual([500, 2000]);
    expect(await store.getUsage(scopes)).toEqual([1500, 1500, 2000]);
    expect(await store.getUsage([{ kind: "ip", id: "u1" }])).toEqual([0]); // scopes don't collide
  });

  it("accepts events", async () => {
    const store = make();
    await expect(store.logEvent({ at: Date.now(), anonId: "u1", name: "unlock" })).resolves.toBeUndefined();
  });

  it("lists events per UTC day, oldest first, as copies", async () => {
    const store = make();
    const at = (iso: string) => Date.parse(iso);
    await store.logEvent({ at: at("2026-10-17T23:59:59Z"), anonId: "u1", name: "unlock" });
    await store.logEvent({ at: at("2026-10-18T00:00:00Z"), anonId: "u1", sessionId: "s1", name: "session_created", props: { demo: true } });
    await store.logEvent({ at: at("2026-10-18T09:30:00Z"), anonId: "u2", sessionId: "s2", name: "moment_shown", props: { concept: "recall", score: null } });

    expect(await store.listEvents("2026-10-16")).toEqual([]);
    expect((await store.listEvents("2026-10-17")).map((e) => e.name)).toEqual(["unlock"]);
    const day = await store.listEvents("2026-10-18");
    expect(day).toEqual([
      { at: at("2026-10-18T00:00:00Z"), anonId: "u1", sessionId: "s1", name: "session_created", props: { demo: true } },
      { at: at("2026-10-18T09:30:00Z"), anonId: "u2", sessionId: "s2", name: "moment_shown", props: { concept: "recall", score: null } },
    ]);
    day[0].props!.demo = false;
    expect((await store.listEvents("2026-10-18"))[0].props).toEqual({ demo: true });
  });
});
