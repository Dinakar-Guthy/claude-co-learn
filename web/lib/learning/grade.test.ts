import { describe, expect, it, vi } from "vitest";
import type { GradeRequest } from "@/lib/contracts/api";
import { initialEngineState } from "@/lib/contracts/engine";
import { newUser } from "@/lib/store/defaults";
import { HttpError } from "./deps";
import { handleGrade } from "./grade";
import { ANON, OTHER, candidate, makeDeps, mockContent, seedMoment, seedSession } from "./test-helpers";

type Body<T> = T extends unknown ? Omit<T, "sessionId" | "momentId"> & { momentId?: string } : never;
const req = (r: Body<GradeRequest>) => ({ sessionId: "s1", momentId: "m1", ...r }) as GradeRequest;

function setup(grade: "correct" | "partial" | "incorrect" = "correct") {
  const content = mockContent({
    gradeAnswer: vi.fn(async () => ({ verdict: grade, why: `Graded ${grade}.`, missingPoints: grade === "correct" ? [] : ["majority class"] })),
  });
  return { deps: makeDeps(content), content };
}

describe("handleGrade: submit", () => {
  it("resolves a correct answer with score 1, mastery, engine outcome, XP, and a continuation", async () => {
    const { deps } = setup("correct");
    await seedSession(deps, { engine: { ...initialEngineState(), pendingMomentId: "m1" } });
    await seedMoment(deps);

    const { body } = await handleGrade(deps, ANON, req({ action: "submit", answer: "majority class" }));

    expect(body.verdict).toBe("correct");
    expect(body.offerMC).toBe(false);
    expect(body.xp?.amount).toBe(10);
    expect(body.continueWith).toEqual({ sessionId: "s1", kind: "moment_response", momentId: "m1" });
    expect(body.moment.status).toBe("answered");
    expect(body.moment.mcOptions).toBeUndefined();

    const session = await deps.store.getSession("s1");
    expect(session?.engine.recentOutcomes.at(-1)).toMatchObject({ momentId: "m1", score: 1, concept: "class imbalance" });
    expect(session?.engine.pendingMomentId).toBeUndefined();
    expect((await deps.store.getMastery(ANON))["class imbalance"].n).toBe(1);
    expect((await deps.store.getUser(ANON))?.xp).toBe(10);
    expect(deps.store.events.map((e) => e.name)).toContain("moment_answered");
  });

  it("resolves a partial answer with score 0.5", async () => {
    const { deps } = setup("partial");
    await seedSession(deps);
    await seedMoment(deps);
    const { body } = await handleGrade(deps, ANON, req({ action: "submit", answer: "something about classes" }));
    expect(body.verdict).toBe("partial");
    expect(body.xp?.amount).toBe(5);
    expect((await deps.store.getSession("s1"))?.engine.recentOutcomes.at(-1)?.score).toBe(0.5);
  });

  it("offers MC after a first miss without touching mastery or XP", async () => {
    const { deps } = setup("incorrect");
    await seedSession(deps);
    await seedMoment(deps);
    const { body } = await handleGrade(deps, ANON, req({ action: "submit", answer: "no idea" }));

    expect(body.offerMC).toBe(true);
    expect(body.verdict).toBe("incorrect");
    expect(body.continueWith).toBeUndefined();
    expect(body.xp).toBeUndefined();
    expect(body.moment.status).toBe("awaiting_answer");
    expect(body.moment.mcOptions).toHaveLength(3);
    expect(body.moment.why).toBe("Graded incorrect.");
    expect(await deps.store.getMastery(ANON)).toEqual({});
    expect((await deps.store.getSession("s1"))?.engine.recentOutcomes).toHaveLength(0);
    expect(deps.store.events.map((e) => e.name)).toContain("mc_offered");
  });

  it("resolves with score 0 when the answer is wrong after MC was already offered", async () => {
    const { deps } = setup("incorrect");
    await seedSession(deps);
    await seedMoment(deps, { mcOffered: true });
    const { body } = await handleGrade(deps, ANON, req({ action: "submit", answer: "still wrong" }));
    expect(body.offerMC).toBe(false);
    expect(body.moment.status).toBe("answered");
    expect(body.xp).toBeUndefined();
    expect(body.continueWith?.kind).toBe("moment_response");
    expect((await deps.store.getSession("s1"))?.engine.recentOutcomes.at(-1)?.score).toBe(0);
  });

  it("Learn mode grades a prediction right away (there's no run to wait for)", async () => {
    const { deps, content } = setup();
    await seedSession(deps, { intent: { goal: "Rome", familiarity: "some", minutes: 10, demo: false, mode: "learn" } });
    await seedMoment(deps, { type: "predict", candidate: candidate({ type: "predict", timing: "before_step" }) });
    const { body } = await handleGrade(deps, ANON, req({ action: "submit", answer: "He marches on Rome" }));
    expect(content.gradeAnswer).toHaveBeenCalled();
    expect(body.moment.status).toBe("answered");
    expect(body.continueWith).toEqual({ sessionId: "s1", kind: "moment_response", momentId: "m1" });
  });

  it("stores a prediction without grading and waits for the real result", async () => {
    const { deps, content } = setup();
    await seedSession(deps);
    await seedMoment(deps, { type: "predict", candidate: candidate({ type: "predict", timing: "before_step" }) });
    const { body } = await handleGrade(deps, ANON, req({ action: "submit", answer: "about 85%" }));
    expect(content.gradeAnswer).not.toHaveBeenCalled();
    expect(body.moment.status).toBe("awaiting_prediction_result");
    expect(body.moment.answer).toBe("about 85%");
    expect(body.xp).toBeUndefined();
    expect(body.continueWith).toEqual({ sessionId: "s1", kind: "moment_response", momentId: "m1" });
  });

  it("rejects empty answers and already-answered moments", async () => {
    const { deps } = setup();
    await seedSession(deps);
    await seedMoment(deps);
    await expect(handleGrade(deps, ANON, req({ action: "submit", answer: "   " }))).rejects.toMatchObject({ status: 400 });
    await seedMoment(deps, { status: "answered" });
    await expect(handleGrade(deps, ANON, req({ action: "submit", answer: "x" }))).rejects.toMatchObject({ status: 409 });
  });

  it("returns 404 for sessions owned by someone else or missing moments", async () => {
    const { deps } = setup();
    await seedSession(deps);
    await seedMoment(deps);
    await expect(handleGrade(deps, OTHER, req({ action: "submit", answer: "x" }))).rejects.toBeInstanceOf(HttpError);
    await expect(handleGrade(deps, OTHER, req({ action: "submit", answer: "x" }))).rejects.toMatchObject({ status: 404 });
    await expect(handleGrade(deps, ANON, req({ action: "skip", momentId: "nope" }))).rejects.toMatchObject({ status: 404 });
  });
});

describe("handleGrade: multiple choice", () => {
  it("grades a correct MC answer as 0.6 and reveals the correct index", async () => {
    const { deps, content } = setup();
    await seedSession(deps);
    await seedMoment(deps, { mcOffered: true });
    const { body } = await handleGrade(deps, ANON, req({ action: "mc", choice: 0 }));
    expect(content.gradeAnswer).not.toHaveBeenCalled();
    expect(body.verdict).toBe("correct");
    expect(body.moment.correctIndex).toBe(0);
    expect(body.moment.mcChoice).toBe(0);
    expect(body.xp?.amount).toBe(5);
    expect(body.moment.why).toBe("Right: the majority class dominates.");
    expect((await deps.store.getSession("s1"))?.engine.recentOutcomes.at(-1)?.score).toBe(0.6);
  });

  it("explains a wrong MC choice with its why plus the correct option's why", async () => {
    const { deps } = setup();
    await seedSession(deps);
    await seedMoment(deps, { mcOffered: true });
    const { body } = await handleGrade(deps, ANON, req({ action: "mc", choice: 1 }));
    expect(body.verdict).toBe("incorrect");
    expect(body.moment.why).toContain("Speed isn't the issue.");
    expect(body.moment.why).toContain("It rewards the majority class");
    expect(body.moment.why).toContain("Right: the majority class dominates.");
    expect(body.moment.correctIndex).toBe(0);
    expect(body.xp).toBeUndefined();
    expect((await deps.store.getSession("s1"))?.engine.recentOutcomes.at(-1)?.score).toBe(0);
  });

  it("rejects out-of-range choices", async () => {
    const { deps } = setup();
    await seedSession(deps);
    await seedMoment(deps, { mcOffered: true });
    await expect(handleGrade(deps, ANON, req({ action: "mc", choice: 3 }))).rejects.toMatchObject({ status: 400 });
  });

  it("show_options reveals the options without grading", async () => {
    const { deps } = setup();
    await seedSession(deps);
    await seedMoment(deps);
    const { body } = await handleGrade(deps, ANON, req({ action: "show_options" }));
    expect(body.moment.mcOptions).toEqual(["It rewards the majority class", "It is too slow", "It needs scaling"]);
    expect(body.moment.correctIndex).toBeUndefined();
    expect(body.moment.status).toBe("awaiting_answer");
    expect(body.continueWith).toBeUndefined();
  });
});

describe("handleGrade: skip, defer, report", () => {
  it.each([
    ["skip", "skipped", "moment_skipped"],
    ["defer", "deferred", "moment_deferred"],
    ["report", "reported", "moment_reported"],
  ] as const)("%s sets status %s with no mastery or XP and clears the pending moment", async (action, status, event) => {
    const { deps } = setup();
    await seedSession(deps, { engine: { ...initialEngineState(), pendingMomentId: "m1" } });
    await seedMoment(deps);
    const { body } = await handleGrade(deps, ANON, req({ action }));
    expect(body.moment.status).toBe(status);
    expect(body.xp).toBeUndefined();
    expect(body.continueWith).toEqual({ sessionId: "s1", kind: "moment_response", momentId: "m1" });
    expect(await deps.store.getMastery(ANON)).toEqual({});
    expect((await deps.store.getUser(ANON))?.xp).toBe(0);
    expect((await deps.store.getSession("s1"))?.engine.pendingMomentId).toBeUndefined();
    expect(deps.store.events.map((e) => e.name)).toContain(event);
  });

  it("grades a deferred moment during wrap-up without continuing the work", async () => {
    const { deps } = setup("correct");
    await seedSession(deps, { status: "wrapped" });
    await seedMoment(deps, { status: "deferred" });
    const { body } = await handleGrade(deps, ANON, req({ action: "submit", answer: "majority class" }));
    expect(body.moment.status).toBe("answered");
    expect(body.xp?.amount).toBe(10);
    expect(body.continueWith).toBeUndefined();
  });

  it("keeps a deferred moment deferred when MC is offered during wrap-up", async () => {
    const { deps } = setup("incorrect");
    await seedSession(deps, { status: "wrapped" });
    await seedMoment(deps, { status: "deferred" });
    const { body } = await handleGrade(deps, ANON, req({ action: "submit", answer: "nope" }));
    expect(body.offerMC).toBe(true);
    expect(body.moment.status).toBe("deferred");
    const mc = await handleGrade(deps, ANON, req({ action: "mc", choice: 0 }));
    expect(mc.body.continueWith).toBeUndefined();
  });

  it("reporting an answered moment doesn't trigger another continuation", async () => {
    const { deps } = setup();
    await seedSession(deps);
    await seedMoment(deps, { status: "answered", verdict: "correct" });
    const { body } = await handleGrade(deps, ANON, req({ action: "report" }));
    expect(body.moment.status).toBe("reported");
    expect(body.continueWith).toBeUndefined();
    await expect(handleGrade(deps, ANON, req({ action: "report" }))).rejects.toMatchObject({ status: 409 });
  });
});

describe("handleGrade: XP and level-up", () => {
  it("levels up, applies rewards to unlocks, and logs level_up", async () => {
    const { deps } = setup("correct");
    await seedSession(deps);
    await deps.store.putUser({ ...newUser(ANON), xp: 95 });
    await seedMoment(deps);
    const { body } = await handleGrade(deps, ANON, req({ action: "submit", answer: "majority class" }));
    expect(body.xp?.levelUp).toEqual({ from: 1, to: 2, rewards: [expect.objectContaining({ id: "sunset", kind: "theme" })] });
    expect(body.xp?.level.level).toBe(2);
    const user = await deps.store.getUser(ANON);
    expect(user?.level).toBe(2);
    expect(user?.unlocks.themes).toContain("sunset");
    expect(deps.store.events.find((e) => e.name === "level_up")?.props).toMatchObject({ from: 1, to: 2 });
  });
});
