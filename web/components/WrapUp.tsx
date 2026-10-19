"use client";

import { useState } from "react";

import type { WrapUpResponse } from "@/lib/contracts/api";
import type { MomentView } from "@/lib/contracts/moment";
import type { Reading } from "@/lib/contracts/session";
import type { XpAward } from "@/lib/contracts/stream";
import { hostOf } from "@/lib/sources";
import type { HelpBusy } from "./MomentHelp";
import { MomentCard, momentHandlers, type MomentAction } from "./MomentCard";
import { StoryChapterCard } from "./StoryChapterCard";
import { levelProgress } from "./XPBar";
import { Button, Card, Chip } from "./ui";

type CodexResult = WrapUpResponse["codex"][number]["result"];

const CODEX_CHIP: Record<CodexResult, { label: string; className: string }> = {
  strong: { label: "Strong", className: "text-success" },
  growing: { label: "Growing", className: "text-primary" },
  review: { label: "Review next time", className: "text-muted" },
};

export interface WrapUpProps {
  data: WrapUpResponse;
  /** Deferred moments as they update (keyed by id); falls back to data.deferred. */
  moments?: Record<string, MomentView>;
  gradingMomentId?: string;
  helpBusy?: Record<string, HelpBusy | undefined>;
  xpByMoment?: Record<string, XpAward>;
  onMomentAction: (momentId: string, action: MomentAction) => void;
  /** Story chapter still generating. */
  chapterLoading?: boolean;
  onTryTheme?: (themeId: string) => void;
  onSuggestion: (text: string) => void;
  onNewSession: () => void;
  /** Scrolls back to where a saved question came up in the session. */
  onShowContext?: (momentId: string) => void;
  /** "Did you learn something?" thumbs; omit to hide. */
  onFeedback?: (helpful: boolean) => void;
  /** "Learn more" further reading (fetched after the wrap-up); omit to hide. */
  reading?: { loading: boolean; items: Reading[] };
}

/** End-of-session sequence: deferred quiz → Codex → XP → story → learn more → suggestions → new session. */
export function WrapUp({ data, moments, gradingMomentId, helpBusy, xpByMoment, onMomentAction, chapterLoading = false, onTryTheme, onSuggestion, onNewSession, onShowContext, onFeedback, reading }: WrapUpProps) {
  const { level } = data.user;
  const rewards = data.levelUps.flatMap((l) => l.rewards);
  const pct = Math.round(levelProgress(level) * 100);

  return (
    <div className="space-y-5">
      <h2 className="text-center text-2xl font-extrabold">Session wrap-up</h2>

      {data.deferred.length > 0 && (
        <div className="space-y-3">
          <h3 className="px-1 text-sm font-bold text-muted">Quick quiz: the questions you saved for later</h3>
          {data.deferred.map((d) => {
            const m = moments?.[d.id] ?? d;
            // Saved questions reopen here for answering.
            const view: MomentView = m.status === "deferred" ? { ...m, status: "awaiting_answer" } : m;
            return (
              <div key={d.id} className="space-y-1">
              <MomentCard
                moment={view}
                grading={gradingMomentId === d.id}
                helpBusy={helpBusy?.[d.id]}
                xp={xpByMoment?.[d.id]}
                canDefer={false}
                {...momentHandlers((a) => onMomentAction(d.id, a))}
              />
              {onShowContext && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onShowContext(d.id)}
                    className="rounded-full px-2.5 py-1 text-sm text-muted transition hover:bg-surface hover:text-text"
                  >
                    See where this came up ↑
                  </button>
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}

      {data.codex.length > 0 && (
        <Card aria-label="Codex">
          <h3 className="mb-3 text-lg font-extrabold">Codex</h3>
          <ul className="space-y-3">
            {data.codex.map((c) => (
              <li key={c.concept} className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{c.concept}</p>
                  <p className="text-sm text-muted">{c.summary}</p>
                </div>
                <span className={`shrink-0 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-bold ${CODEX_CHIP[c.result].className}`}>
                  {CODEX_CHIP[c.result].label}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card aria-label="XP summary">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-muted uppercase">This session</p>
            <p className="text-3xl font-extrabold text-primary">+{data.sessionXp} XP</p>
          </div>
          <p className="text-sm text-muted">Level {level.level} · {level.xp} XP total</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">{Math.max(0, level.nextLevelXp - level.xp)} XP to level {level.level + 1}</p>
        {rewards.length > 0 && (
          <ul className="mt-4 space-y-2">
            {rewards.map((r) => (
              <li key={`${r.kind}:${r.id}`} className="flex items-center gap-3 rounded-2xl bg-primary-soft px-4 py-2.5">
                <span className="flex-1 text-sm font-semibold">Unlocked at level {r.level}: {r.label}</span>
                {r.kind === "theme" && onTryTheme && <Button size="sm" variant="primary" onClick={() => onTryTheme(r.id)}>Try it</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(data.chapter || chapterLoading) && <StoryChapterCard chapter={data.chapter} loading={chapterLoading && !data.chapter} live />}

      {reading && (reading.loading || reading.items.length > 0) && <LearnMore {...reading} />}

      {data.suggestions.length > 0 && (
        <Card aria-label="Next time">
          <h3 className="mb-3 text-lg font-extrabold">Next time you could…</h3>
          <div className="flex flex-wrap gap-2">
            {data.suggestions.map((s) => (
              <Chip key={s} onClick={() => onSuggestion(s)} className="text-left">{s}</Chip>
            ))}
          </div>
        </Card>
      )}

      {onFeedback && <LearnedFeedback onFeedback={onFeedback} />}

      <div className="flex justify-center pt-2">
        <Button variant="primary" onClick={onNewSession}>Start a new session</Button>
      </div>
    </div>
  );
}

/** Further reading for the learner's own reference: real pages from web search, never links written from memory. */
function LearnMore({ loading, items }: { loading: boolean; items: Reading[] }) {
  return (
    <Card aria-label="Learn more" aria-busy={loading || undefined}>
      <h3 className="text-lg font-extrabold">Learn more</h3>
      <p className="mb-3 text-sm text-muted">Further reading on what you practised, to keep for reference.</p>
      {loading ? (
        <p role="status" className="text-sm text-muted motion-safe:animate-pulse">Finding good reading for you…</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
                {r.title}
              </a>
              <span className="ml-1.5 text-xs text-muted">{hostOf(r.url)}</span>
              <p className="text-sm text-muted">{r.why}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LearnedFeedback({ onFeedback }: { onFeedback: (helpful: boolean) => void }) {
  const [vote, setVote] = useState<boolean | null>(null);
  const pick = (helpful: boolean) => {
    setVote(helpful);
    onFeedback(helpful);
  };
  return (
    <div className="flex flex-col items-center gap-2 text-center" aria-live="polite">
      {vote === null ? (
        <>
          <p className="font-semibold">Did you learn something this session?</p>
          <div className="flex gap-2">
            <Chip onClick={() => pick(true)} aria-label="Yes, I learned something">👍 Yes</Chip>
            <Chip onClick={() => pick(false)} aria-label="Not really">👎 Not really</Chip>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">{vote ? "Glad to hear it. Thanks for telling us!" : "Thanks for the honesty. It helps us tune Co-learn."}</p>
      )}
    </div>
  );
}
