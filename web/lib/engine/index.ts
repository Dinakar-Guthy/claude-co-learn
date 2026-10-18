/**
 * P0 STAND-IN — Track B replaces this file with the full engine (docs/design-plan.md §7, §12) + tests.
 * Minimal but functional so other tracks can integrate before Track B lands.
 */
import type { EngineApi, EngineState, LevelInfo, LevelReward, Outcome } from "@/lib/contracts/engine";

const LEVEL_STEPS = [100, 150, 200, 250, 300, 350, 400, 450, 500];

export const engine: EngineApi = {
  gate: (c, ctx) =>
    ctx.state.pendingMomentId ? { action: "skip", reason: "one_at_a_time" }
    : c.learning_value >= 4 ? { action: "show" }
    : { action: "skip", reason: "low_value" },
  updateMastery: (prev, score, _d, _f, now) => ({ theta: (prev?.theta ?? 2.5) + 0.5 * (score - 0.5), n: (prev?.n ?? 0) + 1, lastSeen: now }),
  targetDifficulty: () => 3,
  isMastered: (m) => !!m && m.n >= 2 && m.theta >= 3.5,
  reviewDue: () => false,
  bossDue: (s: EngineState) => new Set(s.conceptsSinceBoss).size >= 3,
  bossOutcome: (hits, max) => (hits === max ? "flawless" : hits * 2 >= max ? "victory" : "retreat"),
  summarize: (ctx) => ({
    guardrails: ctx.settings.guardrails,
    valueThreshold: 4,
    targetDifficulty: { firstExposure: 2, practice: 3 },
    masteredConcepts: [],
    conceptsSinceBoss: ctx.state.conceptsSinceBoss,
    rollingAccuracy: null,
    recentOutcomes: ctx.state.recentOutcomes.slice(-3).map((o) => ({ concept: o.concept, type: o.type, score: o.score })),
  }),
  recordShown: (s, id, now) => ({ ...s, pendingMomentId: id, momentsShownAt: [...s.momentsShownAt, now], turnsSinceMoment: 0 }),
  recordOutcome: (s, o: Outcome) => ({
    ...s,
    pendingMomentId: s.pendingMomentId === o.momentId ? undefined : s.pendingMomentId,
    recentOutcomes: [...s.recentOutcomes, o].slice(-20),
    conceptsSinceBoss: s.conceptsSinceBoss.includes(o.concept) ? s.conceptsSinceBoss : [...s.conceptsSinceBoss, o.concept],
  }),
  recordWorkTurn: (s) => ({ ...s, turnsSinceMoment: s.turnsSinceMoment + 1 }),
  xpFor: (e) =>
    e.kind === "answer" ? (e.verdict === "correct" ? (e.afterMC ? 5 : 10) : e.verdict === "partial" ? 5 : 0)
    : e.kind === "prediction" ? (e.verdict === "incorrect" ? 0 : 10)
    : e.kind === "boss_hit" ? (e.partial ? 8 : 15)
    : e.kind === "boss_outcome" ? (e.outcome === "flawless" ? 75 : e.outcome === "victory" ? 50 : 20)
    : 30,
  levelFor: (xp): LevelInfo => {
    let level = 1, start = 0;
    for (const step of LEVEL_STEPS) { if (xp < start + step) return { level, xp, levelStartXp: start, nextLevelXp: start + step }; start += step; level++; }
    return { level, xp, levelStartXp: start, nextLevelXp: start + 550 };
  },
  rewardsBetween: (from, to): LevelReward[] =>
    [{ level: 2, kind: "theme", id: "sunset", label: "Sunset theme" } as const].filter((r) => r.level > from && r.level <= to),
};
