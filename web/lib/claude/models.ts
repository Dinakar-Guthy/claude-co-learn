/**
 * Model routing — the single place to change models/effort (and the seam for model-agnosticism, P1).
 * Decisions: docs/decision-log.md (high effort for planning, medium for per-turn execution).
 */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelRoute {
  model: string;
  effort: Effort;
  maxTokens: number;
}

export const MODELS = {
  /** Per-turn work loop (streams, runs code, proposes moments). Fallback: claude-opus-5-5. */
  work: { model: "claude-sonnet-5-5", effort: "medium", maxTokens: 32000 },
  /** Background session sketch after intent (planning). */
  sketch: { model: "claude-opus-5-5", effort: "high", maxTokens: 16000 },
  /** Boss generation (planning-grade). Upgrade to Opus if quality is weak. */
  boss: { model: "claude-sonnet-5-5", effort: "high", maxTokens: 16000 },
  story: { model: "claude-sonnet-5-5", effort: "medium", maxTokens: 8000 },
  wrapup: { model: "claude-sonnet-5-5", effort: "medium", maxTokens: 8000 },
  /** Fast structured calls. Switch grade to Sonnet if testing shows mis-grades. */
  grade: { model: "claude-haiku-5-5", effort: "low", maxTokens: 4000 },
  verify: { model: "claude-haiku-5-5", effort: "low", maxTokens: 4000 },
  /**
   * Currently unused: work-loop history compaction (lib/claude/work/compact.ts) runs on `work`, because the API's
   * on-demand compaction must run on the conversation's model to keep the kept turns' thinking valid.
   */
  compact: { model: "claude-haiku-5-5", effort: "low", maxTokens: 4000 },
  /** Learner-requested help: quick hints on Haiku; "Teach me" and "Ask Claude" on Sonnet (better teaching, better at not leaking). */
  hint: { model: "claude-haiku-5-5", effort: "low", maxTokens: 2000 },
  tutor: { model: "claude-sonnet-5-5", effort: "low", maxTokens: 4000 },
  /** Novice primer, generated in parallel with the sketch; must be quick so it's ready during the first turn. */
  primer: { model: "claude-sonnet-5-5", effort: "low", maxTokens: 4000 },
} as const satisfies Record<string, ModelRoute>;

/** $ per million tokens (input, output, cache read) — for spend caps. Source: claude-api skill cache 2026-10-06. */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** Code execution tool version used by the work loop. */
export const CODE_EXECUTION_TOOL = { type: "code_execution_20260521", name: "code_execution" } as const;
