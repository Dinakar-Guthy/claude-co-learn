"use client";

import { useEffect, useRef, useState } from "react";
import { m } from "motion/react";
import type { BossView } from "@/lib/contracts/api";
import type { BossOutcome } from "@/lib/contracts/engine";
import type { MomentView } from "@/lib/contracts/moment";
import type { XpAward } from "@/lib/contracts/stream";
import { celebrate } from "@/lib/ui/celebrate";
import { AsciiBoss, type BossFrame } from "./AsciiBoss";
import type { HelpBusy } from "./MomentHelp";
import { MomentCard, type MomentHandlers } from "./MomentCard";
import { useSounds } from "./SoundProvider";
import { Button, focusRing } from "./ui";

export interface BossCardProps {
  boss: BossView;
  /** The current question (boss.currentMomentId), or the last answered one while the next loads. */
  moment?: MomentView;
  grading?: boolean;
  xp?: XpAward;
  momentHandlers: MomentHandlers;
  /** Which help request is in flight for the shown question (bosses offer hints only). */
  helpBusy?: HelpBusy;
  /** "Skip this boss": shown while the fight is on. */
  onSkip?: () => void;
  /** Shown with the outcome banner (e.g. reveal the story chapter / continue the work). */
  onContinue?: () => void;
  continueLabel?: string;
}

const HIT_MS = 700;

export function outcomeCopy(outcome: BossOutcome, name: string): { title: string; detail: string } {
  switch (outcome) {
    case "flawless":
      return { title: "Flawless!", detail: `${name} is defeated without a scratch.` };
    case "victory":
      return { title: "Victory!", detail: `${name} is defeated.` };
    case "retreat":
      return { title: `${name} retreats… it'll be back.`, detail: "These concepts will come back for a quick review." };
    case "skipped":
      return { title: `You let ${name} go. It'll be back another time.`, detail: "Back to your work. These concepts will come back for a quick review." };
  }
}

const fmtHp = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function BossCard({ boss, moment, grading = false, xp, momentHandlers, onContinue, continueLabel = "Continue", helpBusy, onSkip }: BossCardProps) {
  const sounds = useSounds();
  const [prevHp, setPrevHp] = useState(boss.hp);
  const [hits, setHits] = useState(0);
  const [hitting, setHitting] = useState(false);

  // Detect HP drops during render (React's "adjust state on prop change" pattern).
  if (boss.hp !== prevHp) {
    setPrevHp(boss.hp);
    if (boss.hp < prevHp) {
      setHits((h) => h + 1);
      setHitting(true);
    }
  }

  const outcome = boss.outcome;
  useEffect(() => {
    if (!hitting) return;
    if (!outcome) sounds.play("bossHit");
    const t = setTimeout(() => setHitting(false), HIT_MS);
    return () => clearTimeout(t);
    // `hits` restarts the hit animation for back-to-back hits.
  }, [hitting, hits, outcome, sounds]);

  const lastOutcome = useRef(outcome);
  useEffect(() => {
    if (outcome && outcome !== lastOutcome.current) {
      if (outcome === "retreat") sounds.play("reveal");
      else {
        sounds.play("bossVictory");
        void celebrate(`boss:${boss.id}`, "bossVictory");
      }
    }
    lastOutcome.current = outcome;
  }, [outcome, boss.id, sounds]);

  const defeated = outcome === "flawless" || outcome === "victory";
  const frame: BossFrame = defeated ? "defeated" : hitting ? "hit" : "full";
  const pct = boss.maxHp > 0 ? Math.max(0, boss.hp) / boss.maxHp : 0;
  const qIndex = moment ? boss.momentIds.indexOf(moment.id) : -1;

  return (
    <section aria-label={`Boss: ${boss.name}`} className="rounded-card border border-border bg-surface p-5 shadow-soft sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <m.div
          animate={hitting ? { x: [0, -2, 2, -2, 2, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className={`w-36 shrink-0 self-center transition-opacity ${outcome === "retreat" ? "opacity-40" : ""}`}
        >
          <AsciiBoss kind={boss.ascii} frame={frame} />
        </m.div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs font-bold tracking-wide text-muted uppercase">Boss</p>
            {onSkip && !outcome && (
              <button type="button" onClick={onSkip} className={`rounded-full px-2.5 py-1 text-sm text-muted transition hover:bg-surface-2 hover:text-text ${focusRing}`}>
                Skip this boss
              </button>
            )}
          </div>
          <h3 className="text-xl font-extrabold">{boss.name}</h3>
          <p className="text-muted">{boss.intro}</p>
          <div className="flex items-center gap-3 pt-1">
            <div
              role="progressbar"
              aria-label={`${boss.name} HP`}
              aria-valuemin={0}
              aria-valuemax={boss.maxHp}
              aria-valuenow={boss.hp}
              className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2"
            >
              <m.div
                className="h-full origin-left rounded-full bg-primary"
                initial={false}
                animate={{ scaleX: pct }}
                style={{ scaleX: pct }}
                transition={{ type: "spring", stiffness: 140, damping: 20 }}
              />
            </div>
            <span className="font-mono text-xs text-muted tabular-nums">
              HP {fmtHp(Math.max(0, boss.hp))}/{fmtHp(boss.maxHp)}
            </span>
          </div>
        </div>
      </div>

      {moment && (
        <div className="mt-5 space-y-2">
          {qIndex >= 0 && boss.momentIds.length > 1 && (
            <p className="text-xs font-semibold text-muted">Question {qIndex + 1} of {boss.momentIds.length}</p>
          )}
          <MomentCard key={moment.id} moment={moment} grading={grading} xp={xp} canDefer={false} helpMode="hints" helpBusy={helpBusy} {...momentHandlers} />
        </div>
      )}

      <div aria-live="polite">
        {outcome && (
          <div className="mt-5 flex flex-col items-start gap-3 rounded-2xl bg-primary-soft p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-lg font-extrabold">{outcomeCopy(outcome, boss.name).title}</p>
              <p className="text-muted">{outcomeCopy(outcome, boss.name).detail}</p>
            </div>
            {onContinue && <Button variant="primary" onClick={onContinue}>{continueLabel}</Button>}
          </div>
        )}
      </div>
    </section>
  );
}
