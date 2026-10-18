import { describe, expect, it } from "vitest";
import { gate, isBreakthrough } from "./gate";
import { candidate, ctx, DAY, MIN, outcomes, settings, stateWith, T0 } from "./test-helpers";

const mastered = { theta: 5, n: 3, lastSeen: T0 };
const breakthrough = { costly_mistake: true, learning_value: 5 };

describe("isBreakthrough", () => {
  it("requires costly_mistake and learning_value 5", () => {
    expect(isBreakthrough(candidate(breakthrough))).toBe(true);
    expect(isBreakthrough(candidate({ costly_mistake: true, learning_value: 4 }))).toBe(false);
    expect(isBreakthrough(candidate({ costly_mistake: false, learning_value: 5 }))).toBe(false);
  });
});

describe("gate", () => {
  it("shows a valuable, on-band candidate by default", () => {
    expect(gate(candidate(), ctx())).toEqual({ action: "show" });
  });

  describe("1. one at a time", () => {
    it("skips while a moment is pending, even for breakthroughs", () => {
      const c = ctx({ state: stateWith({ pendingMomentId: "m1" }) });
      expect(gate(candidate(breakthrough), c)).toEqual({ action: "skip", reason: "one_at_a_time" });
    });
  });

  describe("2. learning value", () => {
    it("skips below 4 when guardrails are off", () => {
      expect(gate(candidate({ learning_value: 3 }), ctx())).toEqual({ action: "skip", reason: "low_value" });
      expect(gate(candidate({ learning_value: 4 }), ctx()).action).toBe("show");
    });

    it("needs 5 in strict mode", () => {
      const strict = ctx({ settings: settings({ enabled: true, mode: "strict" }) });
      expect(gate(candidate({ learning_value: 4 }), strict)).toEqual({ action: "skip", reason: "low_value" });
      expect(gate(candidate({ learning_value: 5 }), strict).action).toBe("show");
    });

    it("uses the off threshold when guardrails are disabled, whatever the mode", () => {
      const off = ctx({ settings: settings({ enabled: false, mode: "strict" }) });
      expect(gate(candidate({ learning_value: 4 }), off).action).toBe("show");
    });
  });

  describe("3. mastered", () => {
    it("skips mastered concepts that are not review-due", () => {
      const c = ctx({ mastery: { train_test_split: mastered } });
      expect(gate(candidate({ difficulty: 4, first_exposure: false }), c)).toEqual({ action: "skip", reason: "mastered" });
    });

    it("allows review-due mastered concepts", () => {
      const c = ctx({ mastery: { train_test_split: mastered }, now: T0 + DAY + 1 });
      // θ = 5, practice target = 4
      expect(gate(candidate({ difficulty: 4, first_exposure: false }), c)).toEqual({ action: "show" });
    });

    it("applies even to breakthroughs (they only bypass value and caps)", () => {
      const c = ctx({ mastery: { train_test_split: mastered } });
      expect(gate(candidate({ ...breakthrough, difficulty: 4 }), c).action).toBe("skip");
    });
  });

  describe("4. off band", () => {
    it("skips when |difficulty − target| ≥ 2", () => {
      // familiarity "some", no record → first_exposure target 1
      expect(gate(candidate({ difficulty: 2 }), ctx()).action).toBe("show");
      expect(gate(candidate({ difficulty: 3 }), ctx())).toEqual({ action: "skip", reason: "off_band" });
    });

    it("uses practice targeting for a seen concept that isn't a first exposure", () => {
      const c = ctx({ mastery: { train_test_split: { theta: 4, n: 2, lastSeen: T0 } } });
      // θ = 4: practice target 3, first-exposure target 2
      expect(gate(candidate({ difficulty: 4, first_exposure: false }), c).action).toBe("show");
      expect(gate(candidate({ difficulty: 1, first_exposure: false }), c).action).toBe("skip");
      expect(gate(candidate({ difficulty: 4, first_exposure: true }), c)).toEqual({ action: "skip", reason: "off_band" });
      expect(gate(candidate({ difficulty: 1, first_exposure: true }), c).action).toBe("show");
    });

    it("treats a missing record as first exposure even if the flag is false", () => {
      // comfortable + ramp-up: first-exposure raw 2.42 → 2, practice raw 2.85 → 3
      const c = ctx({ familiarity: "comfortable", state: stateWith({ recentOutcomes: outcomes([1, 1, 1]) }) });
      expect(gate(candidate({ difficulty: 4, first_exposure: false }), c)).toEqual({ action: "skip", reason: "off_band" });
      const seen = { ...c, mastery: { train_test_split: { theta: 3.5, n: 1, lastSeen: T0 } } };
      expect(gate(candidate({ difficulty: 4, first_exposure: false }), seen)).toEqual({ action: "show" });
    });

    it("follows the rolling adjustment", () => {
      const seen = { train_test_split: { theta: 4, n: 3, lastSeen: T0 } };
      const cold = ctx({ mastery: seen, state: stateWith({ recentOutcomes: outcomes([0, 0, 0]) }) });
      // target drops from 3 to 2, so difficulty 4 is now off band
      expect(gate(candidate({ difficulty: 4, first_exposure: false }), cold)).toEqual({ action: "skip", reason: "off_band" });
    });

    it("applies even to breakthroughs", () => {
      expect(gate(candidate({ ...breakthrough, difficulty: 5 }), ctx()).action).toBe("skip");
    });
  });

  describe("5. guardrail caps", () => {
    const capped = stateWith({ momentsShownAt: [T0 - 4 * MIN, T0 - 2 * MIN], turnsSinceMoment: 0 });

    it("skips with cap in light and balanced", () => {
      for (const mode of ["light", "balanced"] as const) {
        const c = ctx({ state: capped, settings: settings({ enabled: true, mode }) });
        expect(gate(candidate(), c)).toEqual({ action: "skip", reason: "cap" });
      }
    });

    it("defers in strict", () => {
      const c = ctx({ state: capped, settings: settings({ enabled: true, mode: "strict" }) });
      expect(gate(candidate({ learning_value: 5 }), c)).toEqual({ action: "defer", reason: "cap" });
    });

    it("lets a breakthrough through the caps", () => {
      for (const mode of ["light", "balanced", "strict"] as const) {
        const c = ctx({ state: capped, settings: settings({ enabled: true, mode }) });
        expect(gate(candidate(breakthrough), c)).toEqual({ action: "show" });
      }
    });

    it("lets a breakthrough through the value threshold", () => {
      const strict = ctx({ settings: settings({ enabled: true, mode: "strict" }) });
      expect(isBreakthrough(candidate(breakthrough))).toBe(true);
      expect(gate(candidate(breakthrough), strict).action).toBe("show");
    });

    it("ignores caps when guardrails are off", () => {
      const c = ctx({ state: capped, settings: settings({ enabled: false, mode: "strict" }) });
      expect(gate(candidate(), c)).toEqual({ action: "show" });
    });

    it("frees up once the strict window rolls past", () => {
      const c = ctx({ state: capped, settings: settings({ enabled: true, mode: "strict" }), now: T0 + 6 * MIN });
      expect(gate(candidate({ learning_value: 5 }), c)).toEqual({ action: "show" });
    });
  });

  it("checks the branches in order", () => {
    // pending beats low value
    const pendingLow = ctx({ state: stateWith({ pendingMomentId: "x" }) });
    expect(gate(candidate({ learning_value: 1 }), pendingLow)).toMatchObject({ reason: "one_at_a_time" });
    // low value beats mastered
    const masteredCtx = ctx({ mastery: { train_test_split: mastered } });
    expect(gate(candidate({ learning_value: 1 }), masteredCtx)).toMatchObject({ reason: "low_value" });
    // off band beats caps
    const cappedStrict = ctx({
      state: stateWith({ momentsShownAt: [T0, T0] }),
      settings: settings({ enabled: true, mode: "strict" }),
    });
    expect(gate(candidate({ learning_value: 5, difficulty: 5 }), cappedStrict)).toMatchObject({ reason: "off_band" });
  });
});
