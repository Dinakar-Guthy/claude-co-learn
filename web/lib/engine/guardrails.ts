/** Value thresholds and optional guardrail caps (design-plan §7.2, product-vision "Pacing engine"). */
import type { EngineState, GuardrailMode, UserSettings } from "@/lib/contracts/engine";
import type { SessionMode } from "@/lib/modes";

/** Minimum learning_value with guardrails off (the default). */
export const DEFAULT_VALUE_THRESHOLD = 4;

export const VALUE_THRESHOLD: Record<GuardrailMode, number> = {
  light: 4,
  balanced: 4,
  strict: 5, // "only the highest-value moments"
};

/** Rolling window for per-time caps (design-plan §7.2: "per 10 min"). */
export const CAP_WINDOW_MS = 10 * 60 * 1000;

export interface Caps {
  maxPerWindow?: number; // moments shown within CAP_WINDOW_MS
  minTurnsBetween?: number; // work turns since the last shown moment
}

export const CAPS: Record<GuardrailMode, Caps> = {
  light: { minTurnsBetween: 1 },
  balanced: { maxPerWindow: 4, minTurnsBetween: 2 },
  strict: { maxPerWindow: 2 },
};

/** Learn mode: one lower (4 → 3), since teaching then asking is the point there; never below 3. */
export function valueThreshold(settings: UserSettings, mode: SessionMode = "co-learn"): number {
  const base = settings.guardrails.enabled ? VALUE_THRESHOLD[settings.guardrails.mode] : DEFAULT_VALUE_THRESHOLD;
  return mode === "learn" ? Math.max(3, base - 1) : base;
}

/** Moments shown in the half-open window (now − CAP_WINDOW_MS, now]. */
export function momentsInWindow(state: EngineState, now: number): number {
  return state.momentsShownAt.filter((t) => t <= now && now - t < CAP_WINDOW_MS).length;
}

/** True if showing another moment now would break the mode's caps. Turn spacing only applies after a first moment. */
export function capsExceeded(state: EngineState, mode: GuardrailMode, now: number): boolean {
  const { maxPerWindow, minTurnsBetween } = CAPS[mode];
  if (maxPerWindow !== undefined && momentsInWindow(state, now) >= maxPerWindow) return true;
  const shownBefore = state.momentsShownAt.length > 0;
  return minTurnsBetween !== undefined && shownBefore && state.turnsSinceMoment < minTurnsBetween;
}
