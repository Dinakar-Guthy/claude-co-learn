/** Sliding-window rate limiters: Upstash-backed in production, in-memory for local dev and tests. */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { UpstashCredentials } from "@/lib/store/redis-kv";

export interface RateLimitResult {
  success: boolean;
  /** Epoch ms when the caller may retry. */
  reset: number;
}

export interface RateLimiter {
  limit(key: string): Promise<RateLimitResult>;
}

/** Exact sliding log. Per process only, which is fine for local dev and a single test runner. */
export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async limit(key: string): Promise<RateLimitResult> {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { success: false, reset: recent[0] + this.windowMs };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { success: true, reset: recent[0] + this.windowMs };
  }
}

export function upstashRateLimiter(creds: UpstashCredentials, max: number, windowS: number, prefix: string): RateLimiter {
  const limiter = new Ratelimit({
    // A separate client with Upstash's default (de)serialization, which the ratelimit scripts expect.
    redis: new Redis(creds),
    limiter: Ratelimit.slidingWindow(max, `${windowS} s`),
    prefix,
    analytics: false,
    timeout: 2000, // Upstash allows the request through if Redis is slower than this
  });
  return {
    async limit(key) {
      const r = await limiter.limit(key);
      return { success: r.success, reset: r.reset };
    },
  };
}
