/** Permanent player levels and their unlocks (design-plan §12). */
import type { LevelInfo, LevelReward } from "@/lib/contracts/engine";

/** XP from L1 to L2; each later step needs LEVEL_STEP_GROWTH more than the previous one. */
export const FIRST_LEVEL_STEP = 100;
export const LEVEL_STEP_GROWTH = 50; // cumulative thresholds 100 / 250 / 450 / 700 / 1,000 / …

export const LEVEL_REWARDS: readonly LevelReward[] = [
  { level: 2, kind: "theme", id: "sunset", label: "Sunset theme" },
  { level: 3, kind: "sound_pack", id: "marimba", label: "Marimba sound pack" },
  { level: 4, kind: "theme", id: "forest", label: "Forest theme" },
  { level: 5, kind: "theme", id: "night", label: "Night Sky theme" },
  { level: 6, kind: "sound_pack", id: "retro", label: "Retro sound pack" },
  { level: 7, kind: "theme", id: "sakura", label: "Sakura theme" },
  { level: 8, kind: "theme", id: "parchment", label: "Parchment theme" },
  { level: 9, kind: "sound_pack", id: "nature", label: "Nature sound pack" },
  { level: 10, kind: "theme", id: "matcha", label: "Matcha theme" },
];

export function levelFor(totalXp: number): LevelInfo {
  const xp = Math.max(0, totalXp);
  let level = 1;
  let start = 0;
  let step = FIRST_LEVEL_STEP;
  while (xp >= start + step) {
    start += step;
    step += LEVEL_STEP_GROWTH;
    level++;
  }
  return { level, xp: totalXp, levelStartXp: start, nextLevelXp: start + step };
}

/** Rewards unlocked by levelling from `fromLevel` to `toLevel`, i.e. levels in (fromLevel, toLevel]. */
export function rewardsBetween(fromLevel: number, toLevel: number): LevelReward[] {
  return LEVEL_REWARDS.filter((r) => r.level > fromLevel && r.level <= toLevel).map((r) => ({ ...r }));
}
