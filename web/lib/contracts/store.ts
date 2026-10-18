/**
 * Storage interface. Track E implements RedisStore (Upstash); MemoryStore (lib/store/memory.ts)
 * is the in-process implementation for tests and local dev without Redis.
 * Keys and TTLs: docs/design-plan.md §10 (60-day sliding TTL on user data).
 */
import type { ConceptMastery, MasteryMap } from "./engine";
import type {
  ApiMessages,
  AppEvent,
  BossState,
  MomentRecord,
  Session,
  SessionSummary,
  TranscriptItem,
  User,
} from "./session";

export type UsageScope = { kind: "anon"; id: string } | { kind: "ip"; id: string } | { kind: "global" };

export interface Store {
  getUser(anonId: string): Promise<User | null>;
  putUser(user: User): Promise<void>;

  listSessions(anonId: string): Promise<SessionSummary[]>;
  getSession(sessionId: string): Promise<Session | null>;
  putSession(session: Session): Promise<void>;

  getApiMessages(sessionId: string): Promise<ApiMessages>;
  putApiMessages(sessionId: string, messages: ApiMessages): Promise<void>;

  getTranscript(sessionId: string): Promise<TranscriptItem[]>;
  putTranscript(sessionId: string, items: TranscriptItem[]): Promise<void>;

  getMoment(sessionId: string, momentId: string): Promise<MomentRecord | null>;
  listMoments(sessionId: string): Promise<MomentRecord[]>;
  putMoment(moment: MomentRecord): Promise<void>;

  getBoss(sessionId: string, bossId: string): Promise<BossState | null>;
  putBoss(boss: BossState): Promise<void>;

  getMastery(anonId: string): Promise<MasteryMap>;
  putMastery(anonId: string, concept: string, mastery: ConceptMastery): Promise<void>;

  /** Adds spend (micro-USD) for today's date (UTC) to each scope; returns new totals in the same order. */
  addUsage(scopes: UsageScope[], microUsd: number): Promise<number[]>;
  getUsage(scopes: UsageScope[]): Promise<number[]>;

  logEvent(event: AppEvent): Promise<void>;
  /** Deletes a user's profile, mastery, and every session's data ("Reset my data"). Telemetry events are kept. */
  deleteUserData(anonId: string): Promise<void>;
  /** Test traffic: identities marked as testers (the owner, automated checks) are excluded from /insights. */
  markTestUser(anonId: string): Promise<void>;
  listTestUsers(): Promise<string[]>;
  /** Telemetry events logged on a UTC day (`yyyy-mm-dd`), oldest first. Read-only; used by /api/insights. */
  listEvents(day: string): Promise<AppEvent[]>;
}
