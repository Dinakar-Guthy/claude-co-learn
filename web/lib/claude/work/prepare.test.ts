import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store/memory";
import { MAX_MESSAGE_CHARS, isPausedAssistant, prepareTurn } from "./prepare";
import { makeSession, momentInput } from "./testing";
import { continueText } from "./userText";

async function setup() {
  const store = new MemoryStore();
  const session = makeSession();
  await store.putSession(session);
  return { store, session, anonId: session.anonId };
}

describe("prepareTurn", () => {
  it("rejects malformed bodies", async () => {
    const { store, anonId } = await setup();
    expect(await prepareTurn(store, anonId, "ip", null)).toMatchObject({ ok: false, status: 400 });
    expect(await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "nope" })).toMatchObject({ ok: false, status: 400 });
  });

  it("404s for unknown sessions or another user's session", async () => {
    const { store } = await setup();
    expect(await prepareTurn(store, "someone-else", "ip", { sessionId: "s1", kind: "continue" })).toMatchObject({ ok: false, status: 404 });
    expect(await prepareTurn(store, "x", "ip", { sessionId: "missing", kind: "continue" })).toMatchObject({ ok: false, status: 404 });
  });

  it("validates message length", async () => {
    const { store, anonId } = await setup();
    expect(await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "message", text: "   " })).toMatchObject({ status: 400 });
    expect(await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "message", text: "x".repeat(MAX_MESSAGE_CHARS + 1) })).toMatchObject({ status: 400 });
    const ok = await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "message", text: " hi " });
    expect(ok).toMatchObject({ ok: true, plan: { modelText: "hi", userText: "hi" } });
  });

  it("builds moment_response text from the stored record and checks its state", async () => {
    const { store, anonId, session } = await setup();
    const base = { sessionId: session.id, createdAt: 0, type: "decide" as const, candidate: momentInput(), mcOffered: false };
    await store.putMoment({ ...base, id: "m1", status: "awaiting_answer" });
    await store.putMoment({ ...base, id: "m2", status: "answered", answer: "recall", verdict: "correct", why: "w" });
    await store.putMoment({ ...base, id: "m3", status: "answered", bossId: "b1" });
    expect(await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "moment_response", momentId: "zz" })).toMatchObject({ status: 404 });
    expect(await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "moment_response", momentId: "m1" })).toMatchObject({ status: 409 });
    expect(await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "moment_response", momentId: "m3" })).toMatchObject({ status: 400 });
    const ok = await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "moment_response", momentId: "m2" });
    expect(ok.ok && ok.plan.modelText).toContain('"recall"');
  });

  it("builds boss_result text once the boss has an outcome", async () => {
    const { store, anonId, session } = await setup();
    const boss = { id: "b1", sessionId: session.id, name: "The Overfit Bug", ascii: "bug" as const, intro: "", maxHp: 3, hp: 3, momentIds: [], createdAt: 0 };
    await store.putBoss(boss);
    expect(await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "boss_result", bossId: "b1" })).toMatchObject({ status: 409 });
    await store.putBoss({ ...boss, hp: 0, outcome: "flawless" });
    await store.putMoment({ id: "q1", sessionId: session.id, createdAt: 0, type: "boss", bossId: "b1", candidate: momentInput({ concept: "overfitting" }), status: "answered", mcOffered: false });
    const ok = await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "boss_result", bossId: "b1" });
    expect(ok.ok && ok.plan.modelText).toContain("flawless");
    expect(ok.ok && ok.plan.modelText).toContain("overfitting");
  });

  it("continue: resumes a paused turn, otherwise asks Claude to continue", async () => {
    const { store, anonId, session } = await setup();
    const ok = await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "continue" });
    expect(ok.ok && ok.plan.modelText).toBe(continueText("co-learn"));
    await store.putApiMessages(session.id, [{ role: "assistant", content: [{ type: "server_tool_use", id: "x", name: "bash_code_execution", input: {} }] }]);
    const resumed = await prepareTurn(store, anonId, "ip", { sessionId: "s1", kind: "continue" });
    expect(resumed.ok && resumed.plan.modelText).toBeNull();
  });
});

describe("isPausedAssistant", () => {
  it("only matches assistant turns ending in a server tool call", () => {
    expect(isPausedAssistant(undefined)).toBe(false);
    expect(isPausedAssistant({ role: "assistant", content: [{ type: "text", text: "hi" }] })).toBe(false);
    expect(isPausedAssistant({ role: "user", content: [{ type: "server_tool_use" }] })).toBe(false);
  });
});
