/**
 * Pacing-engine contract (Track B implements in lib/engine/, pure + unit-tested).
 * See docs/design-plan.md §7.
 */
import type { HelpLevel, LearningMomentInput, MomentType, Verdict } from "./moment";

export type Familiarity = "new" | "some" | "comfortable";
export type GuardrailMode = "light" | "balanced" | "strict";

export interface UserSettings {
  sound: boolean;
  volume: number; // 0..1
  theme: string; // theme id
  soundPack: string; // sound pack id
  guardrails: { enabled: boolean; mode: GuardrailMode };
}

export interface ConceptMastery {
  theta: number;
  n: number;
  lastSeen: number; // epoch ms
  /** Score of the most recent attempt (0..1); drives "Review next time" (struggled last time). */
  lastScore?: number;
}
export type MasteryMap = Record<string, ConceptMastery>;

export interface Outcome {
  momentId: string;
  concept: string;
  type: MomentType | "boss";
  score: number; // 1 correct, 0.6 correct-after-MC, 0.5 partial, 0 incorrect
  at: number;
}

/** "skipped": the learner chose "Skip this boss" (no outcome XP, no story chapter). */
export type BossOutcome = "flawless" | "victory" | "retreat" | "skipped";
export interface BossRecord {
  id: string;
  startedAt: number;
  concepts: string[];
  outcome?: BossOutcome;
}

export interface EngineState {
  pendingMomentId?: string;
  momentsShownAt: number[]; // epoch ms of each shown moment
  turnsSinceMoment: number; // work turns since last shown moment
  conceptsSinceBoss: string[]; // distinct concepts practised since last boss
  bosses: BossRecord[];
  recentOutcomes: Outcome[]; // most recent last, capped (e.g. 20)
  /** A boss is due and the learner hasn't chosen "Take it on" / "Keep working" yet (survives reloads). */
  bossOfferPending?: boolean;
}

export const initialEngineState = (): EngineState => ({
  momentsShownAt: [],
  turnsSinceMoment: 0,
  conceptsSinceBoss: [],
  bosses: [],
  recentOutcomes: [],
});

export interface GateContext {
  state: EngineState;
  mastery: MasteryMap;
  settings: UserSettings;
  familiarity: Familiarity;
  now: number;
}

export type GateDecision =
  | { action: "show" }
  | { action: "defer"; reason: string }
  | { action: "skip"; reason: "one_at_a_time" | "low_value" | "mastered" | "off_band" | "cap" | "unverified" };

export type DifficultyKind = "first_exposure" | "practice" | "boss";

/** Engine summary rendered into the work model's dynamic context each turn. */
export interface EngineSummary {
  guardrails: { enabled: boolean; mode: GuardrailMode };
  valueThreshold: number;
  targetDifficulty: { firstExposure: number; practice: number }; // for a typical unseen/seen concept
  masteredConcepts: string[];
  /** Concepts from earlier sessions worth a quick review moment (stale mastered or still shaky), most valuable first, ≤ 3. */
  dueForReview: string[];
  conceptsSinceBoss: string[];
  rollingAccuracy: number | null; // over last 5 graded outcomes
  recentOutcomes: { concept: string; type: string; score: number }[]; // last 3
}

export type XpEvent =
  | { kind: "answer"; verdict: Verdict; afterMC: boolean; help?: HelpLevel }
  | { kind: "prediction"; verdict: Verdict }
  | { kind: "boss_hit"; partial: boolean; help?: HelpLevel }
  | { kind: "boss_outcome"; outcome: BossOutcome }
  | { kind: "session_complete" };

export interface LevelInfo {
  level: number;
  xp: number;
  levelStartXp: number;
  nextLevelXp: number;
}

export interface LevelReward {
  level: number;
  kind: "theme" | "sound_pack";
  id: string;
  label: string;
}

/** Signatures Track B must export from lib/engine/index.ts. */
export interface EngineApi {
  gate(candidate: LearningMomentInput, ctx: GateContext): GateDecision;
  updateMastery(prev: ConceptMastery | undefined, score: number, difficulty: number, familiarity: Familiarity, now: number): ConceptMastery;
  targetDifficulty(m: ConceptMastery | undefined, kind: DifficultyKind, familiarity: Familiarity, recent: Outcome[]): number;
  isMastered(m: ConceptMastery | undefined): boolean;
  reviewDue(m: ConceptMastery | undefined, now: number): boolean;
  bossDue(state: EngineState, now: number, sessionEndsAt: number): boolean;
  bossOutcome(hits: number, maxHits: number): BossOutcome;
  summarize(ctx: GateContext): EngineSummary;
  recordShown(state: EngineState, momentId: string, now: number): EngineState;
  recordOutcome(state: EngineState, outcome: Outcome): EngineState;
  recordWorkTurn(state: EngineState): EngineState;
  xpFor(event: XpEvent): number;
  levelFor(totalXp: number): LevelInfo;
  rewardsBetween(fromLevel: number, toLevel: number): LevelReward[];
}
