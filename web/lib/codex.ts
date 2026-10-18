/**
 * The cross-session Codex: everything the learner has practised, from their per-user mastery map.
 * Served by GET /api/codex; rendered by app/codex. Status rules live in the engine (lib/engine/review.ts).
 */
import type { MasteryMap } from "@/lib/contracts/engine";
import { conceptStatus, strength, type ConceptStatus } from "@/lib/engine";

export type CodexStatus = ConceptStatus;

export interface CodexEntry {
  concept: string;
  /** P(correct on a medium, difficulty-3 question), 0..1. */
  strength: number;
  /** Graded attempts. */
  n: number;
  /** Epoch ms of the last graded attempt. */
  lastSeen: number;
  status: CodexStatus;
}

export interface CodexResponse {
  concepts: CodexEntry[];
}

/** Display order: celebrate what's mastered first, then what's growing, then what to review next time. */
export const CODEX_STATUS_ORDER: CodexStatus[] = ["mastered", "growing", "review"];

/** Every concept in the map, grouped by status (CODEX_STATUS_ORDER), most recently practised first, then by name. */
export function buildCodex(mastery: MasteryMap, now: number): CodexEntry[] {
  return Object.entries(mastery)
    .filter(([, m]) => m.n > 0)
    .map(([concept, m]) => ({
      concept,
      strength: Math.round(strength(m) * 1000) / 1000,
      n: m.n,
      lastSeen: m.lastSeen,
      status: conceptStatus(m, now),
    }))
    .sort(
      (a, b) =>
        CODEX_STATUS_ORDER.indexOf(a.status) - CODEX_STATUS_ORDER.indexOf(b.status) ||
        b.lastSeen - a.lastSeen ||
        a.concept.localeCompare(b.concept),
    );
}
