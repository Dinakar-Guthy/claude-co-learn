"use client";

import type { PrimerView } from "@/lib/contracts/api";
import { Markdown } from "./Markdown";
import { Pip } from "./Pip";
import { VerdictChip, XpChip, focusRing } from "./ui";

const LETTERS = ["A", "B", "C", "D"];

export interface PrimerCardProps {
  primer: PrimerView;
  xp?: number;
  busy?: boolean;
  onAnswer: (choice: number) => void;
  onDismiss: () => void;
}

/** "New to this" primer: a few key ideas plus one warm-up check, shown while Claude starts on the work. */
export function PrimerCard({ primer, xp, busy = false, onAnswer, onDismiss }: PrimerCardProps) {
  const answered = primer.check.answered;
  return (
    <section aria-label="60-second primer" className="rounded-card border border-border bg-surface p-5 shadow-soft sm:p-6">
      <div className="mb-3 flex items-start gap-3">
        <Pip mood="happy" className="hidden shrink-0 text-xs sm:block" />
        <div className="flex-1">
          <p className="text-xs font-bold tracking-wide text-muted uppercase">60-second primer</p>
          <p className="font-semibold">While Claude gets started, here are the key ideas you&apos;re about to meet.</p>
        </div>
        <button type="button" onClick={onDismiss} className={`rounded-full px-2.5 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text ${focusRing}`}>
          {answered ? "Done" : "Skip"}
        </button>
      </div>

      <ul className="mb-4 space-y-2 text-sm">
        {primer.ideas.map((idea, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden="true" className="text-primary">◆</span>
            <div className="min-w-0 flex-1"><Markdown>{idea}</Markdown></div>
          </li>
        ))}
      </ul>

      <div className="space-y-3 rounded-2xl bg-primary-soft p-4">
        <p className="text-xs font-bold tracking-wide text-muted uppercase">Warm-up</p>
        <div className="font-semibold"><Markdown>{primer.check.question}</Markdown></div>
        <div role="group" aria-label="Warm-up options" className="grid gap-2">
          {primer.check.options.map((opt, i) => {
            const chosen = answered?.choice === i;
            const best = answered?.correctIndex === i;
            return (
              <button
                key={i}
                type="button"
                disabled={Boolean(answered) || busy}
                onClick={() => onAnswer(i)}
                className={`flex items-start gap-3 rounded-2xl border-2 bg-surface px-4 py-2.5 text-left text-sm transition ${focusRing} ${
                  answered ? (best ? "border-success" : chosen ? "border-primary" : "border-transparent opacity-70") : "border-border hover:border-primary"
                }`}
              >
                <span aria-hidden="true" className="font-bold text-primary">{LETTERS[i]}</span>
                <span className="flex-1"><Markdown>{opt}</Markdown></span>
                {answered && (chosen || best) && (
                  <span className={`shrink-0 text-xs font-bold ${best ? "text-success" : "text-primary"}`}>{[chosen && "Your pick", best && "Best answer"].filter(Boolean).join(" · ")}</span>
                )}
              </button>
            );
          })}
        </div>
        {answered && (
          <div className="space-y-2" aria-live="polite">
            <div className="flex items-center gap-2">
              <VerdictChip verdict={answered.correct ? "correct" : "incorrect"} />
              {xp ? <XpChip amount={xp} /> : null}
            </div>
            {answered.why && <Markdown>{answered.why}</Markdown>}
          </div>
        )}
      </div>
    </section>
  );
}
