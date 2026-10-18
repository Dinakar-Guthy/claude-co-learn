import { describe, expect, it } from "vitest";
import { initialEngineState, type EngineState } from "@/lib/contracts/engine";
import {
  RECENT_OUTCOMES_CAP,
  recordBossFinished,
  recordBossStarted,
  recordOutcome,
  recordShown,
  recordSkipped,
  recordWorkTurn,
} from "./state";
import { outcome, stateWith, T0 } from "./test-helpers";

/** Deep-freezes a state so any in-place mutation throws in strict mode. */
function frozen(state: EngineState): EngineState {
  for (const v of Object.values(state)) if (Array.isArray(v)) Object.freeze(v);
  state.bosses.forEach((b) => Object.freeze(b));
  return Object.freeze(state);
}

describe("recordShown", () => {
  it("sets pending, appends the timestamp, and resets turns", () => {
    const before = frozen(stateWith({ momentsShownAt: [T0 - 1], turnsSinceMoment: 4 }));
    const after = recordShown(before, "m1", T0);
    expect(after).toMatchObject({ pendingMomentId: "m1", momentsShownAt: [T0 - 1, T0], turnsSinceMoment: 0 });
    expect(before).toEqual(stateWith({ momentsShownAt: [T0 - 1], turnsSinceMoment: 4 }));
  });
});

describe("recordOutcome", () => {
  it("clears pending only when the ids match", () => {
    const s = frozen(stateWith({ pendingMomentId: "m0" }));
    expect(recordOutcome(s, outcome(1, 0)).pendingMomentId).toBeUndefined();
    expect(recordOutcome(s, outcome(1, 9)).pendingMomentId).toBe("m0");
  });

  it("appends outcomes, capped at 20 (most recent last)", () => {
    let s = initialEngineState();
    for (let i = 0; i < 25; i++) s = recordOutcome(s, outcome(1, i));
    expect(RECENT_OUTCOMES_CAP).toBe(20);
    expect(s.recentOutcomes).toHaveLength(20);
    expect(s.recentOutcomes[0].momentId).toBe("m5");
    expect(s.recentOutcomes[19].momentId).toBe("m24");
  });

  it("adds the concept to conceptsSinceBoss once", () => {
    let s = frozen(initialEngineState());
    s = recordOutcome(s, outcome(1, 0, "a"));
    s = recordOutcome(s, outcome(0, 1, "b"));
    s = recordOutcome(s, outcome(1, 2, "a"));
    expect(s.conceptsSinceBoss).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const before = frozen(stateWith({ conceptsSinceBoss: ["a"], recentOutcomes: [outcome(1, 0, "a")] }));
    const after = recordOutcome(before, outcome(0, 1, "a"));
    expect(after).not.toBe(before);
    expect(after.conceptsSinceBoss).not.toBe(before.conceptsSinceBoss);
    expect(before.recentOutcomes).toHaveLength(1);
  });
});

describe("recordSkipped", () => {
  it("clears a matching pending moment without recording an outcome", () => {
    const s = frozen(stateWith({ pendingMomentId: "m1" }));
    const after = recordSkipped(s, "m1");
    expect(after.pendingMomentId).toBeUndefined();
    expect(after.recentOutcomes).toEqual([]);
    expect(recordSkipped(s, "other").pendingMomentId).toBe("m1");
  });
});

describe("recordWorkTurn", () => {
  it("increments turnsSinceMoment immutably", () => {
    const s = frozen(initialEngineState());
    const after = recordWorkTurn(recordWorkTurn(s));
    expect(after.turnsSinceMoment).toBe(2);
    expect(s.turnsSinceMoment).toBe(0);
  });
});

describe("boss helpers", () => {
  it("recordBossStarted appends a copy of the boss", () => {
    const s = frozen(initialEngineState());
    const boss = { id: "b1", startedAt: T0, concepts: ["a", "b", "c"] };
    const after = recordBossStarted(s, boss);
    expect(after.bosses).toEqual([boss]);
    expect(after.bosses[0]).not.toBe(boss);
    expect(s.bosses).toEqual([]);
  });

  it("recordBossFinished sets the outcome and resets conceptsSinceBoss", () => {
    const s = frozen(
      stateWith({
        conceptsSinceBoss: ["a", "b", "c"],
        bosses: [
          { id: "b0", startedAt: T0 - 1, concepts: [], outcome: "retreat" },
          { id: "b1", startedAt: T0, concepts: ["a"] },
        ],
      }),
    );
    const after = recordBossFinished(s, "b1", "flawless");
    expect(after.bosses.map((b) => b.outcome)).toEqual(["retreat", "flawless"]);
    expect(after.conceptsSinceBoss).toEqual([]);
    expect(s.bosses[1].outcome).toBeUndefined();
    expect(s.conceptsSinceBoss).toEqual(["a", "b", "c"]);
  });
});
