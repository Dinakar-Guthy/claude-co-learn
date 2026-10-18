/**
 * Abuse protection for every Claude-backed route (docs/design-plan.md §11):
 * - Rate limits (sliding window): 20/min per anon ID, 60/min per IP.
 * - Daily spend caps (UTC day, micro-USD): $5 per anon ID, $25 per IP, $75 global.
 *
 * Failure policy when storage misbehaves (decided by Dinakar, 2026-10-17): everything fails OPEN.
 * Limits are a safeguard, not a product requirement, so a broken counter must never block learners.
 * Instead the request proceeds with a `warning` the UI shows ("let the tool's owner know"), and
 * `limitsStatus()` reports the degradation (surfaced by /api/health).
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Store, UsageScope } from "@/lib/contracts/store";
import { getStore, storeKind } from "@/lib/store";
import { upstashCredentials } from "@/lib/store/redis-kv";
import { redactError } from "@/lib/store/errors";
import { estimateCostMicroUsd, type UsageLike } from "./cost";
import { MemoryRateLimiter, upstashRateLimiter, type RateLimiter } from "./ratelimit";

export { estimateCostMicroUsd } from "./cost";

export type LimitCheck =
  | { ok: true; warning?: string }
  | { ok: false; code: "rate_limited" | "spend_cap"; message: string; retryAfterS?: number };

export const RATE_LIMITS = {
  anon: { max: 20, windowS: 60 },
  ip: { max: 60, windowS: 60 },
} as const;

export const SPEND_CAPS_MICRO_USD = {
  anon: 5_000_000,
  ip: 25_000_000,
  global: 75_000_000,
} as const;

export const LIMIT_MESSAGES = {
  rateLimited: (s: number) => `You're moving fast! Give Co-learn about ${s} second${s === 1 ? "" : "s"} and try again.`,
  anonCap: "You've reached today's demo limit, thanks for trying Co-learn! It resets at midnight UTC.",
  ipCap: "Your network has reached today's demo limit, thanks for trying Co-learn! It resets at midnight UTC.",
  globalCap: "Co-learn has reached its demo budget for today, thanks for your interest! It resets at midnight UTC.",
  degraded: "Heads up: Co-learn's usage limits aren't working as expected right now. Please let the tool's owner know.",
} as const;

export interface LimitsStatus {
  degraded: boolean;
  lastIssueAt?: number;
  lastIssue?: "rate_limiter" | "spend_read" | "spend_write";
}

export interface LimitsDeps {
  store: Store;
  anonLimiter: RateLimiter;
  ipLimiter: RateLimiter;
  now?: () => number;
  log?: (line: string) => void;
}

export interface Limits {
  checkLimits(anonId: string, ip: string): Promise<LimitCheck>;
  recordUsage(anonId: string, ip: string, model: string, usage: UsageLike): Promise<void>;
  status(): LimitsStatus;
}

/** A degradation counts as current for this long after the last failure. */
const DEGRADED_WINDOW_MS = 10 * 60_000;

const scopesFor = (anonId: string, ip: string): UsageScope[] => [
  { kind: "anon", id: anonId },
  { kind: "ip", id: ip },
  { kind: "global" },
];

export function createLimits({ store, anonLimiter, ipLimiter, now = Date.now, log = (l) => console.error(l) }: LimitsDeps): Limits {
  let issue: { at: number; kind: NonNullable<LimitsStatus["lastIssue"]> } | null = null;
  const flag = (kind: NonNullable<LimitsStatus["lastIssue"]>) => { issue = { at: now(), kind }; };
  const status = (): LimitsStatus =>
    issue && now() - issue.at < DEGRADED_WINDOW_MS
      ? { degraded: true, lastIssueAt: issue.at, lastIssue: issue.kind }
      : { degraded: false };
  const allow = (): LimitCheck => (status().degraded ? { ok: true, warning: LIMIT_MESSAGES.degraded } : { ok: true });

  const tryLimit = async (limiter: RateLimiter, key: string) => {
    try {
      return await limiter.limit(key);
    } catch (e) {
      log(`[limits] rate limiter unavailable, allowing request (${redactError(e)})`);
      flag("rate_limiter");
      return { success: true, reset: 0 };
    }
  };

  return {
    async checkLimits(anonId, ip) {
      const [byAnon, byIp] = await Promise.all([tryLimit(anonLimiter, anonId), tryLimit(ipLimiter, ip)]);
      const blocked = [byAnon, byIp].filter((r) => !r.success);
      if (blocked.length > 0) {
        const retryAfterS = Math.max(1, Math.ceil((Math.max(...blocked.map((r) => r.reset)) - now()) / 1000));
        return { ok: false, code: "rate_limited", message: LIMIT_MESSAGES.rateLimited(retryAfterS), retryAfterS };
      }

      let spent: number[];
      try {
        spent = await store.getUsage(scopesFor(anonId, ip));
      } catch (e) {
        log(`[limits] spend caps unavailable, allowing request (${redactError(e)})`);
        flag("spend_read");
        return allow();
      }
      const [anon, byIpSpend, global] = spent;
      if (anon >= SPEND_CAPS_MICRO_USD.anon) return { ok: false, code: "spend_cap", message: LIMIT_MESSAGES.anonCap };
      if (byIpSpend >= SPEND_CAPS_MICRO_USD.ip) return { ok: false, code: "spend_cap", message: LIMIT_MESSAGES.ipCap };
      if (global >= SPEND_CAPS_MICRO_USD.global) return { ok: false, code: "spend_cap", message: LIMIT_MESSAGES.globalCap };
      return allow();
    },

    async recordUsage(anonId, ip, model, usage) {
      const cost = estimateCostMicroUsd(model, usage);
      if (cost <= 0) return;
      try {
        await store.addUsage(scopesFor(anonId, ip), cost);
      } catch (e) {
        log(`[limits] failed to record ${cost} micro-USD of usage (${redactError(e)})`);
        flag("spend_write");
      }
    },

    status,
  };
}

const globalForLimits = globalThis as unknown as { __colearnLimits?: Limits };

function defaultLimits(): Limits {
  if (!globalForLimits.__colearnLimits) {
    const creds = storeKind() === "redis" ? upstashCredentials() : null;
    const limiter = (kind: keyof typeof RATE_LIMITS): RateLimiter => {
      const { max, windowS } = RATE_LIMITS[kind];
      return creds ? upstashRateLimiter(creds, max, windowS, `ratelimit:${kind}`) : new MemoryRateLimiter(max, windowS * 1000);
    };
    globalForLimits.__colearnLimits = createLimits({ store: getStore(), anonLimiter: limiter("anon"), ipLimiter: limiter("ip") });
  }
  return globalForLimits.__colearnLimits;
}

/** Call before every Claude-backed request; on `ok: false` respond with `limitResponse(check)` (lib/platform/http.ts). */
export async function checkLimits(anonId: string, ip: string): Promise<LimitCheck> {
  return defaultLimits().checkLimits(anonId, ip);
}

/** Current health of the limits machinery (for /api/health and UI banners). */
export function limitsStatus(): LimitsStatus {
  return defaultLimits().status();
}

/** Call after every Claude response with its usage, to accumulate spend. Never throws. */
export async function recordUsage(anonId: string, ip: string, model: string, usage: Anthropic.Usage | Anthropic.Beta.BetaUsage): Promise<void> {
  return defaultLimits().recordUsage(anonId, ip, model, usage);
}
