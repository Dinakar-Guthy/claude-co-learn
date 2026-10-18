import { describe, expect, it } from "vitest";
import { summarize } from "./summary";
import { ctx, DAY, MIN, outcomes, settings, stateWith, T0 } from "./test-helpers";

describe("summarize", () => {
  it("summarises a fresh session", () => {
    expect(summarize(ctx())).toEqual({
      guardrails: { enabled: false, mode: "balanced" },
      valueThreshold: 4,
      targetDifficulty: { firstExposure: 1, practice: 1 },
      masteredConcepts: [],
      dueForReview: [],
      conceptsSinceBoss: [],
      rollingAccuracy: null,
      recentOutcomes: [],
    });
  });

  it("reports the strict threshold and familiarity-based targets", () => {
    const s = summarize(ctx({ settings: settings({ enabled: true, mode: "strict" }), familiarity: "comfortable" }));
    expect(s.valueThreshold).toBe(5);
    expect(s.guardrails).toEqual({ enabled: true, mode: "strict" });
    expect(s.targetDifficulty).toEqual({ firstExposure: 2, practice: 2 });
  });

  it("lists mastered concepts, sorted, excluding unmastered and review-due ones", () => {
    const s = summarize(
      ctx({
        mastery: {
          zeta: { theta: 5, n: 2, lastSeen: T0 },
          alpha: { theta: 5, n: 4, lastSeen: T0 },
          weak: { theta: 3, n: 4, lastSeen: T0 },
          stale: { theta: 5, n: 4, lastSeen: T0 - DAY - 1 },
        },
      }),
    );
    expect(s.masteredConcepts).toEqual(["alpha", "zeta"]);
  });

  it("lists concepts due for review from earlier sessions: shaky first, then stale mastered", () => {
    const s = summarize(
      ctx({
        mastery: {
          stale: { theta: 5, n: 4, lastSeen: T0 - DAY - 1 },
          shaky: { theta: 2, n: 2, lastSeen: T0 - DAY },
          justPractised: { theta: 2, n: 1, lastSeen: T0 - MIN },
          mastered: { theta: 5, n: 4, lastSeen: T0 },
        },
      }),
    );
    expect(s.dueForReview).toEqual(["shaky", "stale"]);
    expect(s.masteredConcepts).toEqual(["mastered"]);
  });

  it("includes rolling accuracy, the last 3 outcomes, and concepts since boss", () => {
    const recent = outcomes([0, 1, 0.5, 1, 0.6, 1]);
    const s = summarize(ctx({ state: stateWith({ recentOutcomes: recent, conceptsSinceBoss: ["a", "b"] }) }));
    expect(s.rollingAccuracy).toBeCloseTo((1 + 0.5 + 1 + 0.6 + 1) / 5);
    expect(s.recentOutcomes).toEqual([
      { concept: "c", type: "decide", score: 1 },
      { concept: "c", type: "decide", score: 0.6 },
      { concept: "c", type: "decide", score: 1 },
    ]);
    expect(s.conceptsSinceBoss).toEqual(["a", "b"]);
  });

  it("applies the rolling adjustment to the advertised targets", () => {
    const hot = summarize(ctx({ familiarity: "comfortable", state: stateWith({ recentOutcomes: outcomes([1, 1, 1]) }) }));
    // comfortable practice raw 2.345 + 0.5 → 2.845 → 3
    expect(hot.targetDifficulty.practice).toBe(3);
  });
});
