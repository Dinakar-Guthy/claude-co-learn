/**
 * HTTP route contracts (request/response bodies). All routes identify the user via the
 * HttpOnly `cl_anon` cookie (set by POST /api/unlock). See docs/design-plan.md §4.
 */
import type { MomentView, Verdict } from "./moment";
import type { LevelInfo, LevelReward, UserSettings, BossOutcome } from "./engine";
import type { Intent, SessionSketch, SessionSummary, StoryChapter, TranscriptItem } from "./session";
import type { XpAward } from "./stream";

export const ANON_COOKIE = "cl_anon";
export const UNLOCK_PHRASE = "/co-learn";

export interface UserView {
  xp: number;
  level: LevelInfo;
  unlocks: { themes: string[]; soundPacks: string[] };
  settings: UserSettings;
}

// POST /api/unlock
export interface UnlockRequest { phrase: string }
export interface UnlockResponse { ok: true; user: UserView; sessions: SessionSummary[] }

// GET /api/user  → UserView
// PATCH /api/user  (partial settings)
export type UpdateSettingsRequest = Partial<UserSettings>;

// POST /api/session
export interface CreateSessionRequest { intent: Intent }
export interface CreateSessionResponse { sessionId: string }

// GET /api/session/[id]
export interface SessionView {
  id: string;
  title: string;
  intent: Intent;
  sketch?: SessionSketch;
  status: "active" | "wrapped";
  createdAt: number;
  endsAt: number; // createdAt + intent.minutes
  transcript: TranscriptItem[];
  moments: Record<string, MomentView>;
  bosses: Record<string, BossView>;
  chapters: Record<string, StoryChapter>;
  /** A boss is due: show the "Take it on / Keep working" offer. */
  bossOfferPending?: boolean;
  primer?: PrimerView;
}

/** Client view of the novice primer: the check's answer key only after it's answered. */
export interface PrimerView {
  ideas: string[];
  check: { question: string; options: string[]; answered?: { choice: number; correct: boolean; correctIndex: number; why: string } };
  dismissed: boolean;
}

// GET /api/session/[id]/primer → { primer: PrimerView | null } (null while generating, or not a novice session)
// POST /api/session/[id]/primer
export type PrimerRequest = { action: "dismiss" } | { action: "answer"; choice: number };
export interface PrimerResponse { primer: PrimerView; xp?: XpAward }

// GET /api/sessions → SessionSummary[]

// POST /api/chat  (streams ChatStreamEvent NDJSON)
export type ChatRequest =
  | { sessionId: string; kind: "message"; text: string }
  | { sessionId: string; kind: "moment_response"; momentId: string } // server builds the text from the stored moment record
  | { sessionId: string; kind: "boss_result"; bossId: string }
  | { sessionId: string; kind: "continue" } // auto-continue (e.g. after pause_turn)
  | { sessionId: string; kind: "boss_declined" }; // the learner chose "Keep working" on the boss offer

// POST /api/moment/grade
export type GradeRequest =
  | { sessionId: string; momentId: string; action: "submit"; answer: string }
  | { sessionId: string; momentId: string; action: "mc"; choice: number }
  | { sessionId: string; momentId: string; action: "show_options" }
  | { sessionId: string; momentId: string; action: "skip" | "defer" | "report" };

export interface GradeResponse {
  moment: MomentView; // updated view (verdict/why/mcOptions/correctIndex as applicable)
  verdict?: Verdict;
  offerMC: boolean; // true after a miss/struggle when MC hasn't been used yet
  xp?: XpAward;
  boss?: { bossId: string; hp: number; maxHp: number; done: boolean; outcome?: BossOutcome; nextMomentId?: string };
  /** Whether the client should now POST /api/chat (moment_response or boss_result) to continue the work. */
  continueWith?: ChatRequest;
}

// POST /api/moment/help: learner-requested help on one question (design: decision log 2026-10-18)
export type HelpRequest =
  | { sessionId: string; momentId: string; action: "hint" | "teach" }
  | { sessionId: string; momentId: string; action: "ask"; text: string };
export interface HelpResponse {
  moment: MomentView;
  /** Set when the question closed as "revealed": continue the work. */
  continueWith?: ChatRequest;
}

// POST /api/boss
export interface StartBossRequest { sessionId: string }
// POST /api/boss/skip
export interface SkipBossRequest { sessionId: string; bossId: string }
export interface SkipBossResponse { boss: BossView; moments: Record<string, MomentView>; continueWith: ChatRequest }
export interface BossView {
  id: string;
  name: string;
  ascii: "bug" | "slime" | "ghost";
  intro: string;
  hp: number;
  maxHp: number;
  momentIds: string[];
  currentMomentId?: string;
  outcome?: BossOutcome;
}
export interface StartBossResponse { boss: BossView; moments: Record<string, MomentView> }

// POST /api/wrapup
export interface WrapUpRequest { sessionId: string }
export interface WrapUpResponse {
  deferred: MomentView[]; // deferred moments to answer now (graded via /api/moment/grade)
  codex: { concept: string; summary: string; result: "strong" | "growing" | "review" }[];
  sessionXp: number;
  user: UserView;
  chapter?: StoryChapter;
  suggestions: string[];
  levelUps: { from: number; to: number; rewards: LevelReward[] }[];
}

// GET /api/story?sessionId=&trigger=  → { chapter: StoryChapter | null } (null = still generating)

// GET /api/files/[id]?sessionId=  → file bytes (ownership-checked)
