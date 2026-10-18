// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_THEME, THEMES, applyTheme, isUnlocked } from "./themes";

describe("themes", () => {
  it("frost is always unlocked", () => {
    expect(isUnlocked("frost", [])).toBe(true);
  });

  it("locks higher themes until unlocked by the server or by level", () => {
    expect(isUnlocked("sunset", [])).toBe(false);
    expect(isUnlocked("sunset", ["sunset"])).toBe(true);
    expect(isUnlocked("night", [], 4)).toBe(false);
    expect(isUnlocked("night", [], 5)).toBe(true);
  });

  it("treats unknown themes as locked", () => {
    expect(isUnlocked("vaporwave", ["vaporwave"])).toBe(false);
  });

  it("applyTheme sets data-theme and falls back to the default", () => {
    expect(applyTheme("forest")).toBe("forest");
    expect(document.documentElement.dataset.theme).toBe("forest");
    expect(applyTheme("nope")).toBe(DEFAULT_THEME);
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);
  });

  it("has unique ids, increasing unlock levels, and a CSS block for every non-default theme", () => {
    const css = readFileSync(join(process.cwd(), "app/themes.css"), "utf8");
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    for (let i = 1; i < THEMES.length; i++) expect(THEMES[i].unlockLevel).toBeGreaterThan(THEMES[i - 1].unlockLevel);
    for (const t of THEMES.filter((t) => t.id !== DEFAULT_THEME)) expect(css).toContain(`:root[data-theme="${t.id}"]`);
  });
});
