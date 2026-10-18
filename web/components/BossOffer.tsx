"use client";

import { AsciiBoss } from "./AsciiBoss";
import { Button } from "./ui";

/** Shown when a boss is due: the learner chooses before anything is generated (Dinakar, 2026-10-18). */
export function BossOffer({ onTake, onDecline, busy = false }: { onTake: () => void; onDecline: () => void; busy?: boolean }) {
  return (
    <section aria-label="Boss challenge offer" className="flex flex-col items-center gap-4 rounded-card border border-border bg-surface p-5 text-center shadow-soft sm:flex-row sm:text-left">
      <AsciiBoss kind="bug" frame="full" className="shrink-0 text-xs" />
      <div className="flex-1 space-y-1">
        <p className="text-lg font-extrabold">A boss approaches!</p>
        <p className="text-sm text-muted">A short challenge (about 2 minutes) mixing what you&apos;ve learned so far. Win a story chapter and bonus XP, or keep working and meet it at a later milestone.</p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onTake} disabled={busy}>Take it on</Button>
        <Button onClick={onDecline} disabled={busy}>Keep working</Button>
      </div>
    </section>
  );
}
