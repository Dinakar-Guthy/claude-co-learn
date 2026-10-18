"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import type { GuardrailMode, UserSettings } from "@/lib/contracts/engine";
import type { SessionSummary } from "@/lib/contracts/session";
import { THEMES, isUnlocked } from "@/lib/themes";
import { SOUND_PACKS, isSoundPackUnlocked, type SoundPackId } from "@/lib/sound";
import { useSounds } from "./SoundProvider";
import { Button, PadlockIcon, focusRing } from "./ui";

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: UserSettings;
  level: number;
  unlocks: { themes: string[]; soundPacks: string[] };
  /** Partial settings patch (PATCH /api/user). Apply the theme via UiProviders/applyTheme. */
  onChange: (patch: Partial<UserSettings>) => void;
  sessions?: SessionSummary[];
  currentSessionId?: string;
  onOpenSession?: (sessionId: string) => void;
  onResetData?: () => void;
}

export const GUARDRAIL_MODES: { id: GuardrailMode; label: string; description: string }[] = [
  { id: "light", label: "Light", description: "A short breather between learning moments." },
  { id: "balanced", label: "Balanced", description: "A few moments every 10 minutes, spaced out." },
  { id: "strict", label: "Strict", description: "Strict = fewest interruptions; extra questions wait for the wrap-up quiz." },
];

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Slide-over settings panel opened from the gear. Esc or the backdrop closes it; focus stays inside. */
export function SettingsDrawer(props: SettingsDrawerProps) {
  const { open, onClose } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <m.div
            className="absolute inset-0 bg-text/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <m.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col overflow-y-auto bg-background shadow-soft"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 id={titleId} className="text-lg font-extrabold">Settings</h2>
              <button type="button" onClick={onClose} aria-label="Close settings" className={`rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text ${focusRing}`}>
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="m4 4 8 8m0-8-8 8" />
                </svg>
              </button>
            </div>
            <SettingsBody {...props} />
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border px-5 py-5 last:border-b-0">
      <h3 className="text-xs font-bold tracking-widest text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl px-1 py-1 text-left ${focusRing}`}
    >
      <span className="font-semibold">{label}</span>
      <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-primary" : "bg-surface-2 ring-1 ring-border"}`}>
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface shadow-soft transition-transform ${checked ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

function SettingsBody({ settings, level, unlocks, onChange, sessions = [], currentSessionId, onOpenSession, onResetData }: SettingsDrawerProps) {
  const sounds = useSounds();
  const volumeId = useId();
  const [confirmReset, setConfirmReset] = useState(false);
  const mode = GUARDRAIL_MODES.find((g) => g.id === settings.guardrails.mode) ?? GUARDRAIL_MODES[1];

  return (
    <div className="flex-1">
      <Section title="Sound">
        <Switch label="Sounds" checked={settings.sound} onChange={(sound) => onChange({ sound })} />
        <div className="flex items-center gap-3">
          <label htmlFor={volumeId} className="w-16 text-sm text-muted">Volume</label>
          <input
            id={volumeId}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            disabled={!settings.sound}
            onChange={(e) => onChange({ volume: Number(e.target.value) })}
            onPointerUp={() => sounds.play("correct")}
            className="flex-1 accent-primary disabled:opacity-50"
          />
        </div>
        <div role="group" aria-label="Sound pack" className="grid grid-cols-2 gap-2">
          {SOUND_PACKS.map((p) => {
            const unlocked = isSoundPackUnlocked(p.id, unlocks.soundPacks, level);
            const selected = settings.soundPack === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={selected}
                disabled={!unlocked}
                onClick={() => { onChange({ soundPack: p.id }); sounds.preview(p.id as SoundPackId); }}
                className={`rounded-2xl border-2 bg-surface px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed ${focusRing} ${
                  selected ? "border-primary" : "border-transparent hover:border-border"
                } ${unlocked ? "" : "opacity-60 grayscale"}`}
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  {!unlocked && <PadlockIcon />}
                  {p.label}
                </span>
                <span className="block text-xs text-muted">{unlocked ? p.description : `Reach level ${p.unlockLevel}`}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Learning guardrails">
        <Switch
          label="Limit learning moments"
          checked={settings.guardrails.enabled}
          onChange={(enabled) => onChange({ guardrails: { ...settings.guardrails, enabled } })}
        />
        <p className="text-sm text-muted">
          {settings.guardrails.enabled ? mode.description : "Off: Claude asks whenever a great learning moment comes up."}
        </p>
        {settings.guardrails.enabled && (
          <div role="group" aria-label="Guardrail strength" className="grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1">
            {GUARDRAIL_MODES.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={settings.guardrails.mode === g.id}
                onClick={() => onChange({ guardrails: { enabled: true, mode: g.id } })}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${focusRing} ${
                  settings.guardrails.mode === g.id ? "bg-surface text-text shadow-soft" : "text-muted hover:text-text"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Boss challenges">
        <Switch label="Offer boss challenges" checked={settings.bosses !== false} onChange={(bosses) => onChange({ bosses })} />
        <p className="text-sm text-muted">
          {settings.bosses !== false
            ? "At milestones, you're offered a short boss challenge that mixes what you've learned. You can always say \"Keep working\"."
            : "Off: no boss challenges. Just the work and the learning moments."}
        </p>
      </Section>

      <Section title="Theme">
        <div role="group" aria-label="Theme" className="grid grid-cols-4 gap-3">
          {THEMES.map((t) => {
            const unlocked = isUnlocked(t.id, unlocks.themes, level);
            const selected = settings.theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected}
                disabled={!unlocked}
                title={unlocked ? t.label : `${t.label}: reach level ${t.unlockLevel}`}
                onClick={() => onChange({ theme: t.id })}
                className={`flex flex-col items-center gap-1 rounded-2xl p-1.5 text-xs disabled:cursor-not-allowed ${focusRing} ${selected ? "bg-surface shadow-soft" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className={`relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 ${selected ? "border-primary" : "border-border"} ${unlocked ? "" : "grayscale opacity-50"}`}
                  style={{ background: `conic-gradient(${t.swatch[1]} 0 33%, ${t.swatch[2]} 0 66%, ${t.swatch[0]} 0)` }}
                />
                <span className={`flex items-center gap-1 ${unlocked ? "font-semibold" : "text-muted"}`}>
                  {!unlocked && <PadlockIcon className="h-3 w-3" />}
                  {t.label}
                </span>
                {!unlocked && <span className="text-[0.65rem] leading-tight text-muted">Reach level {t.unlockLevel}</span>}
              </button>
            );
          })}
        </div>
      </Section>

      {sessions.length > 0 && (
        <Section title="Past sessions">
          <ul className="space-y-1">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={s.id === currentSessionId || !onOpenSession}
                  onClick={() => onOpenSession?.(s.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:hover:bg-transparent ${focusRing}`}
                >
                  <span className="truncate font-semibold">{s.title}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {s.id === currentSessionId ? "Current" : s.status === "wrapped" ? "Review" : "Continue"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {onResetData && (
        <Section title="Your data">
          {confirmReset ? (
            <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
              <p className="text-sm">This clears your XP, unlocks, and past sessions on this browser. Are you sure?</p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => { setConfirmReset(false); onResetData(); }}>Yes, reset</Button>
                <Button size="sm" onClick={() => setConfirmReset(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => setConfirmReset(true)}>Reset my data</Button>
          )}
        </Section>
      )}
    </div>
  );
}
