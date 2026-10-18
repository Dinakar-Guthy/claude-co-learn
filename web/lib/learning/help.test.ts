import { describe, expect, it } from "vitest";
import type { HelpRequest } from "@/lib/contracts/api";
import { initialEngineState } from "@/lib/contracts/engine";
import { HttpError } from "./deps";
import { handleGrade } from "./grade";
import { handleHelp } from "./help";
import { ANON, makeDeps, seedMoment, seedSession } from "./test-helpers";

const help = (r: { action: "hint" | "teach" } | { action: "ask"; text: string }, momentId = "m1") =>
  ({ sessionId: "s1", momentId, ...r }) as HelpRequest;

async function setup(moment: Parameters<typeof seedMoment>[1] = {}) {
  const deps = makeDeps();
  await seedSession(deps, { engine: { ...initialEngineState(), pendingMomentId: "m1" } });
  await seedMoment(deps, moment);
  return deps;
}

describe("handleHelp", () => {
  it("gives up to two hints and marks the help level", async () => {
    const deps = await setup();
    await handleHelp(deps, ANON, help({ action: "hint" }));
    const { body } = await handleHelp(deps, ANON, help({ action: "hint" }));
    expect(body.moment.help?.hints).toHaveLength(2);
    expect(body.moment.helpLevel).toBe("hint");
    const third = await handleHelp(deps, ANON, help({ action: "hint" }));
    expect(third.body.moment.help?.hints).toHaveLength(2);
    expect(deps.content.generateHint).toHaveBeenCalledTimes(2);
    expect(deps.store.events.filter((e) => e.name === "help_hint")).toHaveLength(2);
  });

  it("teaches once and raises the level to teach", async () => {
    const deps = await setup();
    await handleHelp(deps, ANON, help({ action: "hint" }));
    const { body } = await handleHelp(deps, ANON, help({ action: "teach" }));
    await handleHelp(deps, ANON, help({ action: "teach" }));
    expect(body.moment.help?.lesson).toContain("worked example");
    expect(body.moment.helpLevel).toBe("teach");
    expect(deps.content.teachConcept).toHaveBeenCalledTimes(1);
  });

  it("declines the first request for the answer, then reveals it and closes the question", async () => {
    const deps = await setup();
    const first = await handleHelp(deps, ANON, help({ action: "ask", text: "just tell me the answer" }));
    expect(first.body.moment.status).toBe("awaiting_answer");
    expect(first.body.moment.help?.thread.at(-1)?.text).toBe("Try a guess first!");
    expect(first.body.moment.answerExplanation).toBeUndefined();

    const second = await handleHelp(deps, ANON, help({ action: "ask", text: "please just tell me the answer" }));
    expect(second.body.moment.status).toBe("revealed");
    expect(second.body.moment.answerExplanation).toContain("85%");
    expect(second.body.continueWith).toEqual({ sessionId: "s1", kind: "moment_response", momentId: "m1" });
    const session = await deps.store.getSession("s1");
    expect(session?.engine.pendingMomentId).toBeUndefined();
    expect(session?.engine.recentOutcomes.at(-1)).toMatchObject({ momentId: "m1", score: 0 });
    expect((await deps.store.getUser(ANON))?.xp).toBe(0);
    expect(deps.store.events.map((e) => e.name)).toContain("moment_revealed");
  });

  it("answers freely after an attempt and doesn't change the help level", async () => {
    const deps = await setup({ status: "answered", answer: "majority class", verdict: "correct" });
    const { body } = await handleHelp(deps, ANON, help({ action: "ask", text: "why was that right? tell me the answer" }));
    expect(body.moment.status).toBe("answered");
    expect(body.moment.helpLevel).toBeUndefined();
    expect(body.continueWith).toBeUndefined();
  });

  it("offers bosses hints only", async () => {
    const deps = await setup({ bossId: "b1", type: "boss" });
    await expect(handleHelp(deps, ANON, help({ action: "teach" }))).rejects.toBeInstanceOf(HttpError);
    const { body } = await handleHelp(deps, ANON, help({ action: "hint" }));
    expect(body.moment.help?.hints).toHaveLength(1);
  });

  it("refuses hints on an answered question", async () => {
    const deps = await setup({ status: "answered", verdict: "correct" });
    await expect(handleHelp(deps, ANON, help({ action: "hint" }))).rejects.toMatchObject({ status: 409 });
  });
});

describe("credit after help (decision log 2026-10-18)", () => {
  it("a correct answer after hints earns 0.8 and 8 XP", async () => {
    const deps = await setup();
    await handleHelp(deps, ANON, help({ action: "hint" }));
    const { body } = await handleGrade(deps, ANON, { sessionId: "s1", momentId: "m1", action: "submit", answer: "majority class" });
    expect(body.xp?.amount).toBe(8);
    expect((await deps.store.getSession("s1"))?.engine.recentOutcomes.at(-1)?.score).toBe(0.8);
  });

  it("a correct answer after Teach me earns 0.6 and 5 XP", async () => {
    const deps = await setup();
    await handleHelp(deps, ANON, help({ action: "teach" }));
    const { body } = await handleGrade(deps, ANON, { sessionId: "s1", momentId: "m1", action: "submit", answer: "majority class" });
    expect(body.xp?.amount).toBe(5);
    expect((await deps.store.getSession("s1"))?.engine.recentOutcomes.at(-1)?.score).toBe(0.6);
  });

  it("help then options earns 0.5 and 4 XP", async () => {
    const deps = await setup({ mcOffered: true });
    await handleHelp(deps, ANON, help({ action: "ask", text: "what does majority class mean?" }));
    const { body } = await handleGrade(deps, ANON, { sessionId: "s1", momentId: "m1", action: "mc", choice: 0 });
    expect(body.xp?.amount).toBe(4);
    expect((await deps.store.getSession("s1"))?.engine.recentOutcomes.at(-1)?.score).toBe(0.5);
  });
});

describe("reporting a graded question takes its credit back", () => {
  it("revokes XP, the mastery change, and the outcome", async () => {
    const deps = await setup();
    await handleGrade(deps, ANON, { sessionId: "s1", momentId: "m1", action: "submit", answer: "majority class" });
    expect((await deps.store.getUser(ANON))?.xp).toBe(10);
    const before = (await deps.store.getMastery(ANON))["class imbalance"];
    expect(before.n).toBe(1);

    const { body } = await handleGrade(deps, ANON, { sessionId: "s1", momentId: "m1", action: "report" });
    expect(body.moment.status).toBe("reported");
    expect(body.continueWith).toBeUndefined();
    expect((await deps.store.getUser(ANON))?.xp).toBe(0);
    const after = (await deps.store.getMastery(ANON))["class imbalance"];
    expect(after.n).toBe(0);
    expect(after.theta).toBeCloseTo(2.5); // familiarity "some" starting theta
    expect((await deps.store.getSession("s1"))?.engine.recentOutcomes).toHaveLength(0);
  });
});
