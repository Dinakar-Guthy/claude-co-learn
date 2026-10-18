/** Route wiring: identity (401), ownership (404), validation (400), limits (429), background work, and contract shapes. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateSessionResponse, GradeResponse, SessionView, StartBossResponse, WrapUpResponse } from "@/lib/contracts/api";
import type { LimitCheck } from "@/lib/platform/limits";
import { MemoryStore } from "@/lib/store/memory";
import { ANON, mockContent } from "./test-helpers";

const state = vi.hoisted(() => ({
  anonId: null as string | null,
  pending: [] as Promise<unknown>[],
  limit: { ok: true } as LimitCheck,
}));
const store = new MemoryStore();
const content = mockContent();

vi.mock("@/lib/platform/anon", () => ({ readAnonId: async () => state.anonId, clientIp: () => "1.2.3.4" }));
vi.mock("@/lib/platform/limits", () => ({ checkLimits: async () => state.limit, recordUsage: async () => {} }));
vi.mock("@/lib/store", () => ({ getStore: () => store }));
vi.mock("@/lib/claude/content", () => ({ content }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<unknown>) => state.pending.push(fn()) }));

const { POST: createSession } = await import("@/app/api/session/route");
const { GET: getSession } = await import("@/app/api/session/[id]/route");
const { POST: grade } = await import("@/app/api/moment/grade/route");
const { POST: boss } = await import("@/app/api/boss/route");
const { GET: story } = await import("@/app/api/story/route");
const { POST: wrapup } = await import("@/app/api/wrapup/route");

const post = (body: unknown) => new Request("http://test/api", { method: "POST", body: JSON.stringify(body) });
const flush = async () => {
  await Promise.all(state.pending.splice(0));
};
const intent = { goal: "Train a churn model", familiarity: "new", minutes: 10, demo: true };

beforeEach(() => {
  state.anonId = ANON;
  state.limit = { ok: true };
});

describe("Track D routes", () => {
  it("401 without the anon cookie", async () => {
    state.anonId = null;
    expect((await createSession(post({ intent }))).status).toBe(401);
    expect((await getSession(new Request("http://test"), { params: Promise.resolve({ id: "x" }) })).status).toBe(401);
  });

  it("400 on an invalid intent; 429 when limits block", async () => {
    expect((await createSession(post({ intent: { goal: "" } }))).status).toBe(400);
    state.limit = { ok: false, code: "spend_cap", message: "Daily limit reached" };
    const res = await createSession(post({ intent }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "spend_cap" });
  });

  it("runs a full session: create → view → boss → grade → story → wrap-up", async () => {
    const created = (await (await createSession(post({ intent }))).json()) as CreateSessionResponse;
    await flush();
    const view = (await (await getSession(new Request("http://test"), { params: Promise.resolve({ id: created.sessionId }) })).json()) as SessionView;
    expect(view.title).toBe("Churn model");
    expect(view.sketch).toBeDefined();

    state.anonId = "33333333-3333-4333-8333-333333333333";
    expect((await getSession(new Request("http://test"), { params: Promise.resolve({ id: created.sessionId }) })).status).toBe(404);
    expect((await boss(post({ sessionId: created.sessionId }))).status).toBe(404);
    state.anonId = ANON;

    const started = (await (await boss(post({ sessionId: created.sessionId }))).json()) as StartBossResponse;
    expect(started.boss.maxHp).toBe(2);
    expect(JSON.stringify(started)).not.toContain("correct_index");

    let last: GradeResponse | undefined;
    for (const momentId of started.boss.momentIds) {
      last = (await (await grade(post({ sessionId: created.sessionId, momentId, action: "submit", answer: "overfitting" }))).json()) as GradeResponse;
    }
    expect(last?.boss).toMatchObject({ done: true, outcome: "flawless" });
    expect(last?.continueWith).toMatchObject({ kind: "boss_result" });
    await flush();

    const chapter = await (await story(new Request(`http://test/api/story?sessionId=${created.sessionId}&trigger=boss:${started.boss.id}`))).json();
    expect(chapter.chapter).toMatchObject({ title: "Chapter" });
    expect((await story(new Request(`http://test/api/story?sessionId=${created.sessionId}`))).status).toBe(400);

    const wrapped = (await (await wrapup(post({ sessionId: created.sessionId }))).json()) as WrapUpResponse;
    expect(wrapped.sessionXp).toBe(15 + 15 + 75 + 30);
    expect(wrapped.chapter?.trigger).toBe("wrapup");
    expect(wrapped.user.level.level).toBe(2);
  });

  it("400 on malformed grade requests", async () => {
    expect((await grade(post({ sessionId: "s", momentId: "m", action: "explode" }))).status).toBe(400);
    expect((await grade(post({ sessionId: "s", momentId: "m", action: "mc", choice: 9 }))).status).toBe(400);
  });
});
