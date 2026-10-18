import { describe, expect, it } from "vitest";
import {
  INITIAL_THETA,
  isMastered,
  pCorrect,
  reviewDue,
  REVIEW_AFTER_MS,
  SCORE,
  scoreFor,
  updateMastery,
} from "./mastery";
import { logit } from "./math";
import { DAY, T0 } from "./test-helpers";

// θ at which P(correct at b=3) is exactly 0.8.
const MASTERY_THETA = 3 + logit(0.8) / 1.2;

describe("pCorrect", () => {
  it("is 0.5 when θ equals difficulty and follows σ(1.2·(θ − b))", () => {
    expect(pCorrect(3, 3)).toBeCloseTo(0.5);
    expect(pCorrect(4, 3)).toBeCloseTo(1 / (1 + Math.exp(-1.2)));
    expect(pCorrect(2, 3)).toBeCloseTo(1 / (1 + Math.exp(1.2)));
  });
});

describe("scoreFor", () => {
  it("maps verdicts to scores", () => {
    expect(scoreFor("correct", false)).toBe(1);
    expect(scoreFor("correct", true)).toBe(0.6);
    expect(scoreFor("partial", false)).toBe(0.5);
    expect(scoreFor("partial", true)).toBe(0.5);
    expect(scoreFor("incorrect", false)).toBe(0);
    expect(SCORE).toEqual({ correct: 1, correctAfterMC: 0.6, partial: 0.5, incorrect: 0 });
  });
});

describe("updateMastery", () => {
  it("starts θ from familiarity", () => {
    expect(INITIAL_THETA).toEqual({ new: 1.5, some: 2.5, comfortable: 3.5 });
    for (const fam of ["new", "some", "comfortable"] as const) {
      const b = INITIAL_THETA[fam];
      // At b = θ, p = 0.5, so a correct answer moves θ by K·0.5 = 0.3.
      expect(updateMastery(undefined, 1, b, fam, T0).theta).toBeCloseTo(INITIAL_THETA[fam] + 0.3);
    }
  });

  it("applies θ += K·(score − p) with K = 0.6 for n < 3", () => {
    const m = updateMastery(undefined, 1, 2, "some", T0);
    const p = pCorrect(2.5, 2);
    expect(m.theta).toBeCloseTo(2.5 + 0.6 * (1 - p));
    expect(m).toMatchObject({ n: 1, lastSeen: T0 });
  });

  it("uses K = 0.6 at n = 2 and K = 0.3 from n = 3", () => {
    const atTwo = updateMastery({ theta: 3, n: 2, lastSeen: 0 }, 0, 3, "new", T0);
    expect(atTwo.theta).toBeCloseTo(3 - 0.6 * 0.5);
    expect(atTwo.n).toBe(3);
    const atThree = updateMastery({ theta: 3, n: 3, lastSeen: 0 }, 0, 3, "new", T0);
    expect(atThree.theta).toBeCloseTo(3 - 0.3 * 0.5);
    expect(atThree.n).toBe(4);
  });

  it("ignores familiarity once a record exists", () => {
    const prev = { theta: 2, n: 1, lastSeen: 0 };
    expect(updateMastery(prev, 0.5, 2, "comfortable", T0)).toEqual(updateMastery(prev, 0.5, 2, "new", T0));
  });

  it("handles partial and after-MC scores", () => {
    const prev = { theta: 3, n: 5, lastSeen: 0 };
    expect(updateMastery(prev, 0.5, 3, "some", T0).theta).toBeCloseTo(3); // score equals p
    expect(updateMastery(prev, 0.6, 3, "some", T0).theta).toBeCloseTo(3 + 0.3 * 0.1);
  });

  it("clamps θ to [0, 6]", () => {
    expect(updateMastery({ theta: 5.9, n: 0, lastSeen: 0 }, 1, 5, "some", T0).theta).toBe(6);
    expect(updateMastery({ theta: 0.1, n: 0, lastSeen: 0 }, 0, 1, "some", T0).theta).toBe(0);
  });

  it("does not mutate the previous record", () => {
    const prev = Object.freeze({ theta: 2, n: 1, lastSeen: 0 });
    const next = updateMastery(prev, 1, 2, "some", T0);
    expect(next).not.toBe(prev);
    expect(prev).toEqual({ theta: 2, n: 1, lastSeen: 0 });
  });
});

describe("isMastered", () => {
  it("is false without a record", () => {
    expect(isMastered(undefined)).toBe(false);
  });

  it("requires n ≥ 2", () => {
    expect(isMastered({ theta: 6, n: 1, lastSeen: 0 })).toBe(false);
    expect(isMastered({ theta: 6, n: 2, lastSeen: 0 })).toBe(true);
  });

  it("requires P(correct at b=3) ≥ 0.8 (θ ≈ 4.155)", () => {
    expect(isMastered({ theta: MASTERY_THETA + 1e-6, n: 2, lastSeen: 0 })).toBe(true);
    expect(isMastered({ theta: MASTERY_THETA - 1e-6, n: 2, lastSeen: 0 })).toBe(false);
  });
});

describe("reviewDue", () => {
  const mastered = { theta: 5, n: 3, lastSeen: T0 };

  it("is false for missing or unmastered concepts", () => {
    expect(reviewDue(undefined, T0 + 10 * DAY)).toBe(false);
    expect(reviewDue({ theta: 2, n: 3, lastSeen: T0 }, T0 + 10 * DAY)).toBe(false);
  });

  it("becomes true strictly after one day unseen", () => {
    expect(REVIEW_AFTER_MS).toBe(DAY);
    expect(reviewDue(mastered, T0 + DAY)).toBe(false);
    expect(reviewDue(mastered, T0 + DAY + 1)).toBe(true);
  });
});
