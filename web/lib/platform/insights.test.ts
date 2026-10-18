import { describe, expect, it } from "vitest";
import { answerScore, band, computeInsights, parseDays, TARGETS, windowDays, withoutTestTraffic, type InsightEvent } from "./insights";

const T = Date.parse("2026-10-18T10:00:00Z");
const D1 = "2026-10-17";
const D2 = "2026-10-18";
const at = (day: string, minute: number) => Date.parse(`${day}T00:00:00Z`) + minute * 60_000;

type Props = InsightEvent["props"];
const ev = (day: string, minute: number, anonId: string, sessionId: string | undefined, name: string, props?: Props): InsightEvent => ({
  at: at(day, minute),
  anonId,
  sessionId,
  name,
  props,
});

/** A shown + answered work moment. */
function workMoment(day: string, minute: number, anonId: string, sessionId: string, momentId: string, concept: string, answer: Props) {
  return [
    ev(day, minute, anonId, sessionId, "moment_proposed", { momentId, type: "recall", concept }),
    ev(day, minute, anonId, sessionId, "moment_gated", { momentId, action: "show", reason: null }),
    ev(day, minute, anonId, sessionId, "moment_shown", { momentId, type: "recall", concept }),
    ev(day, minute + 1, anonId, sessionId, "moment_answered", { momentId, type: "recall", concept, boss: false, ...answer }),
  ];
}

const one = (events: InsightEvent[], day = D2) => computeInsights([{ day, events }]);

describe("window helpers", () => {
  it("parses ?days= with a default of 7 and a cap of 30", () => {
    expect(parseDays(null)).toBe(7);
    expect(parseDays("")).toBe(7);
    expect(parseDays("1")).toBe(1);
    expect(parseDays("30")).toBe(30);
    expect(parseDays("365")).toBe(30);
    expect(parseDays("0")).toBeNull();
    expect(parseDays("-3")).toBeNull();
    expect(parseDays("7.5")).toBeNull();
    expect(parseDays("abc")).toBeNull();
  });

  it("lists the last N UTC days ending today, oldest first", () => {
    expect(windowDays(T, 1)).toEqual([D2]);
    expect(windowDays(T, 3)).toEqual(["2026-10-16", D1, D2]);
    expect(windowDays(Date.parse("2026-03-01T23:59:59Z"), 2)).toEqual(["2026-02-28", "2026-03-01"]);
  });
});

describe("scoring and bands", () => {
  it("uses the logged score, else derives it from verdict and afterMC, else null", () => {
    expect(answerScore(ev(D2, 0, "u", "s", "moment_answered", { score: 0.5 }))).toBe(0.5);
    expect(answerScore(ev(D2, 0, "u", "s", "moment_answered", { verdict: "correct" }))).toBe(1);
    expect(answerScore(ev(D2, 0, "u", "s", "moment_answered", { verdict: "correct", afterMC: true }))).toBe(0.6);
    expect(answerScore(ev(D2, 0, "u", "s", "moment_answered", { verdict: "partial" }))).toBe(0.5);
    expect(answerScore(ev(D2, 0, "u", "s", "moment_answered", { pendingPrediction: true }))).toBeNull();
    expect(answerScore(ev(D2, 0, "u", "s", "moment_answered", { verdict: "weird" }))).toBeNull();
    expect(answerScore(ev(D2, 0, "u", "s", "moment_answered"))).toBeNull();
  });

  it("classifies a mean against its target band", () => {
    expect(band([], TARGETS.practice).status).toBe("no_data");
    expect(band([1, 0.5], TARGETS.practice)).toMatchObject({ n: 2, mean: 0.75, status: "in", lowSample: true });
    expect(band([0.5], TARGETS.practice).status).toBe("below");
    expect(band(Array(12).fill(1), TARGETS.boss)).toMatchObject({ status: "above", lowSample: false });
  });
});

describe("computeInsights", () => {
  it("returns zeros and nulls for an empty window", () => {
    const out = computeInsights([
      { day: D1, events: [] },
      { day: D2, events: [] },
    ]);
    expect(out.window).toEqual({ days: 2, from: D1, to: D2, events: 0 });
    expect(out.volume).toEqual({ users: 0, sessionsCreated: 0, sessionsWrapped: 0, completion: { num: 0, den: 0, rate: null }, errors: 0 });
    expect(out.moments.answerRate.rate).toBeNull();
    expect(out.accuracy.practice.status).toBe("no_data");
    expect(out.retention).toEqual({ pairs: 0, users: 0, meanFirst: null, meanLater: null, delta: null });
    expect(out.daily.map((d) => d.day)).toEqual([D1, D2]);
  });

  it("counts users, sessions, completion and errors", () => {
    const out = one([
      ev(D2, 0, "u1", "s1", "session_created"),
      ev(D2, 1, "u1", "s2", "session_created"),
      ev(D2, 2, "u2", "s3", "session_created"),
      ev(D2, 3, "u1", "s1", "session_wrapped"),
      ev(D2, 4, "u1", "s1", "session_wrapped"), // duplicate wrap counts once
      ev(D2, 5, "u3", "old", "session_wrapped"), // created before the window: not in completion
      ev(D2, 6, "u2", "s3", "error", { where: "background", message: "boom" }),
      ev(D2, 7, "u4", undefined, "unlock"),
    ]);
    expect(out.volume).toEqual({
      users: 4,
      sessionsCreated: 3,
      sessionsWrapped: 2,
      completion: { num: 1, den: 3, rate: 1 / 3 },
      errors: 1,
    });
  });

  it("computes moment rates over moments shown in the window, de-duplicating by momentId", () => {
    const out = one([
      ...workMoment(D2, 0, "u1", "s1", "m1", "overfitting", { verdict: "correct", score: 1, afterMC: false }),
      ...workMoment(D2, 2, "u1", "s1", "m2", "leakage", { verdict: "correct", score: 0.6, afterMC: true }),
      ev(D2, 3, "u1", "s1", "mc_offered", { momentId: "m2", after: "miss" }),
      // m3: shown then skipped
      ev(D2, 4, "u1", "s1", "moment_shown", { momentId: "m3" }),
      ev(D2, 5, "u1", "s1", "moment_skipped", { momentId: "m3", boss: false }),
      // m4: shown, learner defers it
      ev(D2, 6, "u1", "s1", "moment_shown", { momentId: "m4" }),
      ev(D2, 7, "u1", "s1", "moment_deferred", { momentId: "m4", type: "recall", boss: false }),
      // m5: deferred by the gate, never shown (not a learner deferral)
      ev(D2, 8, "u1", "s1", "moment_gated", { momentId: "m5", action: "defer", reason: "mid_flow" }),
      ev(D2, 8, "u1", "s1", "moment_deferred", { momentId: "m5" }),
      // m6: shown, revealed, reported
      ev(D2, 9, "u1", "s1", "moment_shown", { momentId: "m6" }),
      ev(D2, 10, "u1", "s1", "moment_revealed", { momentId: "m6" }),
      ev(D2, 11, "u1", "s1", "moment_reported", { momentId: "m6", boss: false }),
      ev(D2, 11, "u1", "s1", "moment_reported", { momentId: "m6", boss: false }),
    ]);
    const m = out.moments;
    expect([m.proposed, m.shown, m.answered, m.skipped, m.deferred, m.reported, m.revealed]).toEqual([2, 5, 2, 1, 1, 1, 1]);
    expect(m.answerRate).toEqual({ num: 2, den: 5, rate: 0.4 });
    expect(m.skipRate.rate).toBe(0.2);
    expect(m.deferRate.rate).toBe(0.2);
    expect(m.revealRate.rate).toBe(0.2);
    expect(m.mcOffered).toBe(1);
    expect(m.mcFallback).toEqual({ num: 1, den: 2, rate: 0.5 });
  });

  it("counts a prediction once and takes the resolved score over the pending submission", () => {
    const out = one([
      ev(D2, 0, "u1", "s1", "moment_shown", { momentId: "p1", type: "predict", concept: "baseline" }),
      ev(D2, 1, "u1", "s1", "moment_answered", { momentId: "p1", type: "predict", pendingPrediction: true }),
      ev(D2, 3, "u1", "s1", "moment_answered", { momentId: "p1", type: "predict", concept: "baseline", verdict: "partial", xp: 5 }),
    ]);
    expect(out.moments.answered).toBe(1);
    expect(out.accuracy.practice).toMatchObject({ n: 1, mean: 0.5 });
  });

  it("separates work accuracy from boss accuracy and checks P5 bands", () => {
    const out = one([
      ...workMoment(D2, 0, "u1", "s1", "m1", "a", { score: 1 }),
      ...workMoment(D2, 2, "u1", "s1", "m2", "b", { score: 0.5 }),
      ev(D2, 5, "u1", "s1", "moment_answered", { momentId: "q1", concept: "a", boss: true, verdict: "correct", score: 1 }),
      ev(D2, 6, "u1", "s1", "moment_answered", { momentId: "q2", concept: "b", boss: true, verdict: "incorrect", score: 0 }),
      ev(D2, 7, "u1", "s1", "moment_answered", { momentId: "q3", concept: "b", boss: true, verdict: "correct", score: 1 }),
    ]);
    expect(out.accuracy.practice).toMatchObject({ n: 2, mean: 0.75, status: "in", target: TARGETS.practice });
    expect(out.accuracy.boss).toMatchObject({ n: 3, status: "in" });
    expect(out.accuracy.boss.mean).toBeCloseTo(2 / 3);
    expect(out.moments.answered).toBe(2); // boss questions are not work moments
    expect(out.bosses.questions.answered).toBe(3);
  });

  it("treats the first scored work answer per user+concept in the window as first exposure", () => {
    const out = one([
      ...workMoment(D2, 0, "u1", "s1", "m1", "Overfitting", { score: 1 }),
      ...workMoment(D2, 2, "u1", "s1", "m2", "overfitting ", { score: 0 }), // same concept, normalized
      ...workMoment(D2, 4, "u2", "s2", "m3", "overfitting", { score: 0.5 }), // different user
    ]);
    expect(out.accuracy.firstExposure).toMatchObject({ n: 2, mean: 0.75, status: "below", target: TARGETS.firstExposure });
  });

  it("measures help usage per shown moment, by kind, and compares scores with vs without help", () => {
    const out = one([
      ...workMoment(D2, 0, "u1", "s1", "m1", "a", { score: 0.5, help: "hint" }),
      ...workMoment(D2, 2, "u1", "s1", "m2", "b", { score: 1, help: null }),
      ...workMoment(D2, 4, "u1", "s1", "m3", "c", { score: 0.5 }),
      ...workMoment(D2, 6, "u1", "s1", "m4", "d", { score: 1 }),
      ev(D2, 1, "u1", "s1", "help_hint", { momentId: "m1", boss: false }),
      ev(D2, 1, "u1", "s1", "help_hint", { momentId: "m1", boss: false }), // repeat use counts once
      ev(D2, 1, "u1", "s1", "help_teach", { momentId: "m1", boss: false }),
      ev(D2, 5, "u1", "s1", "help_ask", { momentId: "m3", boss: false }),
      ev(D2, 8, "u1", "s1", "help_teach", { momentId: "q1", boss: true }),
    ]);
    const h = out.moments.help;
    expect(h.any).toEqual({ num: 2, den: 4, rate: 0.5 });
    expect(h.hint.rate).toBe(0.25);
    expect(h.teach.rate).toBe(0.25);
    expect(h.ask.rate).toBe(0.25);
    expect(h.scoreWithHelp).toBe(0.5);
    expect(h.scoreWithoutHelp).toBe(1);
    expect(out.bosses.questions.helped).toBe(1);
  });

  it("summarizes bosses and gate decisions, bucketing unexpected labels as other", () => {
    const out = one([
      ev(D2, 0, "u1", "s1", "boss_offered"),
      ev(D2, 1, "u1", "s1", "boss_offered"),
      ev(D2, 1, "u1", "s1", "boss_declined"),
      ev(D2, 2, "u1", "s1", "boss_started", { bossId: "b1", questions: 3, name: "The Overfit Bug" }),
      ev(D2, 3, "u1", "s1", "boss_finished", { bossId: "b1", outcome: "victory", hits: 2, maxHp: 3 }),
      ev(D2, 4, "u2", "s2", "boss_started", { bossId: "b2" }),
      ev(D2, 5, "u2", "s2", "boss_finished", { bossId: "b2", outcome: "flawless", hits: 3, maxHp: 3 }),
      ev(D2, 6, "u2", "s2", "boss_finished", { bossId: "b3", outcome: "Some Free Text!" }),
      ev(D2, 7, "u2", "s2", "boss_skipped"),
      ev(D2, 8, "u2", "s2", "moment_skipped", { momentId: "q9", boss: true }),
      ev(D2, 9, "u1", "s1", "moment_gated", { momentId: "g1", action: "show", reason: null }),
      ev(D2, 9, "u1", "s1", "moment_gated", { momentId: "g2", action: "skip", reason: "low_value" }),
      ev(D2, 9, "u1", "s1", "moment_gated", { momentId: "g3", action: "skip", reason: "low_value" }),
      ev(D2, 9, "u1", "s1", "moment_gated", { momentId: "g4", action: "skip", reason: "cap" }),
      ev(D2, 9, "u1", "s1", "moment_gated", { momentId: "g5", action: "defer", reason: "user is mid-thought" }),
    ]);
    expect(out.bosses).toMatchObject({ offered: 2, declined: 1, started: 2, skipped: 1, finished: 3 });
    expect(out.bosses.outcomes).toEqual([
      { outcome: "flawless", count: 1 },
      { outcome: "other", count: 1 },
      { outcome: "victory", count: 1 },
    ]);
    expect(out.bosses.meanHitRate).toBeCloseTo((2 / 3 + 1) / 2);
    expect(out.bosses.questions.skipped).toBe(1);
    expect(out.gate).toEqual({
      decisions: 5,
      show: 1,
      skip: 3,
      defer: 1,
      reasons: [
        { reason: "low_value", count: 2 },
        { reason: "cap", count: 1 },
        { reason: "other", count: 1 },
      ],
    });
  });

  it("counts wrap-up feedback once per session (last vote wins) and ignores malformed props", () => {
    const out = one([
      ev(D2, 0, "u1", "s1", "learned_feedback", { helpful: false }),
      ev(D2, 1, "u1", "s1", "learned_feedback", { helpful: true }),
      ev(D2, 2, "u2", "s2", "learned_feedback", { helpful: false }),
      ev(D2, 3, "u3", "s3", "learned_feedback", { helpful: "yes" }),
      ev(D2, 4, "u3", "s4", "learned_feedback"),
    ]);
    expect(out.feedback).toEqual({ responses: 2, helpful: 1, rate: { num: 1, den: 2, rate: 0.5 } });
  });

  it("compares first-session vs later-session scores per (user, concept) for delayed retention", () => {
    const out = computeInsights([
      {
        day: D1,
        events: [
          ...workMoment(D1, 0, "u1", "s1", "m1", "leakage", { score: 0.5 }),
          ...workMoment(D1, 2, "u1", "s1", "m2", "leakage", { score: 0 }),
          ...workMoment(D1, 4, "u1", "s1", "m3", "recall", { score: 1 }), // only one session: not a pair
          ...workMoment(D1, 6, "u2", "s9", "m4", "leakage", { score: 0 }),
        ],
      },
      {
        day: D2,
        events: [
          ...workMoment(D2, 0, "u1", "s2", "m5", "Leakage", { score: 1 }),
          ev(D2, 3, "u1", "s3", "moment_answered", { momentId: "q1", concept: "leakage", boss: true, score: 0.5 }),
          ...workMoment(D2, 6, "u2", "s10", "m6", "leakage", { score: 1 }),
        ],
      },
    ]);
    // u1/leakage: first 0.25, later mean(1, 0.5) = 0.75. u2/leakage: first 0, later 1.
    expect(out.retention.pairs).toBe(2);
    expect(out.retention.users).toBe(2);
    expect(out.retention.meanFirst).toBeCloseTo(0.125);
    expect(out.retention.meanLater).toBeCloseTo(0.875);
    expect(out.retention.delta).toBeCloseTo(0.75);
  });

  it("breaks metrics down per day", () => {
    const out = computeInsights([
      { day: D1, events: [ev(D1, 0, "u1", "s1", "session_created"), ...workMoment(D1, 1, "u1", "s1", "m1", "a", { score: 1 })] },
      { day: D2, events: [] },
    ]);
    expect(out.daily).toEqual([
      { day: D1, events: 5, users: 1, sessionsCreated: 1, sessionsWrapped: 0, shown: 1, answered: 1, meanScore: 1 },
      { day: D2, events: 0, users: 0, sessionsCreated: 0, sessionsWrapped: 0, shown: 0, answered: 0, meanScore: null },
    ]);
  });

  it("never leaks anonIds, session ids, concepts, or free text", () => {
    const secret = "f3a1c9e0-SECRET-ANON";
    const out = JSON.stringify(
      one([
        ev(D2, 0, secret, "sess-SECRET", "session_created"),
        ...workMoment(D2, 1, secret, "sess-SECRET", "mom-SECRET", "concept-SECRET", { score: 1 }),
        ev(D2, 3, secret, "sess-SECRET", "error", { message: "stack trace SECRET" }),
        ev(D2, 4, secret, "sess-SECRET", "boss_started", { name: "Boss SECRET" }),
        ev(D2, 5, secret, "sess-SECRET", "moment_gated", { action: "skip", reason: "free text SECRET" }),
      ]),
    );
    expect(out).not.toContain("SECRET");
  });
});

describe("withoutTestTraffic", () => {
  const days = [{ day: "2026-10-18", events: [{ anonId: "a", name: "unlock", at: 1 }, { anonId: "a", name: "unlock", at: 2, props: { test: true } }] }];
  it("drops events tagged as test traffic by default and counts them", () => {
    const out = withoutTestTraffic(days, false);
    expect(out.days[0].events.map((e) => e.at)).toEqual([1]);
    expect(out.excluded).toBe(1);
  });
  it("keeps everything when asked to include test traffic", () => {
    expect(withoutTestTraffic(days, true).days[0].events).toHaveLength(2);
  });
});
