import { describe, expect, it } from "vitest";
import type { Familiarity } from "@/lib/contracts/engine";
import { rollingAccuracy, rollingAdjustment, targetDifficulty, TARGET_SUCCESS } from "./difficulty";
import { updateMastery, pCorrect } from "./mastery";
import { logit } from "./math";
import { outcome, outcomes, seededRng, T0 } from "./test-helpers";

const m = (theta: number) => ({ theta, n: 3, lastSeen: 0 });
const raw = (theta: number, target: number) => theta - logit(target) / 1.2;

describe("rollingAccuracy", () => {
  it("is null with fewer than 3 outcomes", () => {
    expect(rollingAccuracy([])).toBeNull();
    expect(rollingAccuracy(outcomes([1, 1]))).toBeNull();
  });

  it("averages scores over the last 5 only", () => {
    expect(rollingAccuracy(outcomes([1, 0, 1]))).toBeCloseTo(2 / 3);
    expect(rollingAccuracy(outcomes([0, 0, 0, 1, 1, 1, 1, 1]))).toBe(1);
    expect(rollingAccuracy(outcomes([1, 0.6, 0.5, 0, 1]))).toBeCloseTo(3.1 / 5);
  });
});

describe("rollingAdjustment", () => {
  it("is 0 with fewer than 3 outcomes", () => {
    expect(rollingAdjustment(outcomes([0, 0]))).toBe(0);
    expect(rollingAdjustment(outcomes([1, 1]))).toBe(0);
  });

  it("ramps up +0.5 at ≥ 90% (boundary inclusive)", () => {
    expect(rollingAdjustment(outcomes([1, 1, 1, 1, 0.5]))).toBe(0.5); // exactly 0.9
    expect(rollingAdjustment(outcomes([1, 1, 1]))).toBe(0.5);
    expect(rollingAdjustment(outcomes([1, 1, 1, 1, 0.4]))).toBe(0); // 0.88
  });

  it("backs off −1 at ≤ 60% (boundary inclusive, robust to float sums)", () => {
    expect(rollingAdjustment(outcomes([1, 1, 1, 0, 0]))).toBe(-1); // exactly 0.6
    expect(rollingAdjustment(outcomes([0.6, 0.6, 0.6, 0.6, 0.6]))).toBe(-1);
    expect(rollingAdjustment(outcomes([1, 1, 1, 0.5, 0]))).toBe(0); // 0.7
  });
});

describe("targetDifficulty", () => {
  it("uses the documented target success rates", () => {
    expect(TARGET_SUCCESS).toEqual({ first_exposure: 0.87, practice: 0.8, boss: 0.72 });
  });

  it("solves b = θ − logit(target)/1.2 and rounds", () => {
    // θ = 4: first exposure 2.42 → 2, practice 2.84 → 3, boss 3.21 → 3
    expect(targetDifficulty(m(4), "first_exposure", "some", [])).toBe(Math.round(raw(4, 0.87)));
    expect(targetDifficulty(m(4), "first_exposure", "some", [])).toBe(2);
    expect(targetDifficulty(m(4), "practice", "some", [])).toBe(3);
    expect(targetDifficulty(m(4), "boss", "some", [])).toBe(3);
    // θ = 5: 3.42 → 3, 3.84 → 4, 4.21 → 4
    expect(targetDifficulty(m(5), "first_exposure", "some", [])).toBe(3);
    expect(targetDifficulty(m(5), "practice", "some", [])).toBe(4);
    expect(targetDifficulty(m(5), "boss", "some", [])).toBe(4);
  });

  it("falls back to familiarity θ with no record", () => {
    const cases: [Familiarity, number, number][] = [
      ["new", 1, 1], // raw −0.08 / 0.35 → clamp 1
      ["some", 1, 1], // raw 0.92 / 1.35
      ["comfortable", 2, 2], // raw 1.92 / 2.35
    ];
    for (const [fam, first, practice] of cases) {
      expect(targetDifficulty(undefined, "first_exposure", fam, [])).toBe(first);
      expect(targetDifficulty(undefined, "practice", fam, [])).toBe(practice);
    }
  });

  it("applies the rolling adjustment before rounding", () => {
    // θ = 4, practice: raw 2.845. +0.5 → 3.345 → 3; −1 → 1.845 → 2.
    const hot = outcomes([1, 1, 1, 1, 1]);
    const cold = outcomes([0, 0, 0, 1, 1]);
    expect(targetDifficulty(m(4), "practice", "some", hot)).toBe(3);
    expect(targetDifficulty(m(4), "practice", "some", cold)).toBe(2);
    // θ = 4.3, practice: raw 3.145 → 3; +0.5 → 3.645 → 4.
    expect(targetDifficulty(m(4.3), "practice", "some", [])).toBe(3);
    expect(targetDifficulty(m(4.3), "practice", "some", hot)).toBe(4);
  });

  it("ignores the adjustment with fewer than 3 outcomes", () => {
    expect(targetDifficulty(m(4.3), "practice", "some", outcomes([1, 1]))).toBe(3);
  });

  it("clamps to 1–5", () => {
    expect(targetDifficulty(m(0), "first_exposure", "some", outcomes([0, 0, 0]))).toBe(1);
    expect(targetDifficulty(m(6), "practice", "some", outcomes([1, 1, 1]))).toBe(5);
  });
});

describe("simulated learner", () => {
  /** A learner with fixed true skill answers `questions` items on one concept, aimed by targetDifficulty. */
  function simulate(trueTheta: number, familiarity: Familiarity, seed: number, questions: number): number[] {
    const rng = seededRng(seed);
    let mastery: ReturnType<typeof updateMastery> | undefined;
    let recent = [] as ReturnType<typeof outcomes>;
    const scores: number[] = [];
    for (let i = 0; i < questions; i++) {
      const kind = mastery ? "practice" : "first_exposure";
      const b = targetDifficulty(mastery, kind, familiarity, recent);
      const score = rng() < pCorrect(trueTheta, b) ? 1 : 0;
      scores.push(score);
      mastery = updateMastery(mastery, score, b, familiarity, T0 + i);
      recent = [...recent, outcome(score, i)].slice(-20);
    }
    return scores;
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it("lands near the target success band over ~30 questions", () => {
    for (const [trueTheta, fam] of [
      [3, "new"],
      [4, "some"],
      [5, "comfortable"],
    ] as const) {
      const rate = mean(simulate(trueTheta, fam, 42, 30));
      expect(rate).toBeGreaterThanOrEqual(0.7);
      expect(rate).toBeLessThanOrEqual(0.92);
    }
  });

  it("converges on the 0.80 practice target once warmed up, across many seeds", () => {
    // Questions 31–90. Early questions run easier while θ climbs from the familiarity prior to the true skill.
    const rates = Array.from({ length: 100 }, (_, i) => mean(simulate(4, "some", i + 1, 90).slice(30)));
    const avg = mean(rates);
    expect(avg).toBeGreaterThan(0.76);
    expect(avg).toBeLessThan(0.86);
  });
});
