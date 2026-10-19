import { describe, expect, it, vi } from "vitest";
import type { GradeRequest } from "@/lib/contracts/api";
import { initialEngineState } from "@/lib/contracts/engine";
import { ContentRefusalError } from "@/lib/claude/content/errors";
import { engine } from "@/lib/engine";
import { bossConcepts, mergeAwards, skipBoss, startBoss } from "./boss";
import { handleGrade } from "./grade";
import { ANON, candidate, makeDeps, mockContent, seedSession } from "./test-helpers";

async function bossSetup(grades: ("correct" | "partial" | "incorrect")[] = [], story = true) {
  const queue = [...grades];
  const content = mockContent({
    gradeAnswer: vi.fn(async () => ({ verdict: queue.shift() ?? "correct", why: "ok", missingPoints: [] })),
  });
  const deps = makeDeps(content);
  const session = await seedSession(deps, {
    engine: { ...initialEngineState(), conceptsSinceBoss: ["class imbalance", "metric choice", "data leakage"] },
    story: { enabled: story, chapters: [] },
  });
  await deps.store.putTranscript("s1", [
    { kind: "assistant_text", id: "a1", text: "Trained logistic regression." },
    { kind: "code_run", id: "c1", language: "python", code: "print(1)", stdout: "train recall 0.98, test recall 0.52", fileIds: [] },
  ]);
  const { body } = await startBoss(deps, session);
  return { deps, content, boss: body.boss };
}

const grade = (momentId: string, r: Partial<GradeRequest>) => ({ sessionId: "s1", momentId, ...r }) as GradeRequest;

describe("startBoss", () => {
  it("creates boss moments, boss state, a transcript item, and records the boss in engine state", async () => {
    const { deps, content, boss } = await bossSetup();
    const call = vi.mocked(content.generateBoss).mock.calls[0][0];
    expect(call.concepts).toEqual(["class imbalance", "metric choice", "data leakage"]);
    expect(call.workSummary).toContain("test recall 0.52");
    // Boss difficulty comes from the real engine (target success 0.72 for a fresh concept at this familiarity).
    expect(call.targetDifficulty).toBe(engine.targetDifficulty(undefined, "boss", "some", []));

    expect(boss).toMatchObject({ name: "The Overfit Bug", hp: 2, maxHp: 2, ascii: "bug" });
    expect(boss.momentIds).toHaveLength(2);
    expect(boss.currentMomentId).toBe(boss.momentIds[0]);
    const moments = await deps.store.listMoments("s1");
    expect(moments.map((m) => [m.type, m.status, m.bossId])).toEqual([
      ["boss", "awaiting_answer", boss.id],
      ["boss", "awaiting_answer", boss.id],
    ]);
    const session = await deps.store.getSession("s1");
    expect(session?.engine.bosses).toEqual([expect.objectContaining({ id: boss.id, concepts: ["overfitting", "metric choice"] })]);
    expect((await deps.store.getTranscript("s1")).at(-1)).toMatchObject({ kind: "boss", bossId: boss.id });
    expect(deps.store.events.map((e) => e.name)).toContain("boss_started");
  });

  it("returns the active boss instead of generating another", async () => {
    const { deps, content, boss } = await bossSetup();
    const again = await startBoss(deps, (await deps.store.getSession("s1"))!);
    expect(again.body.boss.id).toBe(boss.id);
    expect(content.generateBoss).toHaveBeenCalledTimes(1);
  });

  it("drops questions that fail verification, but never all of them", async () => {
    const content = mockContent({ verifyMoment: vi.fn(async ({ candidate: c }) => ({ ok: c.question !== "Q1?" })) });
    const deps = makeDeps(content);
    const { body } = await startBoss(deps, await seedSession(deps));
    expect(body.boss.maxHp).toBe(1);

    const rejectAll = makeDeps(mockContent({ verifyMoment: vi.fn(async () => ({ ok: false })) }));
    const all = await startBoss(rejectAll, await seedSession(rejectAll));
    expect(all.body.boss.maxHp).toBe(2);
  });

  it("falls back to recent outcome concepts, then the sketch radar", () => {
    const base = { engine: initialEngineState() } as Parameters<typeof bossConcepts>[0];
    const withOutcomes = { ...base, engine: { ...base.engine, recentOutcomes: [{ momentId: "a", concept: "x", type: "decide" as const, score: 1, at: 1 }] } };
    expect(bossConcepts(withOutcomes)).toEqual(["x"]);
    const withSketch = { ...base, sketch: { title: "", goalSummary: "", novice: false, milestones: [], conceptRadar: [{ concept: "y", whyItMatters: "", likelyMomentType: "decide" as const }] } };
    expect(bossConcepts(withSketch)).toEqual(["y"]);
  });
});

describe("boss hits and outcome", () => {
  it("a flawless run: full hits, boss XP, outcome, reset concepts, chapter in background", async () => {
    const { deps, content, boss } = await bossSetup(["correct", "correct"]);
    const [q1, q2] = boss.momentIds;

    const first = await handleGrade(deps, ANON, grade(q1, { action: "submit", answer: "overfitting" }));
    expect(first.body.boss).toEqual({ bossId: boss.id, hp: 1, maxHp: 2, done: false, outcome: undefined, nextMomentId: q2 });
    expect(first.body.xp?.amount).toBe(15);
    expect(first.body.continueWith).toBeUndefined();
    expect(first.background).toHaveLength(0);

    const second = await handleGrade(deps, ANON, grade(q2, { action: "submit", answer: "recall" }));
    expect(second.body.boss).toMatchObject({ hp: 0, done: true, outcome: "flawless", nextMomentId: undefined });
    expect(second.body.xp?.amount).toBe(15 + 75);
    expect(second.body.continueWith).toEqual({ sessionId: "s1", kind: "boss_result", bossId: boss.id });

    const session = await deps.store.getSession("s1");
    expect(session?.engine.conceptsSinceBoss).toEqual([]);
    expect(session?.engine.bosses[0].outcome).toBe("flawless");
    expect((await deps.store.getBoss("s1", boss.id))?.outcome).toBe("flawless");
    expect(deps.store.events.find((e) => e.name === "boss_finished")?.props).toMatchObject({ outcome: "flawless", hits: 2 });

    for (const task of second.background) await task();
    expect(content.generateChapter).toHaveBeenCalledWith(expect.objectContaining({ trigger: `boss:${boss.id}`, beat: "boss", performance: "flawless" }));
    const after = await deps.store.getSession("s1");
    expect(after?.story.bible?.genre).toBe("sky-pirate romp");
    expect(after?.story.chapters).toEqual([expect.objectContaining({ trigger: `boss:${boss.id}`, title: "Chapter" })]);
    expect((await deps.store.getTranscript("s1")).at(-1)).toMatchObject({ kind: "story", chapterId: after?.story.chapters[0].id });
  });

  it("with the story off (Co-learn), a finished boss writes no chapter and the work resumes", async () => {
    const { deps, content, boss } = await bossSetup(["correct", "correct"], false);
    const [q1, q2] = boss.momentIds;
    await handleGrade(deps, ANON, grade(q1, { action: "submit", answer: "overfitting" }));
    const second = await handleGrade(deps, ANON, grade(q2, { action: "submit", answer: "recall" }));
    expect(second.body.boss).toMatchObject({ done: true, outcome: "flawless" });
    expect(second.body.xp?.amount).toBe(15 + 75);
    expect(second.body.continueWith).toEqual({ sessionId: "s1", kind: "boss_result", bossId: boss.id });
    expect(second.background).toHaveLength(0);
    expect(content.generateStoryBible).not.toHaveBeenCalled();
    expect(content.generateChapter).not.toHaveBeenCalled();
    expect((await deps.store.getSession("s1"))?.story.chapters).toEqual([]);
  });

  it("partial and MC answers land half hits; MC is offered on a boss miss", async () => {
    const { deps, boss } = await bossSetup(["partial", "incorrect"]);
    const [q1, q2] = boss.momentIds;
    const first = await handleGrade(deps, ANON, grade(q1, { action: "submit", answer: "meh" }));
    expect(first.body.boss?.hp).toBe(1.5);
    expect(first.body.xp?.amount).toBe(8);

    const miss = await handleGrade(deps, ANON, grade(q2, { action: "submit", answer: "no" }));
    expect(miss.body.offerMC).toBe(true);
    expect(miss.body.boss).toBeUndefined();

    const mc = await handleGrade(deps, ANON, grade(q2, { action: "mc", choice: 0 }));
    expect(mc.body.boss).toMatchObject({ hp: 1, done: true, outcome: "victory" });
    expect(mc.body.xp?.amount).toBe(8 + 50);
    expect((await deps.store.getSession("s1"))?.engine.recentOutcomes.at(-1)?.score).toBe(0.6);
  });

  it("a retreat when hits fall short; skipping a boss question counts as no hit", async () => {
    const { deps, content, boss } = await bossSetup(["incorrect"]);
    const [q1, q2] = boss.momentIds;
    await handleGrade(deps, ANON, grade(q1, { action: "show_options" }));
    const wrong = await handleGrade(deps, ANON, grade(q1, { action: "mc", choice: 2 }));
    expect(wrong.body.boss?.hp).toBe(2);
    expect(wrong.body.xp).toBeUndefined();

    const skipped = await handleGrade(deps, ANON, grade(q2, { action: "defer" }));
    expect(skipped.body.moment.status).toBe("skipped");
    expect(skipped.body.boss).toMatchObject({ done: true, outcome: "retreat", hp: 2 });
    expect(skipped.body.xp?.amount).toBe(20);
    expect(skipped.body.continueWith?.kind).toBe("boss_result");

    vi.mocked(content.generateChapter).mockRejectedValueOnce(new ContentRefusalError("generateChapter", null));
    for (const task of skipped.background) await task();
    const chapters = (await deps.store.getSession("s1"))?.story.chapters ?? [];
    expect(chapters).toHaveLength(1);
    expect(chapters[0].text).toContain("next time");
  });
});

describe("mergeAwards", () => {
  const level = { level: 2, xp: 120, levelStartXp: 100, nextLevelXp: 250 };
  it("sums amounts and keeps the later level", () => {
    expect(mergeAwards({ amount: 15, reason: "Boss hit", level }, { amount: 50, reason: "Boss defeated", level })).toEqual({
      amount: 65,
      reason: "Boss hit + Boss defeated",
      level,
    });
    expect(mergeAwards(undefined, { amount: 5, reason: "x", level })?.amount).toBe(5);
  });

  it("joins level-ups across the two awards", () => {
    const a = { amount: 15, reason: "a", level, levelUp: { from: 1, to: 2, rewards: [] } };
    const b = { amount: 200, reason: "b", level: { ...level, level: 3 }, levelUp: { from: 2, to: 3, rewards: [] } };
    expect(mergeAwards(a, b)?.levelUp).toEqual({ from: 1, to: 3, rewards: [] });
  });
});

it("candidate fixture is valid for the moment contract", async () => {
  const { LearningMomentInputSchema } = await import("@/lib/contracts/moment");
  expect(LearningMomentInputSchema.safeParse(candidate()).success).toBe(true);
});

describe("skipBoss (Skip this boss)", () => {
  it("closes the remaining questions, keeps earlier answers, pays nothing, and continues the work", async () => {
    const { deps, boss } = await bossSetup(["correct"]);
    await handleGrade(deps, ANON, grade(boss.momentIds[0], { action: "submit", answer: "a" }));
    const xpBefore = (await deps.store.getUser(ANON))!.xp;

    const { body } = await skipBoss(deps, (await deps.store.getSession("s1"))!, boss.id);
    expect(body.boss.outcome).toBe("skipped");
    expect(body.continueWith).toEqual({ sessionId: "s1", kind: "boss_result", bossId: boss.id });
    expect(body.moments[boss.momentIds[0]].status).toBe("answered");
    expect(body.moments[boss.momentIds[1]].status).toBe("skipped");
    expect((await deps.store.getUser(ANON))!.xp).toBe(xpBefore);
    const session = await deps.store.getSession("s1");
    expect(session?.engine.conceptsSinceBoss).toEqual([]);
    expect(session?.story.chapters).toHaveLength(0);
    expect(deps.store.events.map((e) => e.name)).toContain("boss_skipped");
  });

  it("clears a pending boss offer when the boss starts", async () => {
    const deps = makeDeps();
    const session = await seedSession(deps, { engine: { ...initialEngineState(), bossOfferPending: true, conceptsSinceBoss: ["a", "b", "c"] } });
    await startBoss(deps, session);
    expect((await deps.store.getSession("s1"))?.engine.bossOfferPending).toBe(false);
  });
});
