/**
 * Minimal Redis surface used by RedisStore, so tests can inject an in-memory fake (lib/store/fake-redis.ts).
 * Every call is a batch sent in one round trip (an Upstash pipeline; not atomic). Values are raw strings:
 * RedisStore does its own JSON encoding, so Upstash's automatic deserialization is turned off.
 */
import { Redis } from "@upstash/redis";

export type Cmd =
  | readonly ["get", key: string]
  | readonly ["mget", keys: readonly string[]]
  | readonly ["set", key: string, value: string, exSeconds: number]
  | readonly ["expire", key: string, seconds: number]
  | readonly ["del", keys: readonly string[]]
  | readonly ["hget", key: string, field: string]
  | readonly ["hset", key: string, field: string, value: string]
  | readonly ["hgetall", key: string]
  | readonly ["zadd", key: string, score: number, member: string]
  | readonly ["zrevrange", key: string] // all members, highest score first
  | readonly ["incrby", key: string, by: number]
  | readonly ["lpush", key: string, value: string]
  | readonly ["ltrim", key: string, start: number, stop: number]
  | readonly ["lrange", key: string, start: number, stop: number]
  | readonly ["ttl", key: string];

interface ResultMap {
  get: string | null;
  mget: (string | null)[];
  set: unknown;
  expire: unknown;
  del: number;
  hget: string | null;
  hset: unknown;
  hgetall: Record<string, string>;
  zadd: unknown;
  zrevrange: string[];
  incrby: number;
  lpush: number;
  ltrim: unknown;
  lrange: string[];
  ttl: number;
}

export type CmdResult<C extends Cmd> = ResultMap[C[0]];
export type Results<T extends readonly Cmd[]> = { -readonly [K in keyof T]: T[K] extends Cmd ? CmdResult<T[K]> : never };

export interface RedisLike {
  exec<const T extends readonly Cmd[]>(cmds: T): Promise<Results<T>>;
}

export interface UpstashCredentials {
  url: string;
  token: string;
}

/** Reads Upstash credentials from either Vercel Marketplace naming scheme. Never log the result. */
export function upstashCredentials(env: NodeJS.ProcessEnv = process.env): UpstashCredentials | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/** Turns a flat [k1, v1, k2, v2] reply (what HGETALL returns without auto-deserialization) into an object. */
function pairsToObject(v: unknown): Record<string, string> {
  if (!v) return {};
  if (!Array.isArray(v)) return v as Record<string, string>;
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < v.length; i += 2) out[String(v[i])] = String(v[i + 1]);
  return out;
}

const asString = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** Adapts an @upstash/redis client (created with `automaticDeserialization: false`) to RedisLike. */
export function upstashKv(redis: Redis): RedisLike {
  return {
    async exec<const T extends readonly Cmd[]>(cmds: T): Promise<Results<T>> {
      if (cmds.length === 0) return [] as unknown as Results<T>;
      const p = redis.pipeline();
      for (const c of cmds) {
        // Pipeline methods mutate and return the same instance; return values are intentionally ignored.
        switch (c[0]) {
          case "get": p.get(c[1]); break;
          case "mget": p.mget(...c[1]); break;
          case "set": p.set(c[1], c[2], { ex: c[3] }); break;
          case "expire": p.expire(c[1], c[2]); break;
          case "del": p.del(...c[1]); break;
          case "hget": p.hget(c[1], c[2]); break;
          case "hset": p.hset(c[1], { [c[2]]: c[3] }); break;
          case "hgetall": p.hgetall(c[1]); break;
          case "zadd": p.zadd(c[1], { score: c[2], member: c[3] }); break;
          case "zrevrange": p.zrange(c[1], 0, -1, { rev: true }); break;
          case "incrby": p.incrby(c[1], c[2]); break;
          case "lpush": p.lpush(c[1], c[2]); break;
          case "ltrim": p.ltrim(c[1], c[2], c[3]); break;
          case "lrange": p.lrange(c[1], c[2], c[3]); break;
          case "ttl": p.ttl(c[1]); break;
        }
      }
      const raw: unknown[] = await p.exec();
      return cmds.map((c, i) => {
        const r = raw[i];
        switch (c[0]) {
          case "get":
          case "hget": return asString(r);
          case "mget": return (r as unknown[]).map(asString);
          case "hgetall": return pairsToObject(r);
          case "zrevrange":
          case "lrange": return ((r as unknown[] | null) ?? []).map(String);
          case "incrby":
          case "lpush":
          case "del":
          case "ttl": return Number(r);
          default: return r;
        }
      }) as unknown as Results<T>;
    },
  };
}

export function createUpstashKv(creds: UpstashCredentials): RedisLike {
  return upstashKv(new Redis({ ...creds, automaticDeserialization: false }));
}
