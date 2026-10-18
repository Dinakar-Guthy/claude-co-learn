import { describe, expect, it } from "vitest";
import { LEVEL_REWARDS, levelFor, rewardsBetween } from "./levels";
import { xpFor } from "./xp";

describe("xpFor", () => {
  it("scores answers", () => {
    expect(xpFor({ kind: "answer", verdict: "correct", afterMC: false })).toBe(10);
    expect(xpFor({ kind: "answer", verdict: "correct", afterMC: true })).toBe(5);
    expect(xpFor({ kind: "answer", verdict: "partial", afterMC: false })).toBe(5);
    expect(xpFor({ kind: "answer", verdict: "partial", afterMC: true })).toBe(5);
    expect(xpFor({ kind: "answer", verdict: "incorrect", afterMC: false })).toBe(0);
    expect(xpFor({ kind: "answer", verdict: "incorrect", afterMC: true })).toBe(0);
  });

  it("scores predictions", () => {
    expect(xpFor({ kind: "prediction", verdict: "correct" })).toBe(10);
    expect(xpFor({ kind: "prediction", verdict: "partial" })).toBe(5);
    expect(xpFor({ kind: "prediction", verdict: "incorrect" })).toBe(0);
  });

  it("scores boss hits, outcomes, and session completion", () => {
    expect(xpFor({ kind: "boss_hit", partial: false })).toBe(15);
    expect(xpFor({ kind: "boss_hit", partial: true })).toBe(8);
    expect(xpFor({ kind: "boss_outcome", outcome: "flawless" })).toBe(75);
    expect(xpFor({ kind: "boss_outcome", outcome: "victory" })).toBe(50);
    expect(xpFor({ kind: "boss_outcome", outcome: "retreat" })).toBe(20);
    expect(xpFor({ kind: "session_complete" })).toBe(30);
  });
});

describe("levelFor", () => {
  it("starts at level 1", () => {
    expect(levelFor(0)).toEqual({ level: 1, xp: 0, levelStartXp: 0, nextLevelXp: 100 });
  });

  it("crosses thresholds exactly at 100 / 250 / 450 / 700 / 1000 / 1350", () => {
    const cases: [number, number, number, number][] = [
      [99, 1, 0, 100],
      [100, 2, 100, 250],
      [249, 2, 100, 250],
      [250, 3, 250, 450],
      [449, 3, 250, 450],
      [450, 4, 450, 700],
      [699, 4, 450, 700],
      [700, 5, 700, 1000],
      [999, 5, 700, 1000],
      [1000, 6, 1000, 1350],
      [1350, 7, 1350, 1750],
    ];
    for (const [xp, level, levelStartXp, nextLevelXp] of cases) {
      expect(levelFor(xp)).toEqual({ level, xp, levelStartXp, nextLevelXp });
    }
  });

  it("keeps growing beyond level 10", () => {
    // L10 starts at 100+150+…+500 = 2700; L11 at 2700 + 550 = 3250
    expect(levelFor(2700).level).toBe(10);
    expect(levelFor(3250)).toEqual({ level: 11, xp: 3250, levelStartXp: 3250, nextLevelXp: 3850 });
  });

  it("treats negative XP as level 1", () => {
    expect(levelFor(-5)).toMatchObject({ level: 1, levelStartXp: 0, nextLevelXp: 100 });
  });
});

describe("rewards", () => {
  it("defines one reward per level from 2 to 10", () => {
    expect(LEVEL_REWARDS.map((r) => r.level)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(LEVEL_REWARDS.map((r) => r.id)).toEqual([
      "sunset",
      "marimba",
      "forest",
      "night",
      "retro",
      "sakura",
      "parchment",
      "nature",
      "matcha",
    ]);
    expect(LEVEL_REWARDS.filter((r) => r.kind === "sound_pack").map((r) => r.id)).toEqual([
      "marimba",
      "retro",
      "nature",
    ]);
  });

  it("returns rewards for levels in (from, to]", () => {
    expect(rewardsBetween(1, 1)).toEqual([]);
    expect(rewardsBetween(1, 2).map((r) => r.id)).toEqual(["sunset"]);
    expect(rewardsBetween(2, 5).map((r) => r.id)).toEqual(["marimba", "forest", "night"]);
    expect(rewardsBetween(9, 12).map((r) => r.id)).toEqual(["matcha"]);
    expect(rewardsBetween(10, 20)).toEqual([]);
  });

  it("returns copies, so callers can't mutate the table", () => {
    const [r] = rewardsBetween(1, 2);
    r.label = "changed";
    expect(LEVEL_REWARDS[0].label).toBe("Sunset theme");
  });

  it("composes with levelFor across a session", () => {
    const before = levelFor(90).level;
    const after = levelFor(90 + 200).level;
    expect(rewardsBetween(before, after).map((r) => r.id)).toEqual(["sunset", "marimba"]);
  });
});
