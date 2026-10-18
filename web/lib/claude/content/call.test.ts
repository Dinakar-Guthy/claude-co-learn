import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MODELS } from "@/lib/claude/models";
import { callStructured, FALLBACK_BETA } from "./call";
import { ContentRefusalError, ContentShapeError, ContentTruncatedError } from "./errors";
import { fakeClient } from "./test-client";
import { withUsageReporter } from "./usage";

const fake = fakeClient();
vi.mock("@/lib/claude/client", () => ({ anthropic: () => fake.client }));

const Schema = z.object({ answer: z.string() });
const base = { task: "test", system: "sys", user: "hi", schema: Schema };

beforeEach(() => {
  fake.create.mockClear();
  fake.betaCreate.mockClear();
});

describe("callStructured", () => {
  it("uses the GA namespace for Haiku with effort and a JSON-schema format", async () => {
    fake.queue({ json: { answer: "42" } });
    await expect(callStructured({ ...base, route: MODELS.grade })).resolves.toEqual({ answer: "42" });
    const params = fake.create.mock.calls[0][0] as unknown as Record<string, unknown> & { output_config: { effort: string; format: { type: string } } };
    expect(fake.betaCreate).not.toHaveBeenCalled();
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.output_config.effort).toBe("low");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("fallbacks");
  });

  it("opts Sonnet/Opus into server-side refusal fallbacks via the beta namespace", async () => {
    fake.queue({ json: { answer: "ok" } }, { json: { answer: "ok" } });
    await callStructured({ ...base, route: MODELS.boss });
    await callStructured({ ...base, route: MODELS.sketch });
    expect(fake.create).not.toHaveBeenCalled();
    for (const [params] of fake.betaCreate.mock.calls as unknown as [Record<string, unknown>][]) {
      expect(params.betas).toEqual([FALLBACK_BETA]);
      expect(params.fallbacks).toBe("default");
    }
  });

  it("throws a typed refusal error", async () => {
    fake.queue({ stop_reason: "refusal", category: "cyber" });
    const err = await callStructured({ ...base, route: MODELS.story }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContentRefusalError);
    expect((err as ContentRefusalError).category).toBe("cyber");
  });

  it("retries once with double max_tokens, then gives up", async () => {
    fake.queue({ stop_reason: "max_tokens", text: '{"ans' }, { json: { answer: "done" } });
    await expect(callStructured({ ...base, route: MODELS.grade })).resolves.toEqual({ answer: "done" });
    expect((fake.create.mock.calls[1][0] as unknown as { max_tokens: number }).max_tokens).toBe(MODELS.grade.maxTokens * 2);

    fake.queue({ stop_reason: "max_tokens" }, { stop_reason: "max_tokens" });
    await expect(callStructured({ ...base, route: MODELS.grade })).rejects.toBeInstanceOf(ContentTruncatedError);
  });

  it("rejects missing text, invalid JSON, and schema mismatches", async () => {
    fake.queue({}, { text: "not json" }, { json: { wrong: 1 } });
    for (let i = 0; i < 3; i++) await expect(callStructured({ ...base, route: MODELS.grade })).rejects.toBeInstanceOf(ContentShapeError);
  });

  it("reports usage for every response, including retries", async () => {
    const reporter = vi.fn(async () => {});
    fake.queue({ stop_reason: "max_tokens" }, { json: { answer: "x" } });
    await withUsageReporter(reporter, () => callStructured({ ...base, route: MODELS.grade }));
    expect(reporter).toHaveBeenCalledTimes(2);
    expect(reporter).toHaveBeenCalledWith("claude-haiku-5-5", { input_tokens: 100, output_tokens: 50 });
  });

  it("never lets a failing reporter break the call", async () => {
    fake.queue({ json: { answer: "x" } });
    await expect(withUsageReporter(async () => Promise.reject(new Error("redis down")), () => callStructured({ ...base, route: MODELS.grade }))).resolves.toEqual({ answer: "x" });
  });
});
