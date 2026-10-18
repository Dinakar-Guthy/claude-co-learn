"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import type { LevelInfo } from "@/lib/contracts/engine";

export interface XpGain {
  amount: number;
  /** Changes for every new gain (e.g. the moment id or a counter); a new id shows the chip. */
  id: string | number;
}

export interface XPBarProps {
  level: LevelInfo;
  gain?: XpGain;
  className?: string;
}

const CHIP_MS = 1800;

export function levelProgress(level: LevelInfo): number {
  const span = level.nextLevelXp - level.levelStartXp;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (level.xp - level.levelStartXp) / span));
}

/** Level badge + thin animated XP bar; a "+N XP" chip fades in and out on each gain. */
export function XPBar({ level, gain, className = "" }: XPBarProps) {
  const [shownId, setShownId] = useState<XpGain["id"] | undefined>(gain?.id);
  const [chip, setChip] = useState<number | null>(null);

  // A new gain id shows the chip (state adjusted during render, per React's guidance).
  if (gain && gain.id !== shownId) {
    setShownId(gain.id);
    setChip(gain.amount);
  }

  useEffect(() => {
    if (chip === null) return;
    const t = setTimeout(() => setChip(null), CHIP_MS);
    return () => clearTimeout(t);
  }, [chip, shownId]);

  const pct = levelProgress(level);
  const toNext = Math.max(0, level.nextLevelXp - level.xp);

  return (
    <div className={`relative flex items-center gap-2 ${className}`}>
      <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
        Lv {level.level}
      </span>
      <div
        role="progressbar"
        aria-label={`Level ${level.level} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-valuetext={`${toNext} XP to level ${level.level + 1}`}
        title={`${level.xp} XP · ${toNext} to level ${level.level + 1}`}
        className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        <m.div
          className="h-full origin-left rounded-full bg-accent"
          initial={false}
          animate={{ scaleX: pct }}
          style={{ scaleX: pct }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      <span aria-live="polite" className="pointer-events-none absolute top-full right-0 mt-1 z-10">
        <AnimatePresence>
          {chip !== null && (
            <m.span
              key={String(shownId)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="block rounded-full bg-surface px-2 py-0.5 text-xs font-bold whitespace-nowrap text-primary shadow-soft"
            >
              +{chip} XP
            </m.span>
          )}
        </AnimatePresence>
      </span>
    </div>
  );
}
