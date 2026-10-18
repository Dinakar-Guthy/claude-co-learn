import { describe, expect, it } from "vitest";
import { initialEngineState } from "@/lib/contracts/engine";
import { engine, recordBossFinished, recordBossStarted, scoreFor } from "./index";
import { candidate, ctx, MIN, T0 } from "./test-helpers";

describe("engine (EngineApi)", () => {
  it("exposes every EngineApi function", () => {
    expect(Object.keys(engine).sort()).toEqual(
      [
        "bossDue",
        "bossOutcome",
        "gate",
        "isMastered",
        "levelFor",
        "recordOutcome",
        "recordShown",
        "recordWorkTurn",
        "reviewDue",
        "rewardsBetween",
        "summarize",
        "targetDifficulty",
        "updateMastery",
        "xpFor",
      ].sort(),
    );
  });

  it("runs a short session end to end", () => {
    const familiarity = "some" as const;
    let state = initialEngineState();
    let mastery = {} as Record<string, ReturnType<typeof engine.updateMastery>>;
    let now = T0;
    let xp = 0;

    for (const [i, concept] of ["split", "leakage", "scaling"].entries()) {
      state = engine.recordWorkTurn(state);
      const c = candidate({ concept, difficulty: 1 });
      expect(engine.gate(c, ctx({ state, mastery, familiarity, now }))).toEqual({ action: "show" });
      state = engine.recordShown(state, `m${i}`, now);
      // A second candidate while one is pending is held back.
      expect(engine.gate(c, ctx({ state, mastery, familiarity, now })).action).toBe("skip");

      const score = scoreFor("correct", false);
      mastery = { ...mastery, [concept]: engine.updateMastery(mastery[concept], score, c.difficulty, familiarity, now) };
      state = engine.recordOutcome(state, { momentId: `m${i}`, concept, type: c.type, score, at: now });
      xp += engine.xpFor({ kind: "answer", verdict: "correct", afterMC: false });
      now += 2 * MIN;
    }

    const endsAt = T0 + 10 * MIN;
    expect(engine.bossDue(state, now, endsAt)).toBe(true);
    state = recordBossStarted(state, { id: "b1", startedAt: now, concepts: [...state.conceptsSinceBoss] });
    expect(engine.bossDue(state, now + MIN, endsAt)).toBe(false);
    const outcome = engine.bossOutcome(2.5, 3);
    state = recordBossFinished(state, "b1", outcome);
    xp += engine.xpFor({ kind: "boss_outcome", outcome }) + engine.xpFor({ kind: "session_complete" });

    expect(state.conceptsSinceBoss).toEqual([]);
    expect(state.bosses[0].outcome).toBe("victory");
    expect(xp).toBe(110);
    expect(engine.rewardsBetween(engine.levelFor(0).level, engine.levelFor(xp).level).map((r) => r.id)).toEqual([
      "sunset",
    ]);
    expect(engine.summarize(ctx({ state, mastery, familiarity, now })).rollingAccuracy).toBe(1);
  });
});
