/** In-process Store for tests and local dev without Redis. Not durable; per server instance. */
import type { Store, UsageScope } from "@/lib/contracts/store";
import type { ConceptMastery, MasteryMap } from "@/lib/contracts/engine";
import type { ApiMessages, AppEvent, BossState, MomentRecord, Session, SessionSummary, TranscriptItem, User } from "@/lib/contracts/session";

const clone = <T,>(v: T): T => structuredClone(v);
const today = () => new Date().toISOString().slice(0, 10);
const scopeKey = (s: UsageScope) => `${s.kind}:${s.kind === "global" ? "all" : s.id}:${today()}`;

export class MemoryStore implements Store {
  private users = new Map<string, User>();
  private sessions = new Map<string, Session>();
  private userSessions = new Map<string, string[]>();
  private apiMessages = new Map<string, ApiMessages>();
  private transcripts = new Map<string, TranscriptItem[]>();
  private moments = new Map<string, Map<string, MomentRecord>>();
  private bosses = new Map<string, BossState>();
  private mastery = new Map<string, MasteryMap>();
  private usage = new Map<string, number>();
  readonly events: AppEvent[] = [];

  async deleteUserData(anonId: string) {
    for (const id of this.userSessions.get(anonId) ?? []) {
      this.sessions.delete(id);
      this.apiMessages.delete(id);
      this.transcripts.delete(id);
      this.moments.delete(id);
      for (const key of [...this.bosses.keys()]) if (key.startsWith(`${id}:`)) this.bosses.delete(key);
    }
    this.userSessions.delete(anonId);
    this.users.delete(anonId);
    this.mastery.delete(anonId);
  }

  async getUser(anonId: string) { const u = this.users.get(anonId); return u ? clone(u) : null; }
  async putUser(user: User) { this.users.set(user.anonId, clone(user)); }

  async listSessions(anonId: string): Promise<SessionSummary[]> {
    return (this.userSessions.get(anonId) ?? [])
      .map((id) => this.sessions.get(id))
      .filter((s): s is Session => !!s)
      .map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt, status: s.status }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  async getSession(id: string) { const s = this.sessions.get(id); return s ? clone(s) : null; }
  async putSession(session: Session) {
    this.sessions.set(session.id, clone(session));
    const list = this.userSessions.get(session.anonId) ?? [];
    if (!list.includes(session.id)) this.userSessions.set(session.anonId, [...list, session.id]);
  }

  async getApiMessages(id: string) { return clone(this.apiMessages.get(id) ?? []); }
  async putApiMessages(id: string, messages: ApiMessages) { this.apiMessages.set(id, clone(messages)); }

  async getTranscript(id: string) { return clone(this.transcripts.get(id) ?? []); }
  async putTranscript(id: string, items: TranscriptItem[]) { this.transcripts.set(id, clone(items)); }

  async getMoment(sessionId: string, momentId: string) {
    const m = this.moments.get(sessionId)?.get(momentId); return m ? clone(m) : null;
  }
  async listMoments(sessionId: string) {
    return [...(this.moments.get(sessionId)?.values() ?? [])].map(clone).sort((a, b) => a.createdAt - b.createdAt);
  }
  async putMoment(moment: MomentRecord) {
    const map = this.moments.get(moment.sessionId) ?? new Map<string, MomentRecord>();
    map.set(moment.id, clone(moment));
    this.moments.set(moment.sessionId, map);
  }

  async getBoss(sessionId: string, bossId: string) {
    const b = this.bosses.get(`${sessionId}:${bossId}`); return b ? clone(b) : null;
  }
  async putBoss(boss: BossState) { this.bosses.set(`${boss.sessionId}:${boss.id}`, clone(boss)); }

  async getMastery(anonId: string) { return clone(this.mastery.get(anonId) ?? {}); }
  async putMastery(anonId: string, concept: string, m: ConceptMastery) {
    this.mastery.set(anonId, { ...(this.mastery.get(anonId) ?? {}), [concept]: clone(m) });
  }

  async addUsage(scopes: UsageScope[], microUsd: number) {
    return scopes.map((s) => {
      const k = scopeKey(s); const v = (this.usage.get(k) ?? 0) + microUsd; this.usage.set(k, v); return v;
    });
  }
  async getUsage(scopes: UsageScope[]) { return scopes.map((s) => this.usage.get(scopeKey(s)) ?? 0); }

  async logEvent(event: AppEvent) { this.events.push(clone(event)); }
  async listEvents(day: string) {
    return this.events.filter((e) => new Date(e.at).toISOString().slice(0, 10) === day).sort((a, b) => a.at - b.at).map(clone);
  }
}
