"use client";

import Link from "next/link";
import type { LevelInfo } from "@/lib/contracts/engine";
import { useNow } from "@/lib/ui/useNow";
import { XPBar, type XpGain } from "./XPBar";
import { focusRing } from "./ui";

export interface TopBarProps {
  title?: string;
  level: LevelInfo;
  xpGain?: XpGain;
  /** Epoch ms the session is planned to end (SessionView.endsAt). */
  endsAt?: number;
  muted: boolean;
  onToggleMute: () => void;
  onOpenSettings: () => void;
  /** Link to the cross-session Codex (e.g. `/codex?from=/s/<id>`). The book button is hidden when omitted. */
  codexHref?: string;
  /** Learn mode shows a small badge next to the brand. */
  learn?: boolean;
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Quiet countdown; no alarm. When time's up the parent offers wrap-up. */
export function SessionTimer({ endsAt }: { endsAt: number }) {
  const now = useNow();
  if (now === null) return <span className="w-12" />;
  const left = endsAt - now;
  return (
    <span className="font-mono text-xs text-muted tabular-nums" title="Time left in this session" aria-label={left > 0 ? `${formatRemaining(left)} left` : "Session time is up"}>
      {left > 0 ? formatRemaining(left) : "time's up"}
    </span>
  );
}

const iconBtn = `flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text ${focusRing}`;

export function TopBar({ title, level, xpGain, endsAt, muted, onToggleMute, onOpenSettings, codexHref, learn = false }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="font-extrabold tracking-tight text-primary">co-learn</span>
          {learn && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">Learn</span>}
          {title && (
            <>
              <span aria-hidden="true" className="text-muted">·</span>
              <span className="truncate text-sm text-muted">{title}</span>
            </>
          )}
        </div>
        <XPBar level={level} gain={xpGain} className="w-28 sm:w-44" />
        {endsAt !== undefined && <SessionTimer endsAt={endsAt} />}
        <button type="button" onClick={onToggleMute} aria-pressed={muted} aria-label={muted ? "Unmute sounds" : "Mute sounds"} className={iconBtn}>
          {muted ? <SpeakerOffIcon /> : <SpeakerIcon />}
        </button>
        {codexHref && (
          <Link href={codexHref} aria-label="Codex" title="Codex" className={iconBtn}>
            <BookIcon />
          </Link>
        )}
        <button type="button" onClick={onOpenSettings} aria-label="Settings" aria-haspopup="dialog" className={iconBtn}>
          <GearIcon />
        </button>
      </div>
    </header>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8v4h3l4 3.5v-11L6.5 8h-3Z" />
      <path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.5 6.5 0 0 1 0 9" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8v4h3l4 3.5v-11L6.5 8h-3Z" />
      <path d="m13.5 8 4 4m0-4-4 4" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {/* Open book: two pages meeting at the spine */}
      <path d="M12 6.5C10.3 5.2 7.9 4.6 4 4.75v13c3.9-.15 6.3.45 8 1.75 1.7-1.3 4.1-1.9 8-1.75v-13c-3.9-.15-6.3.45-8 1.75Z" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {/* Cog: 8 rounded teeth around a ring */}
      <path d="M10.3 3.5h3.4l.5 2.3 1.6.9 2.2-.8 1.7 2.9-1.7 1.6v1.9l1.7 1.6-1.7 2.9-2.2-.8-1.6.9-.5 2.3h-3.4l-.5-2.3-1.6-.9-2.2.8-1.7-2.9 1.7-1.6v-1.9L4.3 8.8 6 5.9l2.2.8 1.6-.9.5-2.3Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
