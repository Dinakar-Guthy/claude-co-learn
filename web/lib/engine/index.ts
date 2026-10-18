/**
 * Pacing engine (design-plan §7, §12): pure, deterministic, and unit-tested.
 * Code paces, Claude creates (P8): Claude proposes moments; this module decides what is shown and how hard.
 */
import type { EngineApi } from "@/lib/contracts/engine";
import { bossDue, bossOutcome } from "./boss";
import { targetDifficulty } from "./difficulty";
import { gate } from "./gate";
import { levelFor, rewardsBetween } from "./levels";
import { isMastered, reviewDue, updateMastery } from "./mastery";
import { recordOutcome, recordShown, recordWorkTurn } from "./state";
import { summarize } from "./summary";
import { xpFor } from "./xp";

export const engine: EngineApi = {
  gate,
  updateMastery,
  targetDifficulty,
  isMastered,
  reviewDue,
  bossDue,
  bossOutcome,
  summarize,
  recordShown,
  recordOutcome,
  recordWorkTurn,
  xpFor,
  levelFor,
  rewardsBetween,
};

export { bossDue, bossOutcome } from "./boss";
export { rollingAccuracy, targetDifficulty, TARGET_SUCCESS } from "./difficulty";
export { gate, isBreakthrough } from "./gate";
export { CAPS, capsExceeded, valueThreshold } from "./guardrails";
export { LEVEL_REWARDS, levelFor, rewardsBetween } from "./levels";
export { isMastered, reviewDue, SCORE, scoreFor, updateMastery } from "./mastery";
export {
  recordBossFinished,
  recordBossStarted,
  recordOutcome,
  recordShown,
  recordSkipped,
  recordWorkTurn,
} from "./state";
export { summarize } from "./summary";
export { XP, xpFor } from "./xp";
