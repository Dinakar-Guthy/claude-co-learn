/** XP per event (design-plan §12). XP is only ever added, never subtracted. */
import type { BossOutcome, XpEvent } from "@/lib/contracts/engine";
import type { Verdict } from "@/lib/contracts/moment";

export const XP = {
  answer: { correct: 10, correctAfterMC: 5, partial: 5, incorrect: 0 },
  /** After learner-requested help (Dinakar, 2026-10-18): less XP, but never zero for a right answer. */
  answerWithHelp: {
    hint: { correct: 8, correctAfterMC: 4, partial: 3 },
    teach: { correct: 5, correctAfterMC: 4, partial: 3 },
  },
  prediction: { correct: 10, partial: 5, incorrect: 0 } satisfies Record<Verdict, number>,
  bossHit: { full: 15, partial: 8 },
  // A retreat still pays: never punish. A skipped boss was the learner's choice not to play, so it pays nothing.
  bossOutcome: { flawless: 75, victory: 50, retreat: 20, skipped: 0 } satisfies Record<BossOutcome, number>,
  sessionComplete: 30,
} as const;

export function xpFor(event: XpEvent): number {
  switch (event.kind) {
    case "answer": {
      if (event.verdict === "incorrect") return XP.answer.incorrect;
      const table = event.help ? XP.answerWithHelp[event.help] : XP.answer;
      if (event.verdict === "partial") return table.partial;
      return event.afterMC ? table.correctAfterMC : table.correct;
    }
    case "prediction":
      return XP.prediction[event.verdict];
    case "boss_hit": {
      const base = event.partial ? XP.bossHit.partial : XP.bossHit.full;
      // Bosses only offer hints; a hinted hit is worth a bit less.
      return event.help ? Math.round(base * 0.8) : base;
    }
    case "boss_outcome":
      return XP.bossOutcome[event.outcome];
    case "session_complete":
      return XP.sessionComplete;
  }
}
