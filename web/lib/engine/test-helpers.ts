/** Fixtures shared by the engine tests (not imported by production code). */
import {
  initialEngineState,
  type EngineState,
  type GateContext,
  type GuardrailMode,
  type Outcome,
  type UserSettings,
} from "@/lib/contracts/engine";
import type { LearningMomentInput } from "@/lib/contracts/moment";

export const MIN = 60 * 1000;
export const DAY = 24 * 60 * MIN;
export const T0 = 1_760_000_000_000;

export function candidate(overrides: Partial<LearningMomentInput> = {}): LearningMomentInput {
  return {
    type: "decide",
    concept: "train_test_split",
    question: "Why hold out a test set?",
    ideal_answer: "To estimate generalisation on unseen data.",
    rubric: { key_points: ["unseen data"] },
    mc_fallback: { options: ["a", "b", "c"], correct_index: 0, why: ["x", "y", "z"] },
    difficulty: 1,
    first_exposure: true,
    learning_value: 4,
    value_reason: "core idea",
    costly_mistake: false,
    timing: "before_step",
    ...overrides,
  };
}

export function settings(guardrails?: { enabled: boolean; mode: GuardrailMode }): UserSettings {
  return {
    sound: true,
    volume: 0.4,
    theme: "frost",
    soundPack: "default",
    guardrails: guardrails ?? { enabled: false, mode: "balanced" },
  };
}

export function ctx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    state: initialEngineState(),
    mastery: {},
    settings: settings(),
    familiarity: "some",
    now: T0,
    ...overrides,
  };
}

export function outcome(score: number, i = 0, concept = "c"): Outcome {
  return { momentId: `m${i}`, concept, type: "decide", score, at: T0 + i };
}

export function outcomes(scores: number[]): Outcome[] {
  return scores.map((s, i) => outcome(s, i));
}

export function stateWith(overrides: Partial<EngineState>): EngineState {
  return { ...initialEngineState(), ...overrides };
}

/** Deterministic PRNG (mulberry32) for simulation tests. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
