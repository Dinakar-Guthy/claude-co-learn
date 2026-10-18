"use client";

import { useEffect, useState } from "react";
import { onApiWarning } from "@/lib/client/api";
import { focusRing } from "./ui";

/** Dismissible owner-facing banner when usage limits fail open (X-Colearn-Warning). */
export function LimitsBanner() {
  const [warning, setWarning] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => onApiWarning(setWarning), []);
  if (!warning || warning === dismissed) return null;
  return (
    <div role="status" className="border-b border-border bg-surface-2">
      <div className="mx-auto flex max-w-[720px] items-start gap-3 px-4 py-2 text-sm text-muted">
        <p className="flex-1">{warning}</p>
        <button type="button" onClick={() => setDismissed(warning)} className={`rounded font-semibold text-text hover:underline ${focusRing}`}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
