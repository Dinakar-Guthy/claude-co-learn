import { describe, expect, it } from "vitest";
import type { BossView, SessionView } from "@/lib/contracts/api";
import type { MomentView } from "@/lib/contracts/moment";
import { activeBoss, addChapter, applyBossStart, applyGrade, applyStreamEvent, bossMomentId, nextBossQuestion, openMoment, reconcile } from "./workspace";

const moment = (id: string, extra: Partial<MomentView> = {}): MomentView => ({
  id, sessionId: "s1", type: "decide", concept: "metrics", question: "Which metric?", status: "awaiting_answer", ...extra,
});

const view = (extra: Partial<SessionView> = {}): SessionView => ({
  id: "s1", title: "t", intent: { goal: "g", familiarity: "new", minutes: 10, demo: true }, status: "active",
  createdAt: 0, endsAt: 600_000, transcript: [], moments: {}, bosses: {}, chapters: {}, storyEnabled: false, ...extra,
});

const boss = (extra: Partial<BossView> = {}): BossView => ({
  id: "b1", name: "Bug", ascii: "bug", intro: "hi", hp: 2, maxHp: 2, momentIds: ["q1", "q2"], currentMomentId: "q1", ...extra,
});

describe("workspace view updates", () => {
  it("adds moment views from stream events", () => {
    const v = applyStreamEvent(view(), { type: "moment", itemId: "i1", moment: moment("m1") });
    expect(v.transcript).toEqual([{ kind: "moment", id: "i1", momentId: "m1" }]);
    expect(openMoment(v)?.id).toBe("m1");
  });

  it("marks a prediction answered when it's revealed", () => {
    const v0 = view({ moments: { m1: moment("m1", { type: "predict", status: "awaiting_prediction_result", answer: "85%" }) } });
    const level = { level: 1, xp: 10, levelStartXp: 0, nextLevelXp: 100 };
    const v = applyStreamEvent(v0, { type: "prediction_reveal", itemId: "p1", momentId: "m1", actualResult: "84.9%", verdict: "correct", why: "w", xp: { amount: 10, reason: "r", level } });
    expect(v.moments.m1).toMatchObject({ status: "answered", verdict: "correct", xp: 10 });
  });

  it("starts a boss once and applies hits and the outcome", () => {
    const start = { boss: boss(), moments: { q1: moment("q1", { type: "boss", bossId: "b1" }), q2: moment("q2", { type: "boss", bossId: "b1" }) } };
    let v = applyBossStart(applyBossStart(view(), start), start);
    expect(v.transcript.filter((i) => i.kind === "boss")).toHaveLength(1);
    expect(activeBoss(v)?.id).toBe("b1");

    v = applyGrade(v, { moment: moment("q1", { type: "boss", bossId: "b1", status: "answered", verdict: "correct" }), offerMC: false, boss: { bossId: "b1", hp: 1, maxHp: 2, done: false, nextMomentId: "q2" } });
    expect(v.bosses.b1).toMatchObject({ hp: 1, currentMomentId: "q2" });
    // The answered question stays shown until the learner moves on.
    expect(bossMomentId(v.bosses.b1, "q1")).toBe("q1");
    expect(nextBossQuestion(v.bosses.b1, "q1")).toBe("q2");

    v = applyGrade(v, { moment: moment("q2", { type: "boss", bossId: "b1", status: "answered" }), offerMC: false, boss: { bossId: "b1", hp: 0, maxHp: 2, done: true, outcome: "flawless" } });
    expect(v.bosses.b1.outcome).toBe("flawless");
    expect(activeBoss(v)).toBeUndefined();
    expect(nextBossQuestion(v.bosses.b1, "q2")).toBeUndefined();
  });

  it("adds a chapter with the server's transcript id", () => {
    const v = addChapter(view(), { id: "c1", trigger: "boss:b1", title: "T", text: "x", summary: "s", createdAt: 1 });
    expect(v.transcript).toEqual([{ kind: "story", id: "story-c1", chapterId: "c1" }]);
  });

  it("keeps a locally finished boss when a re-sync races it", () => {
    const local = view({ bosses: { b1: boss({ hp: 0, outcome: "victory" }) } });
    const server = view({ bosses: { b1: boss() } });
    expect(reconcile(local, server).bosses.b1.outcome).toBe("victory");
  });
});
