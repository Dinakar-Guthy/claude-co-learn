"use client";

import { useEffect } from "react";
import { m } from "motion/react";
import type { LevelReward } from "@/lib/contracts/engine";
import { celebrate } from "@/lib/ui/celebrate";
import { useSounds } from "./SoundProvider";
import { Button, focusRing } from "./ui";

export interface LevelUpToastProps {
  from: number;
  to: number;
  rewards: LevelReward[];
  /** "Try it" on a theme reward. */
  onTryTheme?: (themeId: string) => void;
  /** "Try it" on a sound-pack reward. */
  onTrySoundPack?: (packId: string) => void;
  onDismiss: () => void;
}

/** Bottom toast with the level-up jingle and confetti (once per level). Render it only for fresh level-ups. */
export function LevelUpToast({ from, to, rewards, onTryTheme, onTrySoundPack, onDismiss }: LevelUpToastProps) {
  const sounds = useSounds();
  useEffect(() => {
    sounds.play("levelUp");
    void celebrate(`levelup:${to}`, "levelUp");
  }, [to, sounds]);

  return (
    <m.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="fixed inset-x-0 bottom-6 z-50 mx-auto w-[min(26rem,calc(100%-2rem))] rounded-card border border-border bg-surface p-5 shadow-soft"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-xs font-bold tracking-widest text-muted uppercase">Level up</p>
          <p className="text-2xl font-extrabold">
            Level {to}!
            {to - from > 1 && <span className="ml-2 text-base font-semibold text-muted">(from {from})</span>}
          </p>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className={`rounded-full p-1 text-muted hover:text-text ${focusRing}`}>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="m4 4 8 8m0-8-8 8" />
          </svg>
        </button>
      </div>
      {rewards.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rewards.map((r) => {
            const tryIt = r.kind === "theme" ? onTryTheme : onTrySoundPack;
            return (
              <li key={`${r.kind}:${r.id}`} className="flex items-center gap-3 rounded-2xl bg-primary-soft px-4 py-2.5">
                <span className="flex-1 font-semibold">
                  {r.kind === "theme" ? "New theme" : "New sound pack"}: {r.label.replace(/ (theme|sound pack)$/i, "")}
                </span>
                {tryIt && <Button size="sm" variant="primary" onClick={() => tryIt(r.id)}>Try it</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </m.div>
  );
}
