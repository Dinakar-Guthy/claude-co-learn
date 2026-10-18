"use client";

import { useEffect } from "react";
import type { Verdict } from "@/lib/contracts/moment";
import { Markdown } from "./Markdown";
import { Pip } from "./Pip";
import { useSounds } from "./SoundProvider";
import { VerdictChip, XpChip } from "./ui";
import { pipMoodFor } from "./momentPhase";

export interface PredictionRevealProps {
  /** The learner's prediction (MomentView.answer). */
  prediction?: string;
  actualResult: string;
  verdict: Verdict;
  why: string;
  xp?: number;
  /** True when this just arrived from the stream (plays the verdict sound once). */
  live?: boolean;
}

/** "You predicted X · Actually Y" after the real code ran. */
export function PredictionReveal({ prediction, actualResult, verdict, why, xp = 0, live = false }: PredictionRevealProps) {
  const sounds = useSounds();
  useEffect(() => {
    if (live) sounds.playVerdict(verdict);
  }, [live, verdict, sounds]);

  return (
    <section aria-label="Prediction result" className="rounded-card bg-primary-soft p-5 shadow-soft sm:p-6">
      <p className="mb-3 text-xs font-bold tracking-wide text-primary uppercase">
        <span className="rounded-full bg-surface px-3 py-1">Prediction check</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-surface p-4">
          <p className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">You predicted</p>
          <p className="whitespace-pre-wrap">{prediction ?? "—"}</p>
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <p className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">What really happened</p>
          <Markdown>{actualResult}</Markdown>
        </div>
      </div>
      <div className="mt-4 flex items-start gap-4" aria-live={live ? "polite" : undefined}>
        <Pip mood={pipMoodFor(verdict)} className="hidden shrink-0 text-xs sm:block" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictChip verdict={verdict} />
            <XpChip amount={xp} />
          </div>
          <Markdown>{why}</Markdown>
        </div>
      </div>
    </section>
  );
}
