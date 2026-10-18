/**
 * P0 STAND-IN — Track E replaces with Upstash rate limits + daily spend caps
 * ($5/browser, $25/IP, $75/day global; docs/design-plan.md §11).
 */
import type Anthropic from "@anthropic-ai/sdk";

export type LimitCheck = { ok: true } | { ok: false; code: "rate_limited" | "spend_cap"; message: string };

/** Call before every Claude-backed request. */
export async function checkLimits(_anonId: string, _ip: string): Promise<LimitCheck> {
  return { ok: true };
}

/** Call after every Claude response with its usage, to accumulate spend. */
export async function recordUsage(_anonId: string, _ip: string, _model: string, _usage: Anthropic.Usage | Anthropic.Beta.BetaUsage): Promise<void> {}
