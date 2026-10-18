/**
 * Upstash Redis Store. Key layout and TTLs: docs/design-plan.md §10.
 * Values are JSON strings encoded/decoded here (never via Upstash's auto-deserialization).
 * Any Redis failure is logged once (redacted) and rethrown as StoreError.
 */
import type { Store, UsageScope } from "@/lib/contracts/store";
import type { ConceptMastery, MasteryMap } from "@/lib/contracts/engine";
import type { ApiMessages, AppEvent, BossState, MomentRecord, Session, SessionSummary, TranscriptItem, User } from "@/lib/contracts/session";
import type { Cmd, RedisLike, Results } from "./redis-kv";
import { StoreError, redactError } from "./errors";

const DAY_S = 24 * 60 * 60;
export const DATA_TTL_S = 60 * DAY_S;
export const USAGE_TTL_S = 2 * DAY_S;
export const EVENTS_MAX = 5000;

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const keys = {
  user: (anonId: string) => `user:${anonId}`,
  userSessions: (anonId: string) => `user:${anonId}:sessions`,
  session: (id: string) => `session:${id}`,
  messages: (id: string) => `session:${id}:messages`,
  transcript: (id: string) => `session:${id}:transcript`,
  moments: (id: string) => `session:${id}:moments`,
  boss: (sessionId: string, bossId: string) => `session:${sessionId}:boss:${bossId}`,
  mastery: (anonId: string) => `mastery:${anonId}`,
  usage: (s: UsageScope, day: string) => `usage:${s.kind}:${s.kind === "global" ? "all" : s.id}:${day}`,
  events: (day: string) => `events:${day}`,
  testUsers: () => "test_users",
};

export interface RedisStoreOptions {
  now?: () => number;
  log?: (line: string) => void;
}

export class RedisStore implements Store {
  private readonly now: () => number;
  private readonly log: (line: string) => void;

  constructor(
    private readonly redis: RedisLike,
    opts: RedisStoreOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((line) => console.error(line));
  }

  private async run<const T extends readonly Cmd[]>(op: string, cmds: T): Promise<Results<T>> {
    try {
      return await this.redis.exec(cmds);
    } catch (e) {
      this.log(`[store] redis ${op} failed (${redactError(e)})`);
      throw new StoreError(op, { cause: e });
    }
  }

  private decode<T>(op: string, raw: string | null): T | null {
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      this.log(`[store] corrupt JSON in ${op} (${redactError(e)})`);
      throw new StoreError(op, { cause: e });
    }
  }

  /** Refreshes the sliding 60-day TTL on all per-user keys. */
  private touchUser(anonId: string): Cmd[] {
    return [
      ["expire", keys.user(anonId), DATA_TTL_S],
      ["expire", keys.userSessions(anonId), DATA_TTL_S],
      ["expire", keys.mastery(anonId), DATA_TTL_S],
    ];
  }

  async getUser(anonId: string): Promise<User | null> {
    const [raw] = await this.run("getUser", [["get", keys.user(anonId)], ...this.touchUser(anonId)]);
    return this.decode<User>("getUser", raw);
  }

  async putUser(user: User): Promise<void> {
    await this.run("putUser", [["set", keys.user(user.anonId), JSON.stringify(user), DATA_TTL_S], ...this.touchUser(user.anonId)]);
  }

  async listSessions(anonId: string): Promise<SessionSummary[]> {
    const [ids] = await this.run("listSessions", [["zrevrange", keys.userSessions(anonId)]]);
    if (ids.length === 0) return [];
    const [raws] = await this.run("listSessions", [["mget", ids.map(keys.session)]]);
    return raws
      .map((raw) => this.decode<Session>("listSessions", raw))
      .filter((s): s is Session => s !== null) // sessions can expire before the index does
      .map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt, status: s.status }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async markTestUser(anonId: string): Promise<void> {
    await this.run("markTestUser", [["hset", keys.testUsers(), anonId, String(this.now())], ["expire", keys.testUsers(), DATA_TTL_S]]);
  }

  async listTestUsers(): Promise<string[]> {
    const [all] = await this.run("listTestUsers", [["hgetall", keys.testUsers()]]);
    return Object.keys(all ?? {});
  }

  async deleteUserData(anonId: string): Promise<void> {
    const [ids] = await this.run("deleteUserData", [["zrevrange", keys.userSessions(anonId)]]);
    const raws = ids.length ? (await this.run("deleteUserData", [["mget", ids.map(keys.session)]]))[0] : [];
    const sessionKeys = ids.flatMap((id, i) => {
      const session = raws[i] ? this.decode<Session>("deleteUserData", raws[i]) : null;
      const bossKeys = (session?.engine.bosses ?? []).map((b) => keys.boss(id, b.id));
      return [keys.session(id), keys.messages(id), keys.transcript(id), keys.moments(id), ...bossKeys];
    });
    await this.run("deleteUserData", [["del", [keys.user(anonId), keys.userSessions(anonId), keys.mastery(anonId), ...sessionKeys]]]);
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const [raw] = await this.run("getSession", [["get", keys.session(sessionId)]]);
    return this.decode<Session>("getSession", raw);
  }

  async putSession(session: Session): Promise<void> {
    const index = keys.userSessions(session.anonId);
    await this.run("putSession", [
      ["set", keys.session(session.id), JSON.stringify(session), DATA_TTL_S],
      ["zadd", index, session.createdAt, session.id],
      ["expire", index, DATA_TTL_S],
    ]);
  }

  async getApiMessages(sessionId: string): Promise<ApiMessages> {
    const [raw] = await this.run("getApiMessages", [["get", keys.messages(sessionId)]]);
    return this.decode<ApiMessages>("getApiMessages", raw) ?? [];
  }

  async putApiMessages(sessionId: string, messages: ApiMessages): Promise<void> {
    await this.run("putApiMessages", [["set", keys.messages(sessionId), JSON.stringify(messages), DATA_TTL_S]]);
  }

  async getTranscript(sessionId: string): Promise<TranscriptItem[]> {
    const [raw] = await this.run("getTranscript", [["get", keys.transcript(sessionId)]]);
    return this.decode<TranscriptItem[]>("getTranscript", raw) ?? [];
  }

  async putTranscript(sessionId: string, items: TranscriptItem[]): Promise<void> {
    await this.run("putTranscript", [["set", keys.transcript(sessionId), JSON.stringify(items), DATA_TTL_S]]);
  }

  async getMoment(sessionId: string, momentId: string): Promise<MomentRecord | null> {
    const [raw] = await this.run("getMoment", [["hget", keys.moments(sessionId), momentId]]);
    return this.decode<MomentRecord>("getMoment", raw);
  }

  async listMoments(sessionId: string): Promise<MomentRecord[]> {
    const [hash] = await this.run("listMoments", [["hgetall", keys.moments(sessionId)]]);
    return Object.values(hash)
      .map((raw) => this.decode<MomentRecord>("listMoments", raw))
      .filter((m): m is MomentRecord => m !== null)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async putMoment(moment: MomentRecord): Promise<void> {
    const key = keys.moments(moment.sessionId);
    await this.run("putMoment", [["hset", key, moment.id, JSON.stringify(moment)], ["expire", key, DATA_TTL_S]]);
  }

  async getBoss(sessionId: string, bossId: string): Promise<BossState | null> {
    const [raw] = await this.run("getBoss", [["get", keys.boss(sessionId, bossId)]]);
    return this.decode<BossState>("getBoss", raw);
  }

  async putBoss(boss: BossState): Promise<void> {
    await this.run("putBoss", [["set", keys.boss(boss.sessionId, boss.id), JSON.stringify(boss), DATA_TTL_S]]);
  }

  async getMastery(anonId: string): Promise<MasteryMap> {
    const [hash] = await this.run("getMastery", [["hgetall", keys.mastery(anonId)]]);
    const out: MasteryMap = {};
    for (const [concept, raw] of Object.entries(hash)) {
      const m = this.decode<ConceptMastery>("getMastery", raw);
      if (m) out[concept] = m;
    }
    return out;
  }

  async putMastery(anonId: string, concept: string, mastery: ConceptMastery): Promise<void> {
    const key = keys.mastery(anonId);
    await this.run("putMastery", [["hset", key, concept, JSON.stringify(mastery)], ["expire", key, DATA_TTL_S]]);
  }

  /** INCRBY needs an integer, so fractional micro-USD is rounded up (spend is never under-counted). */
  async addUsage(scopes: UsageScope[], microUsd: number): Promise<number[]> {
    if (scopes.length === 0) return [];
    const by = Math.max(0, Math.ceil(microUsd));
    const day = utcDay(this.now());
    const cmds = scopes.flatMap((s): Cmd[] => [
      ["incrby", keys.usage(s, day), by],
      ["expire", keys.usage(s, day), USAGE_TTL_S],
    ]);
    const results = await this.run("addUsage", cmds);
    return scopes.map((_, i) => Number(results[i * 2]));
  }

  async getUsage(scopes: UsageScope[]): Promise<number[]> {
    if (scopes.length === 0) return [];
    const day = utcDay(this.now());
    const [raws] = await this.run("getUsage", [["mget", scopes.map((s) => keys.usage(s, day))]]);
    return raws.map((raw) => (raw === null ? 0 : Number(raw)));
  }

  async logEvent(event: AppEvent): Promise<void> {
    const key = keys.events(utcDay(event.at));
    await this.run("logEvent", [
      ["lpush", key, JSON.stringify(event)],
      ["ltrim", key, 0, EVENTS_MAX - 1],
      ["expire", key, DATA_TTL_S],
    ]);
  }

  /** Oldest first (the list is LPUSHed, so it is stored newest first). Corrupt entries are skipped, not fatal. */
  async listEvents(day: string): Promise<AppEvent[]> {
    const [raws] = await this.run("listEvents", [["lrange", keys.events(day), 0, -1]]);
    const out: AppEvent[] = [];
    let corrupt = 0;
    for (const raw of raws) {
      try {
        out.push(JSON.parse(raw) as AppEvent);
      } catch {
        corrupt++;
      }
    }
    if (corrupt > 0) this.log(`[store] skipped ${corrupt} corrupt event(s) in listEvents`);
    return out.reverse();
  }
}
