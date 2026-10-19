import { describe, expect, it } from "vitest";
import { estimateCostMicroUsd, priceFor } from "./cost";
import { PRICES } from "@/lib/claude/models";

const base = { input_tokens: 0, output_tokens: 0 };

describe("estimateCostMicroUsd", () => {
  it("prices input and output tokens ($/MTok × tokens = micro-USD)", () => {
    // Sonnet: $2 in, $10 out → 1,000 in + 500 out = 2,000 + 5,000 micro-USD
    expect(estimateCostMicroUsd("claude-sonnet-5-5", { ...base, input_tokens: 1000, output_tokens: 500 })).toBe(7000);
    // 1M Opus output tokens = $20
    expect(estimateCostMicroUsd("claude-opus-5-5", { ...base, output_tokens: 1_000_000 })).toBe(20_000_000);
  });

  it("prices cache reads and 5-minute cache writes", () => {
    const usage = { ...base, input_tokens: 100, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 2000 };
    // Sonnet: 100×2 + 10,000×0.2 + 2,000×2.5 = 200 + 2,000 + 5,000
    expect(estimateCostMicroUsd("claude-sonnet-5-5", usage)).toBe(7200);
  });

  it("prices 1-hour cache writes at 2× input", () => {
    const usage = {
      ...base,
      cache_creation_input_tokens: 3000,
      cache_creation: { ephemeral_1h_input_tokens: 1000, ephemeral_5m_input_tokens: 2000 },
    };
    // Sonnet: 2,000×2.5 + 1,000×4 = 5,000 + 4,000
    expect(estimateCostMicroUsd("claude-sonnet-5-5", usage)).toBe(9000);
  });

  it("adds $10 per 1,000 web searches", () => {
    expect(estimateCostMicroUsd("claude-sonnet-5-5", { ...base, server_tool_use: { web_search_requests: 2 } })).toBe(20_000);
    expect(estimateCostMicroUsd("claude-sonnet-5-5", { ...base, server_tool_use: null })).toBe(0);
  });

  it("treats null cache fields as zero", () => {
    const usage = { ...base, input_tokens: 10, cache_read_input_tokens: null, cache_creation_input_tokens: null, cache_creation: null };
    expect(estimateCostMicroUsd("claude-haiku-5-5", usage)).toBe(1);
  });

  it("rounds up fractional micro-USD but ignores float noise", () => {
    expect(estimateCostMicroUsd("claude-haiku-5-5", { ...base, input_tokens: 3 })).toBe(1); // 0.3 → 1
    expect(estimateCostMicroUsd("claude-sonnet-5-5", { ...base, cache_read_input_tokens: 1000 })).toBe(200); // not 201
    expect(estimateCostMicroUsd("claude-sonnet-5-5", base)).toBe(0);
  });

  it("matches dated model ids by prefix and prices unknown models at the most expensive rate", () => {
    expect(priceFor("claude-haiku-5-5-20261001")).toEqual(PRICES["claude-haiku-5-5"]);
    const unknown = priceFor("some-new-model");
    for (const p of Object.values(PRICES)) {
      expect(unknown.input).toBeGreaterThanOrEqual(p.input);
      expect(unknown.output).toBeGreaterThanOrEqual(p.output);
      expect(unknown.cacheRead).toBeGreaterThanOrEqual(p.cacheRead);
      expect(unknown.cacheWrite).toBeGreaterThanOrEqual(p.cacheWrite);
    }
    expect(estimateCostMicroUsd("some-new-model", { ...base, output_tokens: 1000 })).toBe(20_000);
  });
});
