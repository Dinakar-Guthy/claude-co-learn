import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LearningMomentInputSchema, MilestoneInputSchema, ResolvePredictionInputSchema } from "@/lib/contracts/moment";
import { learningMomentSchema, milestoneSchema, resolvePredictionSchema, WORK_TOOLS } from "./tools";
import { momentInput } from "./testing";

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema };

/** Walks a zod object and the hand-written JSON schema together, checking keys and required-ness match. */
function expectInSync(zod: z.ZodObject, json: Schema, path = "") {
  const shape = zod.shape as Record<string, z.ZodType>;
  expect(Object.keys(json.properties ?? {}).sort(), path).toEqual(Object.keys(shape).sort());
  const required = Object.entries(shape).filter(([, v]) => !v.safeParse(undefined).success).map(([k]) => k);
  expect([...(json.required ?? [])].sort(), path).toEqual(required.sort());
  expect(json.additionalProperties, path).toBe(false);
  for (const [key, value] of Object.entries(shape)) {
    const inner = value instanceof z.ZodOptional ? value.unwrap() : value;
    if (inner instanceof z.ZodObject) expectInSync(inner, json.properties![key], `${path}.${key}`);
  }
}

describe("work tools", () => {
  it("mirror the zod contracts", () => {
    expectInSync(LearningMomentInputSchema, learningMomentSchema as Schema);
    expectInSync(ResolvePredictionInputSchema, resolvePredictionSchema as Schema);
    expectInSync(MilestoneInputSchema, milestoneSchema as Schema);
  });

  it("only use keywords strict tool schemas support", () => {
    const text = JSON.stringify(WORK_TOOLS);
    for (const banned of ["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "multipleOf"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("are code execution, web search, and strict function tools, in a stable order", () => {
    expect(WORK_TOOLS.map((t) => (t as { name: string }).name)).toEqual(["code_execution", "web_search", "learning_moment", "resolve_prediction", "milestone_reached"]);
    expect(WORK_TOOLS[1]).toMatchObject({ type: "web_search_20250305", max_uses: 2, allowed_callers: ["direct"] });
    for (const tool of WORK_TOOLS.slice(2)) expect(tool).toMatchObject({ strict: true });
  });

  it("fixture is a valid moment", () => {
    expect(LearningMomentInputSchema.safeParse(momentInput()).success).toBe(true);
  });
});
