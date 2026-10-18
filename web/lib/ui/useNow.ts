"use client";

import { useSyncExternalStore } from "react";

/** Current time in ms, ticking every `intervalMs`. Returns null during SSR/hydration to avoid mismatches. */
export function useNow(intervalMs = 1000): number | null {
  return useSyncExternalStore(
    (notify) => {
      const id = setInterval(notify, intervalMs);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => null,
  );
}
