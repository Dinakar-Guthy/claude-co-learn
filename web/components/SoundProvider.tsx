"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Verdict } from "@/lib/contracts/moment";
import {
  DEFAULT_SOUND_PACK,
  DEFAULT_VOLUME,
  SoundManager,
  type PlayOptions,
  type SoundEvent,
  type SoundPackId,
} from "@/lib/sound";

export interface SoundApi {
  play(event: SoundEvent, opts?: PlayOptions): void;
  /** correct → chime (rising with the streak), partial → softer chime, incorrect → gentle low note. */
  playVerdict(verdict: Verdict): void;
  /** Plays a sample of a pack (settings picker), ignoring the current pack. */
  preview(pack: SoundPackId, event?: SoundEvent): void;
}

const NOOP: SoundApi = { play() {}, playVerdict() {}, preview() {} };
const SoundContext = createContext<SoundApi>(NOOP);

export interface SoundProviderProps {
  enabled?: boolean;
  volume?: number;
  pack?: string;
  /** For tests: inject a manager with a fake AudioContext. */
  manager?: SoundManager;
  children: ReactNode;
}

/** Owns the single SoundManager; unlocks audio on the first pointer/key gesture. */
export function SoundProvider({ enabled = true, volume = DEFAULT_VOLUME, pack = DEFAULT_SOUND_PACK, manager: injected, children }: SoundProviderProps) {
  const [manager] = useState(() => injected ?? new SoundManager());

  useEffect(() => {
    manager.configure({ enabled, volume, pack });
  }, [manager, enabled, volume, pack]);

  useEffect(() => {
    if (manager.isUnlocked) return;
    const opts = { capture: true } as const;
    const onGesture = () => {
      manager.unlock();
      if (manager.isUnlocked) remove();
    };
    const remove = () => {
      window.removeEventListener("pointerdown", onGesture, opts);
      window.removeEventListener("keydown", onGesture, opts);
    };
    window.addEventListener("pointerdown", onGesture, opts);
    window.addEventListener("keydown", onGesture, opts);
    return remove;
  }, [manager]);

  const api = useMemo<SoundApi>(
    () => ({
      play: (event, opts) => void manager.play(event, opts),
      playVerdict: (verdict) => void manager.playVerdict(verdict),
      preview: (p, event = "correct") => void manager.play(event, { pack: p }),
    }),
    [manager],
  );

  return <SoundContext.Provider value={api}>{children}</SoundContext.Provider>;
}

/** Sound API; a silent no-op outside a SoundProvider. */
export function useSounds(): SoundApi {
  return useContext(SoundContext);
}
