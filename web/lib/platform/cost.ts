/** Spend estimate for one Claude response, in micro-USD (integer, rounded up). */
import { PRICES } from "@/lib/claude/models";

type Price = (typeof PRICES)[string];

/** The usage fields we price; structurally satisfied by Anthropic.Usage and Anthropic.Beta.BetaUsage. */
export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number } | null;
}

/** Field-wise maximum across the price table: the conservative price for unknown models. */
const MOST_EXPENSIVE: Price = Object.values(PRICES).reduce(
  (max, p) => ({
    input: Math.max(max.input, p.input),
    output: Math.max(max.output, p.output),
    cacheRead: Math.max(max.cacheRead, p.cacheRead),
    cacheWrite: Math.max(max.cacheWrite, p.cacheWrite),
  }),
  { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
);

/** Exact id first, then dated/suffixed ids (e.g. "claude-sonnet-5-5-20261001"), else the most expensive. */
export function priceFor(model: string): Price {
  if (PRICES[model]) return PRICES[model];
  const prefix = Object.keys(PRICES).find((id) => model.startsWith(id));
  return prefix ? PRICES[prefix] : MOST_EXPENSIVE;
}

/**
 * $/MTok × tokens = micro-USD, so no unit conversion is needed.
 * 1-hour cache writes are billed at 2× input (vs 1.25× for 5-minute writes, which PRICES.cacheWrite covers).
 */
export function estimateCostMicroUsd(model: string, usage: UsageLike): number {
  const p = priceFor(model);
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const oneHour = Math.min(cacheWrite, usage.cache_creation?.ephemeral_1h_input_tokens ?? 0);
  const micro =
    usage.input_tokens * p.input +
    usage.output_tokens * p.output +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
    (cacheWrite - oneHour) * p.cacheWrite +
    oneHour * p.input * 2;
  return Math.ceil(Math.round(micro * 1e6) / 1e6); // strip float noise (e.g. 1000 × 0.2) before rounding up
}
