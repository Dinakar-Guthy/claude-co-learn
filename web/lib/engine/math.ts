/** Small numeric helpers shared by the engine modules. */

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export const logit = (p: number): number => Math.log(p / (1 - p));

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Tolerance for comparing averages of fractional scores (e.g. 0.6 + 0.6 + …) against thresholds. */
export const EPSILON = 1e-9;
