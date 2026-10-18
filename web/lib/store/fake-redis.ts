/**
 * In-memory RedisLike for tests. Models the Redis semantics RedisStore relies on: string/hash/zset/list
 * types, WRONGTYPE errors, TTLs against an injectable clock, and missing keys as empty.
 */
import type { Cmd, RedisLike, Results } from "./redis-kv";

type Entry =
  | { type: "string"; value: string }
  | { type: "hash"; value: Map<string, string> }
  | { type: "zset"; value: Map<string, number> }
  | { type: "list"; value: string[] };

export class FakeRedis implements RedisLike {
  private data = new Map<string, Entry>();
  private expiresAt = new Map<string, number>();
  /** Every exec() batch, for asserting round trips. */
  readonly batches: Cmd[][] = [];
  /** When set, the next exec() rejects with this error (then clears). */
  failNext: Error | null = null;

  constructor(public now: () => number = Date.now) {}

  async exec<const T extends readonly Cmd[]>(cmds: T): Promise<Results<T>> {
    this.batches.push([...cmds]);
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    return cmds.map((c) => this.run(c)) as unknown as Results<T>;
  }

  /** Seconds to live: -2 missing, -1 no expiry (like Redis TTL). */
  ttl(key: string): number {
    if (!this.live(key)) return -2;
    const at = this.expiresAt.get(key);
    return at === undefined ? -1 : Math.ceil((at - this.now()) / 1000);
  }

  typeOf(key: string): Entry["type"] | "none" {
    return this.live(key)?.type ?? "none";
  }

  keys(): string[] {
    return [...this.data.keys()].filter((k) => this.live(k));
  }

  private live(key: string): Entry | undefined {
    const at = this.expiresAt.get(key);
    if (at !== undefined && at <= this.now()) {
      this.data.delete(key);
      this.expiresAt.delete(key);
    }
    return this.data.get(key);
  }

  private typed<K extends Entry["type"]>(key: string, type: K): Extract<Entry, { type: K }> | undefined {
    const e = this.live(key);
    if (e && e.type !== type) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    return e as Extract<Entry, { type: K }> | undefined;
  }

  private create<K extends Entry["type"]>(key: string, type: K, empty: () => Extract<Entry, { type: K }>) {
    const existing = this.typed(key, type);
    if (existing) return existing;
    const e = empty();
    this.data.set(key, e);
    return e;
  }

  private run(c: Cmd): unknown {
    switch (c[0]) {
      case "get": return this.typed(c[1], "string")?.value ?? null;
      case "mget": return c[1].map((k) => { const e = this.live(k); return e?.type === "string" ? e.value : null; });
      case "set":
        this.data.set(c[1], { type: "string", value: c[2] });
        this.expiresAt.set(c[1], this.now() + c[3] * 1000);
        return "OK";
      case "expire":
        if (!this.live(c[1])) return 0;
        this.expiresAt.set(c[1], this.now() + c[2] * 1000);
        return 1;
      case "del": {
        let n = 0;
        for (const k of c[1]) { if (this.live(k)) n++; this.data.delete(k); this.expiresAt.delete(k); }
        return n;
      }
      case "hget": return this.typed(c[1], "hash")?.value.get(c[2]) ?? null;
      case "hset": this.create(c[1], "hash", () => ({ type: "hash", value: new Map() })).value.set(c[2], c[3]); return 1;
      case "hgetall": return Object.fromEntries(this.typed(c[1], "hash")?.value ?? []);
      case "zadd": this.create(c[1], "zset", () => ({ type: "zset", value: new Map() })).value.set(c[3], c[2]); return 1;
      case "zrevrange":
        return [...(this.typed(c[1], "zset")?.value ?? [])]
          .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))
          .map(([m]) => m);
      case "incrby": {
        if (!Number.isInteger(c[2])) throw new Error("ERR value is not an integer or out of range");
        const e = this.typed(c[1], "string");
        const next = Number(e?.value ?? 0) + c[2];
        this.data.set(c[1], { type: "string", value: String(next) });
        return next;
      }
      case "lpush": { const l = this.create(c[1], "list", () => ({ type: "list", value: [] })); l.value.unshift(c[2]); return l.value.length; }
      case "ltrim": {
        const l = this.typed(c[1], "list");
        if (l) l.value = l.value.slice(c[2], c[3] < 0 ? l.value.length + c[3] + 1 : c[3] + 1);
        return "OK";
      }
      case "lrange": {
        const l = this.typed(c[1], "list")?.value ?? [];
        return l.slice(c[2], c[3] < 0 ? l.length + c[3] + 1 : c[3] + 1);
      }
      case "ttl": return this.ttl(c[1]);
    }
  }
}
