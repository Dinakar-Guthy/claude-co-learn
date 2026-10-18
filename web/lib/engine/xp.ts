/** XP per event (design-plan §12). XP is only ever added, never subtracted. */
import type { BossOutcome, XpEvent } from "@/lib/contracts/engine";
import type { Verdict } from "@/lib/contracts/moment";

export const XP = {
  answer: { correct: 10, correctAfterMC: 5, partial: 5, incorrect: 0 },
  prediction: { correct: 10, partial: 5, incorrect: 0 } satisfies Record<Verdict, number>,
  bossHit: { full: 15, partial: 8 },
  // A retreat still pays: never punish.
  bossOutcome: { flawless: 75, victory: 50, retreat: 20 } satisfies Record<BossOutcome, number>,
  sessionComplete: 30,
} as const;

export function xpFor(event: XpEvent): number {
  switch (event.kind) {
    case "answer":
      if (event.verdict === "correct") return event.afterMC ? XP.answer.correctAfterMC : XP.answer.correct;
      return XP.answer[event.verdict];
    case "prediction":
      return XP.prediction[event.verdict];
    case "boss_hit":
      return event.partial ? XP.bossHit.partial : XP.bossHit.full;
    case "boss_outcome":
      return XP.bossOutcome[event.outcome];
    case "session_complete":
      return XP.sessionComplete;
  }
}
