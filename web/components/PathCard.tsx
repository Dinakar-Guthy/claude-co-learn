"use client";

import { useState } from "react";
import type { LearningPath } from "@/lib/contracts/session";
import { focusRing } from "./ui";

const MARK = { done: "✓", current: "▶", todo: "" } as const;

/**
 * Learn mode's path (decision log 2026-10-18): the parts with done / now / next. Compact by default (one line,
 * so it doesn't compete with the lesson); expands to the full list.
 */
export function PathCard({ path, onMove, busy = false }: { path: LearningPath; onMove?: (from: number, to: number) => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = path.parts.findIndex((p) => p.status === "current");
  const done = path.parts.filter((p) => p.status === "done").length;
  const firstOpen = path.parts.findIndex((p) => p.status === "todo");
  const lastIndex = path.parts.length - 1;
  const summary =
    current === -1 ? `All ${path.parts.length} parts done` : `Part ${current + 1} of ${path.parts.length}: ${path.parts[current].title}`;
  return (
    <section aria-label="Your learning path" className="rounded-card border border-border bg-surface px-4 py-3 shadow-soft">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`flex w-full items-center gap-3 text-left ${focusRing}`}>
        <span className="text-xs font-bold tracking-widest text-muted uppercase">Your path</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{summary}</span>
        <span className="flex gap-1" aria-hidden="true">
          {path.parts.map((p, i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${p.status === "done" ? "bg-success" : p.status === "current" ? "bg-primary" : "bg-surface-2"}`} />
          ))}
        </span>
        <span className="sr-only">{done} of {path.parts.length} done</span>
        <span aria-hidden="true" className="text-xs text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ol className="mt-3 space-y-1.5 border-t border-border pt-3">
          <li className="text-xs font-semibold text-muted">{path.topic}{onMove && firstOpen !== -1 && " · reorder what's still to come; Claude follows your order"}</li>
          {path.parts.map((p, i) => (
            <li key={p.title} className={`flex gap-2 text-sm ${p.status === "done" ? "text-muted" : ""}`}>
              <span aria-hidden="true" className={`w-4 shrink-0 text-center ${p.status === "current" ? "text-primary" : "text-success"}`}>{MARK[p.status]}</span>
              <span className="w-5 shrink-0 text-muted">{i + 1}.</span>
              <span className="min-w-0">
                <span className={p.status === "current" ? "font-bold" : "font-semibold"}>{p.title}</span>
                {p.status === "current" && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">now</span>}
                <span className="block text-xs text-muted">{p.summary}</span>
              </span>
              {onMove && p.status === "todo" && (
                <span className="ml-auto flex shrink-0 items-start gap-1">
                  {i > firstOpen && (
                    <>
                      <MoveButton label={`Do “${p.title}” next`} disabled={busy} onClick={() => onMove(i, firstOpen)}>Next</MoveButton>
                      <MoveButton label={`Move “${p.title}” up`} disabled={busy} onClick={() => onMove(i, i - 1)}>↑</MoveButton>
                    </>
                  )}
                  {i < lastIndex && <MoveButton label={`Move “${p.title}” down`} disabled={busy} onClick={() => onMove(i, i + 1)}>↓</MoveButton>}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function MoveButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50 ${focusRing}`}>
      {children}
    </button>
  );
}
