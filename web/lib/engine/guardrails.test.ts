import { describe, expect, it } from "vitest";
import { CAP_WINDOW_MS, capsExceeded, momentsInWindow, valueThreshold } from "./guardrails";
import { MIN, settings, stateWith, T0 } from "./test-helpers";

describe("valueThreshold", () => {
  it("is 4 when off, light, or balanced, and 5 for strict", () => {
    expect(valueThreshold(settings())).toBe(4);
    expect(valueThreshold(settings({ enabled: false, mode: "strict" }))).toBe(4);
    expect(valueThreshold(settings({ enabled: true, mode: "light" }))).toBe(4);
    expect(valueThreshold(settings({ enabled: true, mode: "balanced" }))).toBe(4);
    expect(valueThreshold(settings({ enabled: true, mode: "strict" }))).toBe(5);
  });
});

describe("momentsInWindow", () => {
  it("counts moments in the half-open window (now − 10 min, now]", () => {
    expect(CAP_WINDOW_MS).toBe(10 * MIN);
    const state = stateWith({ momentsShownAt: [T0 - 10 * MIN, T0 - 10 * MIN + 1, T0, T0 + 1] });
    // T0 − 10min drops out exactly at the edge; T0 + 1 is in the future and ignored.
    expect(momentsInWindow(state, T0)).toBe(2);
  });
});

describe("capsExceeded", () => {
  it("light: needs ≥ 1 work turn since the last moment", () => {
    expect(capsExceeded(stateWith({ momentsShownAt: [T0], turnsSinceMoment: 0 }), "light", T0)).toBe(true);
    expect(capsExceeded(stateWith({ momentsShownAt: [T0], turnsSinceMoment: 1 }), "light", T0)).toBe(false);
  });

  it("light: has no per-window cap", () => {
    const many = Array.from({ length: 10 }, (_, i) => T0 - i * MIN);
    expect(capsExceeded(stateWith({ momentsShownAt: many, turnsSinceMoment: 1 }), "light", T0)).toBe(false);
  });

  it("does not apply turn spacing before the first moment", () => {
    expect(capsExceeded(stateWith({ turnsSinceMoment: 0 }), "light", T0)).toBe(false);
    expect(capsExceeded(stateWith({ turnsSinceMoment: 0 }), "balanced", T0)).toBe(false);
  });

  it("balanced: needs ≥ 2 turns between moments", () => {
    expect(capsExceeded(stateWith({ momentsShownAt: [T0 - MIN], turnsSinceMoment: 1 }), "balanced", T0)).toBe(true);
    expect(capsExceeded(stateWith({ momentsShownAt: [T0 - MIN], turnsSinceMoment: 2 }), "balanced", T0)).toBe(false);
  });

  it("balanced: allows ≤ 4 per rolling 10 minutes", () => {
    const three = [T0 - 9 * MIN, T0 - 6 * MIN, T0 - 3 * MIN];
    const four = [T0 - 10 * MIN + 1, ...three];
    expect(capsExceeded(stateWith({ momentsShownAt: three, turnsSinceMoment: 5 }), "balanced", T0)).toBe(false);
    expect(capsExceeded(stateWith({ momentsShownAt: four, turnsSinceMoment: 5 }), "balanced", T0)).toBe(true);
    // One millisecond later the oldest moment leaves the window.
    expect(capsExceeded(stateWith({ momentsShownAt: four, turnsSinceMoment: 5 }), "balanced", T0 + 1)).toBe(false);
  });

  it("strict: allows ≤ 2 per rolling 10 minutes, with no turn spacing", () => {
    const one = [T0 - 5 * MIN];
    const two = [T0 - 10 * MIN, T0 - 5 * MIN, T0 - 1];
    expect(capsExceeded(stateWith({ momentsShownAt: one, turnsSinceMoment: 0 }), "strict", T0)).toBe(false);
    expect(capsExceeded(stateWith({ momentsShownAt: two, turnsSinceMoment: 0 }), "strict", T0)).toBe(true);
    expect(capsExceeded(stateWith({ momentsShownAt: two, turnsSinceMoment: 0 }), "strict", T0 + 5 * MIN)).toBe(false);
  });
});
