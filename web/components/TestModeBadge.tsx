"use client";

import { useSyncExternalStore } from "react";
import { isTestTab } from "@/lib/client/testMode";

const subscribe = () => () => {};

/** A small, always-visible reminder that this tab's activity is tagged as test traffic. */
export function TestModeBadge() {
  const on = useSyncExternalStore(subscribe, isTestTab, () => false);
  if (!on) return null;
  return (
    <div role="status" className="pointer-events-none fixed bottom-3 left-3 z-50 rounded-full bg-text px-3 py-1 text-xs font-bold text-background opacity-80">
      Test traffic (this tab)
    </div>
  );
}
