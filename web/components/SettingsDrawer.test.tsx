// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UserSettings } from "@/lib/contracts/engine";
import { SettingsDrawer } from "./SettingsDrawer";

afterEach(cleanup);

const settings: UserSettings = {
  sound: true,
  volume: 0.4,
  theme: "frost",
  soundPack: "soft-chimes",
  guardrails: { enabled: false, mode: "balanced" },
};

function setup(over: Partial<UserSettings> = {}) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  render(
    <SettingsDrawer open onClose={onClose} settings={{ ...settings, ...over }} level={2} unlocks={{ themes: ["sunset"], soundPacks: [] }} onChange={onChange} />,
  );
  return { onChange, onClose };
}

describe("SettingsDrawer", () => {
  it("lets you pick unlocked themes and locks the rest with a level hint", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Sunset/ }));
    expect(onChange).toHaveBeenCalledWith({ theme: "sunset" });
    const forest = screen.getByRole("button", { name: /Forest/ }) as HTMLButtonElement;
    expect(forest.disabled).toBe(true);
    screen.getByText("Reach level 4");
  });

  it("shows guardrail modes only when enabled, with a description", () => {
    const { onChange } = setup();
    expect(screen.queryByRole("button", { name: "Strict" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Limit learning moments" }));
    expect(onChange).toHaveBeenCalledWith({ guardrails: { enabled: true, mode: "balanced" } });
    cleanup();
    const second = setup({ guardrails: { enabled: true, mode: "strict" } });
    screen.getByText(/Strict = fewest interruptions/);
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(second.onChange).toHaveBeenCalledWith({ guardrails: { enabled: true, mode: "light" } });
  });

  it("closes on Escape", () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
