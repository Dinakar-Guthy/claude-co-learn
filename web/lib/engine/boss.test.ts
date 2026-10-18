import { describe, expect, it } from "vitest";
import { bossDue, bossOutcome } from "./boss";
import { MIN, stateWith, T0 } from "./test-helpers";

const ready = stateWith({ conceptsSinceBoss: ["a", "b", "c"] });
const END = T0 + 10 * MIN;

describe("bossDue", () => {
  it("is due with ≥ 3 distinct concepts, no recent boss, and time left", () => {
    expect(bossDue(ready, T0, END)).toBe(true);
  });

  it("needs 3 distinct concepts", () => {
    expect(bossDue(stateWith({ conceptsSinceBoss: ["a", "b"] }), T0, END)).toBe(false);
    expect(bossDue(stateWith({ conceptsSinceBoss: ["a", "b", "b"] }), T0, END)).toBe(false);
    expect(bossDue(stateWith({ conceptsSinceBoss: ["a", "b", "c", "d"] }), T0, END)).toBe(true);
  });

  it("waits 3 minutes after the last boss started", () => {
    const s = { ...ready, bosses: [{ id: "b1", startedAt: T0, concepts: [], outcome: "victory" as const }] };
    expect(bossDue(s, T0 + 3 * MIN - 1, END)).toBe(false);
    expect(bossDue(s, T0 + 3 * MIN, END)).toBe(true);
  });

  it("only considers the most recent boss timing among all bosses", () => {
    const s = {
      ...ready,
      bosses: [
        { id: "b1", startedAt: T0 - 20 * MIN, concepts: [] },
        { id: "b2", startedAt: T0 - MIN, concepts: [] },
      ],
    };
    expect(bossDue(s, T0, END)).toBe(false);
  });

  it("is not due in the final minute", () => {
    expect(bossDue(ready, END - MIN - 1, END)).toBe(true);
    expect(bossDue(ready, END - MIN, END)).toBe(false);
    expect(bossDue(ready, END - 1, END)).toBe(false);
  });

  it("is allowed again once the user keeps going past the end", () => {
    expect(bossDue(ready, END, END)).toBe(true);
    expect(bossDue(ready, END + 5 * MIN, END)).toBe(true);
    expect(bossDue(stateWith({ conceptsSinceBoss: ["a"] }), END + 5 * MIN, END)).toBe(false);
  });
});

describe("bossOutcome", () => {
  it("is flawless with all hits", () => {
    expect(bossOutcome(3, 3)).toBe("flawless");
    expect(bossOutcome(2, 2)).toBe("flawless");
  });

  it("is victory with at least half the hits", () => {
    expect(bossOutcome(2, 3)).toBe("victory");
    expect(bossOutcome(1.5, 3)).toBe("victory"); // exactly half
    expect(bossOutcome(2.5, 3)).toBe("victory");
    expect(bossOutcome(1, 2)).toBe("victory");
  });

  it("is retreat with fewer than half", () => {
    expect(bossOutcome(1, 3)).toBe("retreat");
    expect(bossOutcome(0.5, 2)).toBe("retreat");
    expect(bossOutcome(0, 3)).toBe("retreat");
  });
});
