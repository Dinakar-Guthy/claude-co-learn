"use client";

import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { MomentView } from "@/lib/contracts/moment";
import { Markdown } from "./Markdown";
import { Spinner, focusRing } from "./ui";

export type HelpBusy = "hint" | "teach" | "ask";
export const MAX_HINTS = 2;

/** Low-emphasis action for the secondary row (hint, options, skip, later): Submit stays the one strong button. */
export function QuietAction({ className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-full px-2.5 py-1 text-sm text-muted transition hover:bg-surface hover:text-text disabled:cursor-not-allowed disabled:opacity-50 ${focusRing} ${className}`}
      {...rest}
    />
  );
}

/** Hints shown so far, above the answer box. */
export function HintList({ hints, loading }: { hints: string[]; loading: boolean }) {
  if (!hints.length && !loading) return null;
  return (
    <ol className="space-y-2" aria-label="Hints" aria-live="polite">
      {hints.map((h, i) => (
        <li key={i} className="flex gap-2 rounded-2xl bg-surface/70 px-4 py-2.5 text-sm">
          <span aria-hidden="true" className="shrink-0">💡</span>
          <span><span className="font-bold text-muted">Hint {i + 1}: </span>{h}</span>
        </li>
      ))}
      {loading && (
        <li className="flex items-center gap-2 px-4 py-1 text-sm text-muted">
          <Spinner label="Thinking of a hint" /> Thinking of a hint…
        </li>
      )}
    </ol>
  );
}

export interface HelpPanelProps {
  moment: MomentView;
  /** "Teach me" is offered only while the question is still open. */
  canTeach: boolean;
  busy?: HelpBusy;
  onTeach: () => void;
  onAsk: (text: string) => void;
  onClose: () => void;
}

/** "Help me learn this": a short lesson plus a small Ask Claude thread, inside the card. */
export function HelpPanel({ moment, canTeach, busy, onTeach, onAsk, onClose }: HelpPanelProps) {
  const lesson = moment.help?.lesson;
  const thread = moment.help?.thread ?? [];
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    onAsk(text);
    setDraft("");
  };

  return (
    <section aria-label="Help me learn this" className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs font-bold tracking-wide text-muted uppercase">Learn it with Claude</p>
        <QuietAction onClick={onClose} aria-label="Close help">Close</QuietAction>
      </div>

      {lesson ? (
        <div className="text-sm"><Markdown>{lesson}</Markdown></div>
      ) : canTeach ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onTeach}
            disabled={Boolean(busy)}
            className={`rounded-full bg-primary-soft px-4 py-2 text-sm font-semibold text-text transition hover:brightness-95 disabled:opacity-50 ${focusRing}`}
          >
            Teach me the idea first
          </button>
          {busy === "teach" ? (
            <span className="inline-flex items-center gap-2 text-sm text-muted"><Spinner label="Writing a short lesson" /> Writing a short lesson…</span>
          ) : (
            <span className="text-sm text-muted">A short lesson with a worked example, then you answer.</span>
          )}
        </div>
      ) : null}

      {thread.length > 0 && (
        <ul className="space-y-2" aria-label="Your questions to Claude" aria-live="polite">
          {thread.map((t, i) =>
            t.role === "learner" ? (
              <li key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap">
                <span className="sr-only">You: </span>{t.text}
              </li>
            ) : (
              <li key={i} className="text-sm"><span className="sr-only">Claude: </span><Markdown>{t.text}</Markdown></li>
            ),
          )}
        </ul>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2">
        <label htmlFor={inputId} className="sr-only">Ask Claude about this question</label>
        <input
          id={inputId}
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={thread.length ? "Ask a follow-up…" : "Ask Claude anything about this question…"}
          className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none placeholder:text-muted focus:border-primary"
        />
        <button
          type="submit"
          disabled={!draft.trim() || Boolean(busy)}
          className={`rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 ${focusRing}`}
        >
          Ask
        </button>
      </form>
      {busy === "ask" && (
        <p className="inline-flex items-center gap-2 text-sm text-muted"><Spinner label="Claude is thinking" /> Claude is thinking…</p>
      )}
    </section>
  );
}

/** Collapsible "See the answer" (after Skip) or the revealed answer. */
export function AnswerReveal({ text, collapsible = true, children }: { text: string; collapsible?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(!collapsible);
  if (!open) {
    return (
      <QuietAction onClick={() => setOpen(true)} className="text-primary">See the answer</QuietAction>
    );
  }
  return (
    <div className="rounded-2xl bg-surface/70 px-4 py-3 text-sm">
      <p className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">The answer</p>
      <Markdown>{text}</Markdown>
      {children}
    </div>
  );
}
