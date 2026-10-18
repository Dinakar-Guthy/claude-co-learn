"use client";

import type { ReactNode } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { SoundProvider } from "./SoundProvider";
import { useApplyTheme } from "@/lib/ui/useApplyTheme";

export interface UiProvidersProps {
  sound?: { enabled: boolean; volume: number; pack: string };
  /** Theme id to apply to <html data-theme>. */
  theme?: string;
  children: ReactNode;
}

/**
 * Wrap the app (or the workspace) once: Motion with reduced-motion support, sounds, and the active theme.
 * Components use `m.*` from motion/react, so animations need this LazyMotion parent.
 */
export function UiProviders({ sound, theme, children }: UiProvidersProps) {
  useApplyTheme(theme);
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <SoundProvider enabled={sound?.enabled} volume={sound?.volume} pack={sound?.pack}>
          {children}
        </SoundProvider>
      </MotionConfig>
    </LazyMotion>
  );
}
