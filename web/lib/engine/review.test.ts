import { describe, expect, it } from "vitest";
import { updateMastery } from "./mastery";
import type { ConceptMastery } from "@/lib/contracts/engine";
import { isMastered } from "./mastery";
import { conceptStatus, dueForReview, isShaky, MAX_DUE_FOR_REVIEW, reviewReason, strength } from "./review";
import { gate } from "./gate";
import { candidate, ctx, DAY, MIN, T0 } from "./test-helpers";

const m = (theta: number, n: number, ago: number): ConceptMastery => ({ theta, n, lastSeen: T0 - ago });

describe("strength", () => {
  it("is P(correct) on a medium (b = 3) question", () => {
    expect(strength(m(3, 1, 0))).toBeCloseTo(0.5);
    expect(strength(m(5, 1, 0))).toBeGreaterThan(0.9);
    expect(strength(m(1.5, 1, 0))).toBeLessThan(0.2);
  });
});

describe("isShaky", () => {
  it("needs an attempt, no mastery, and P(b = 3) < 0.6", () => {
    expect(isShaky(undefined)).toBe(false);
    expect(isShaky(m(2, 0, 0))).toBe(false); // never practised
    expect(isShaky(m(2.5, 1, 0))).toBe(true);
    expect(isShaky(m(3.3, 3, 0))).toBe(true); // P ≈ 0.59
    expect(isShaky(m(3.4, 3, 0))).toBe(false); // P ≈ 0.62: growing, on track
    expect(isShaky(m(5, 4, 0))).toBe(false); // mastered
  });
});

describe("reviewReason", () => {
  it("flags mastered concepts unseen for over a day as stale", () => {
    expect(reviewReason(m(5, 4, DAY + 1), T0)).toBe("stale");
    expect(reviewReason(m(5, 4, DAY - 1), T0)).toBeNull();
  });

  it("flags shaky concepts only once they're more than 10 minutes old", () => {
    expect(reviewReason(m(2, 2, 10 * MIN + 1), T0)).toBe("shaky");
    expect(reviewReason(m(2, 2, 10 * MIN), T0)).toBeNull();
    expect(reviewReason(m(2, 2, 2 * MIN), T0)).toBeNull();
  });

  it("ignores concepts that are on track or unknown", () => {
    expect(reviewReason(m(3.8, 1, DAY * 3), T0)).toBeNull(); // P ≈ 0.72, not mastered: neither shaky nor stale
    expect(reviewReason(undefined, T0)).toBeNull();
  });
});

describe("dueForReview", () => {
  it("returns nothing for a new learner or a fresh session's concepts", () => {
    expect(dueForReview({}, T0)).toEqual([]);
    expect(dueForReview({ a: m(2, 1, MIN), b: m(5, 3, MIN) }, T0)).toEqual([]);
  });

  it("puts shaky concepts first (weakest first), then stale mastered ones (oldest first), capped at 3", () => {
    const due = dueForReview(
      {
        mastered_old: m(5, 4, 9 * DAY),
        mastered_older: m(5, 4, 20 * DAY),
        shaky_mid: m(2.5, 2, DAY),
        shaky_weakest: m(1.2, 2, 30 * MIN),
        fresh_shaky: m(1, 1, MIN),
        mastered_fresh: m(5, 4, MIN),
        on_track: m(3.6, 1, 2 * DAY),
      },
      T0,
    );
    expect(due).toHaveLength(MAX_DUE_FOR_REVIEW);
    expect(due).toEqual(["shaky_weakest", "shaky_mid", "mastered_older"]);
  });

  it("breaks ties deterministically by oldest lastSeen, then name", () => {
    expect(dueForReview({ b: m(2, 1, DAY), a: m(2, 1, DAY), c: m(2, 1, 2 * DAY) }, T0)).toEqual(["c", "a", "b"]);
  });

  it("lets stale mastered concepts through when there are no shaky ones", () => {
    expect(dueForReview({ x: m(5, 4, 2 * DAY), y: m(5, 4, 3 * DAY) }, T0)).toEqual(["y", "x"]);
  });
});

describe("gate agreement", () => {
  it("never skips a due-for-review concept as mastered", () => {
    const mastery = { stale: m(5, 4, 2 * DAY), shaky: m(2, 2, DAY) };
    const due = dueForReview(mastery, T0);
    expect(due).toEqual(["shaky", "stale"]);
    for (const concept of due) {
      const decision = gate(candidate({ concept, first_exposure: false, difficulty: 2 }), ctx({ mastery, now: T0 }));
      expect(decision).not.toMatchObject({ reason: "mastered" });
    }
  });
});

describe("conceptStatus", () => {
  it("agrees with the engine's mastery and review rules", () => {
    const mastered = m(5, 4, MIN);
    expect(isMastered(mastered)).toBe(true);
    expect(conceptStatus(mastered, T0)).toBe("mastered");
    expect(conceptStatus(m(5, 4, 2 * DAY), T0)).toBe("review"); // mastered but stale
    expect(conceptStatus(m(2, 2, DAY), T0)).toBe("review"); // shaky, from an earlier session
    expect(conceptStatus(m(2, 2, MIN), T0)).toBe("growing"); // shaky but just practised
    expect(conceptStatus(m(3.8, 1, DAY), T0)).toBe("growing"); // on track, not mastered yet
    expect(conceptStatus(m(5, 1, DAY), T0)).toBe("growing"); // strong after one attempt: needs a second
  });
});

describe("a newcomer's right answers aren't marked for review", () => {
  it("is growing, not review, when the last attempt went well, even at low strength", () => {
    const now = 10 * 24 * 3600_000;
    const m = updateMastery(undefined, 1, 1, "new", now - 3600_000);
    expect(m.lastScore).toBe(1);
    expect(conceptStatus(m, now)).toBe("growing");
    const missed = updateMastery(undefined, 0, 1, "new", now - 3600_000);
    expect(conceptStatus(missed, now)).toBe("review");
  });
});
