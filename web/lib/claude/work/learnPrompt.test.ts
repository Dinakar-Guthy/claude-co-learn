import { describe, expect, it } from "vitest";
import { LEARN_SYSTEM_PROMPT } from "./learnPrompt";

describe("Learn tutor prompt", () => {
  it("prefers strong sources and steers away from weak ones (Dinakar, 2026-10-19)", () => {
    expect(LEARN_SYSTEM_PROMPT).toMatch(/Prefer, in order: encyclopedias/);
    expect(LEARN_SYSTEM_PROMPT).toMatch(/museum/);
    expect(LEARN_SYSTEM_PROMPT).toMatch(/Avoid content farms, SEO blogs/);
    expect(LEARN_SYSTEM_PROMPT).toMatch(/Never cite URLs or titles from memory/);
  });
});
