// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { CodexEntry } from "@/lib/codex";
import { safeBackHref } from "@/app/codex/CodexView";
import { CodexList } from "./CodexList";
import { TopBar } from "./TopBar";

afterEach(cleanup);

const NOW = 1_760_000_000_000;
const DAY = 24 * 60 * 60_000;
const entry = (concept: string, status: CodexEntry["status"], over: Partial<CodexEntry> = {}): CodexEntry => ({
  concept,
  status,
  strength: 0.5,
  n: 2,
  lastSeen: NOW - DAY,
  ...over,
});

describe("CodexList", () => {
  it("shows an encouraging empty state with a way to start", () => {
    render(<CodexList concepts={[]} now={NOW} />);
    expect(screen.getByText("Your Codex fills up as you learn. Start a session to add your first concept.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a session" }).getAttribute("href")).toBe("/");
  });

  it("groups concepts by status with strength, attempts and last practised", () => {
    render(
      <CodexList
        now={NOW}
        concepts={[
          entry("class imbalance", "mastered", { strength: 0.93, n: 4, lastSeen: NOW - 5 * 60_000 }),
          entry("precision", "growing", { n: 1 }),
          entry("data leakage", "review", { strength: 0.31, lastSeen: NOW - 3 * DAY }),
        ]}
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Mastered · 1", "Growing · 1", "Review next time · 1"]);

    const review = screen.getByRole("region", { name: /Review next time/ });
    expect(within(review).getByText("data leakage")).toBeTruthy();
    expect(within(review).getByText("2 attempts · last practised 3 days ago")).toBeTruthy();
    expect(within(review).getByRole("meter", { name: "Strength: data leakage" }).getAttribute("aria-valuenow")).toBe("31");

    expect(screen.getByText("1 attempt · last practised yesterday")).toBeTruthy();
    expect(screen.getByText("4 attempts · last practised 5 min ago")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/weak/i);
  });

  it("omits empty groups", () => {
    render(<CodexList now={NOW} concepts={[entry("a", "growing")]} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Growing · 1"]);
  });
});

describe("safeBackHref", () => {
  it("accepts app paths and rejects anything that could leave the site", () => {
    expect(safeBackHref("/s/abc")).toBe("/s/abc");
    expect(safeBackHref(null)).toBe("/");
    expect(safeBackHref("//evil.example")).toBe("/");
    expect(safeBackHref("/\\evil.example")).toBe("/");
    expect(safeBackHref("https://evil.example")).toBe("/");
  });
});

describe("TopBar Codex button", () => {
  const level = { level: 1, xp: 0, levelStartXp: 0, nextLevelXp: 100 };
  const props = { level, muted: false, onToggleMute: vi.fn(), onOpenSettings: vi.fn() };

  it("is hidden unless a codexHref is given", () => {
    render(<TopBar {...props} />);
    expect(screen.queryByRole("link", { name: "Codex" })).toBeNull();
  });

  it("links to the Codex next to the settings gear", () => {
    render(<TopBar {...props} codexHref="/codex?from=/s/abc" />);
    expect(screen.getByRole("link", { name: "Codex" }).getAttribute("href")).toBe("/codex?from=/s/abc");
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
  });
});
