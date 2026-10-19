"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { MomentView, Verdict } from "@/lib/contracts/moment";
import type { XpAward } from "@/lib/contracts/stream";
import { Markdown } from "./Markdown";
import { Pip } from "./Pip";
import { useSounds } from "./SoundProvider";
import { Button, Spinner, VERDICT_LABEL, VerdictChip, XpChip, focusRing } from "./ui";
import { feedbackKey, momentPhase, momentTypeLabel, pipMoodFor, type MomentPhase } from "./momentPhase";
import type { SessionMode } from "@/lib/modes";
import { AnswerReveal, HelpPanel, HintList, MAX_HINTS, QuietAction, type HelpBusy } from "./MomentHelp";

export interface MomentHandlers {
  onSubmit: (answer: string) => void;
  onShowOptions: () => void;
  onChooseOption: (index: number) => void;
  onSkip: () => void;
  onDefer: () => void;
  onReport: () => void;
  onHint: () => void;
  onTeach: () => void;
  onAsk: (text: string) => void;
}

/** Mirrors GradeRequest["action"], so P2 can route every card action through one function. */
export type MomentAction =
  | { kind: "submit"; answer: string }
  | { kind: "mc"; choice: number }
  | { kind: "show_options" }
  | { kind: "skip" }
  | { kind: "defer" }
  | { kind: "report" }
  // Learner-requested help (POST /api/moment/help)
  | { kind: "hint" }
  | { kind: "teach" }
  | { kind: "ask"; text: string };

export function momentHandlers(onAction: (action: MomentAction) => void): MomentHandlers {
  return {
    onSubmit: (answer) => onAction({ kind: "submit", answer }),
    onShowOptions: () => onAction({ kind: "show_options" }),
    onChooseOption: (choice) => onAction({ kind: "mc", choice }),
    onSkip: () => onAction({ kind: "skip" }),
    onDefer: () => onAction({ kind: "defer" }),
    onReport: () => onAction({ kind: "report" }),
    onHint: () => onAction({ kind: "hint" }),
    onTeach: () => onAction({ kind: "teach" }),
    onAsk: (text) => onAction({ kind: "ask", text }),
  };
}

export interface MomentCardProps extends MomentHandlers {
  moment: MomentView;
  /** True while the answer is being graded. */
  grading?: boolean;
  /** XP award from the grade response (falls back to moment.xp). */
  xp?: XpAward;
  /** Hide "Quiz me later" (boss questions, wrap-up quiz). */
  canDefer?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** "full": hints + Teach me + Ask Claude; "hints": bosses; "none": no help. */
  helpMode?: "full" | "hints" | "none";
  /** Which help request is in flight. */
  helpBusy?: HelpBusy;
  /** Learn mode words the question types for a topic. */
  mode?: SessionMode;
}

const PLACEHOLDER: Record<MomentView["type"], string> = {
  decide: "I'd go with… because…",
  predict: "I think…",
  explain_back: "In my own words…",
  spot_issue: "The issue is…",
  fill_gap: "I'd use… because…",
  boss: "Your answer…",
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** An inline learning moment in the chat (never a modal). States: see momentPhase(). */
export function MomentCard({ moment, grading = false, xp, canDefer = true, autoFocus = false, className = "", helpMode = "full", helpBusy, mode, ...handlers }: MomentCardProps) {
  const phase = momentPhase(moment, grading);
  const hasHelp = Boolean(moment.help?.lesson || moment.help?.thread.length);
  const [helpOpen, setHelpOpen] = useState(hasHelp);
  const help: HelpUi = { mode: helpMode, busy: helpBusy, open: helpOpen || hasHelp, setOpen: setHelpOpen };
  const sounds = useSounds();
  const headingId = useId();

  // Play the verdict sound only when new feedback arrives, never for cards restored from history.
  const fk = feedbackKey(moment);
  const lastFk = useRef(fk);
  // Feedback is "live" once it differs from what the card mounted with (restored cards stay quiet).
  const [initialFk] = useState(fk);
  const liveFeedback = fk !== null && fk !== initialFk;
  useEffect(() => {
    if (fk && fk !== lastFk.current && moment.verdict) sounds.playVerdict(moment.verdict);
    lastFk.current = fk;
  }, [fk, moment.verdict, sounds]);

  if (phase === "skipped" || phase === "deferred" || phase === "reported") {
    return (
      <div className={`space-y-1 ${className}`}>
        <ClosedLine phase={phase} concept={moment.concept} className="" />
        {phase === "skipped" && moment.answerExplanation && <div className="pl-6"><AnswerReveal text={moment.answerExplanation} /></div>}
      </div>
    );
  }

  const xpAmount = xp?.amount ?? moment.xp ?? 0;
  const big = moment.type === "boss" || Boolean(xp?.levelUp);

  return (
    <section aria-labelledby={headingId} className={`rounded-card bg-primary-soft p-5 shadow-soft sm:p-6 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold tracking-wide text-primary uppercase">
          {momentTypeLabel(moment.type, mode)}
        </span>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted">{moment.concept}</span>
      </div>

      {moment.conceptCard && (
        <div className="mb-4 rounded-2xl bg-surface p-4 text-sm">
          <p className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Quick idea</p>
          <Markdown>{moment.conceptCard}</Markdown>
        </div>
      )}

      <div id={headingId} className="mb-4 text-lg font-semibold">
        <Markdown>{moment.question}</Markdown>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement(phase, moment)}
      </p>

      <PhaseBody phase={phase} moment={moment} xpAmount={xpAmount} big={big} canDefer={canDefer} autoFocus={autoFocus} liveFeedback={liveFeedback} handlers={handlers} help={help} />

      {phase !== "grading" && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handlers.onReport}
            className={`rounded text-xs text-muted hover:text-text hover:underline ${focusRing}`}
          >
            <span aria-hidden="true">⚑ </span>Report question
          </button>
        </div>
      )}
    </section>
  );
}

function announcement(phase: MomentPhase, m: MomentView): string {
  if (phase === "grading") return "Checking your answer…";
  if (phase === "locked_in") return "Locked in! Let's see what really happens.";
  if (phase === "revealed") return "Here's the answer. This one will come back for a quick review later.";
  if (m.verdict && (phase === "answered" || phase === "mc_answered" || phase === "choosing")) {
    const label = VERDICT_LABEL[m.verdict];
    return `${label}${/[.!?]$/.test(label) ? "" : "."} ${m.why ?? ""}${phase === "choosing" ? " Try picking from the options." : ""}`;
  }
  return "";
}

interface HelpUi {
  mode: "full" | "hints" | "none";
  busy?: HelpBusy;
  open: boolean;
  setOpen: (open: boolean) => void;
}

interface PhaseBodyProps {
  help: HelpUi;
  phase: MomentPhase;
  moment: MomentView;
  xpAmount: number;
  big: boolean;
  canDefer: boolean;
  autoFocus: boolean;
  liveFeedback: boolean;
  handlers: MomentHandlers;
}

function PhaseBody({ phase, moment, xpAmount, big, canDefer, autoFocus, liveFeedback, handlers, help }: PhaseBodyProps) {
  const panel = (canTeach: boolean) =>
    help.mode === "full" && help.open ? (
      <HelpPanel moment={moment} canTeach={canTeach} busy={help.busy} onTeach={handlers.onTeach} onAsk={handlers.onAsk} onClose={() => help.setOpen(false)} />
    ) : null;
  switch (phase) {
    case "question":
      return (
        <div className="space-y-3">
          <HintList hints={moment.help?.hints ?? []} loading={help.busy === "hint"} />
          {panel(true)}
          <AnswerForm moment={moment} canDefer={canDefer} autoFocus={autoFocus} handlers={handlers} help={help} />
        </div>
      );
    case "revealed":
      return (
        <div className="space-y-3">
          {panel(false)}
          {moment.answerExplanation && <AnswerReveal text={moment.answerExplanation} collapsible={false} />}
          <div className="flex items-center gap-4">
            <Pip mood="encouraging" className="text-xs" />
            <p>Got it. This one will come back for a quick review later.</p>
          </div>
        </div>
      );
    case "grading":
      return (
        <div className="flex items-center gap-4">
          <Pip mood="thinking" className="text-xs" />
          <span className="inline-flex items-center gap-2 text-muted">
            <Spinner label="Checking your answer" /> Checking your answer…
          </span>
        </div>
      );
    case "locked_in":
      return (
        <div className="space-y-3">
          {moment.answer && <YourAnswer label="Your prediction" text={moment.answer} />}
          <div className="flex items-center gap-4">
            <Pip mood="thinking" className="text-xs" />
            <p className="font-semibold">Locked in! Let&apos;s see what really happens.</p>
          </div>
        </div>
      );
    case "choosing":
      return (
        <div className="space-y-4">
          {moment.answer && <YourAnswer text={moment.answer} />}
          {moment.verdict && <Feedback verdict={moment.verdict} why={moment.why} xpAmount={0} big={false} />}
          <HintList hints={moment.help?.hints ?? []} loading={help.busy === "hint"} />
          {panel(true)}
          <OptionPicker moment={moment} canDefer={canDefer} focusFirst={liveFeedback} handlers={handlers} help={help} />
        </div>
      );
    case "mc_answered":
      return (
        <div className="space-y-4">
          <OptionResults moment={moment} />
          {moment.verdict && <Feedback verdict={moment.verdict} why={moment.why} xpAmount={xpAmount} big={big} />}
          <FollowUp help={help} panel={panel(false)} />
        </div>
      );
    case "answered":
      return (
        <div className="space-y-4">
          {moment.answer && <YourAnswer text={moment.answer} />}
          {moment.verdict && <Feedback verdict={moment.verdict} why={moment.why} xpAmount={xpAmount} big={big} />}
          <FollowUp help={help} panel={panel(false)} />
        </div>
      );
    default:
      return null;
  }
}

function AnswerForm({ moment, canDefer, autoFocus, handlers, help }: { moment: MomentView; canDefer: boolean; autoFocus: boolean; handlers: MomentHandlers; help: HelpUi }) {
  const [draft, setDraft] = useState(moment.answer ?? "");
  const inputId = useId();
  const submit = () => {
    const text = draft.trim();
    if (text) handlers.onSubmit(text);
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
      <label htmlFor={inputId} className="sr-only">Your answer</label>
      <textarea
        id={inputId}
        rows={3}
        value={draft}
        autoFocus={autoFocus}
        maxLength={2000}
        placeholder={PLACEHOLDER[moment.type]}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="w-full resize-y rounded-2xl border border-border bg-surface p-3 leading-relaxed outline-none placeholder:text-muted focus:border-primary"
      />
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        <Button type="submit" variant="primary" disabled={!draft.trim()}>Submit</Button>
        <span className="flex-1" />
        <SecondaryActions moment={moment} canDefer={canDefer} handlers={handlers} help={help} showOptions />
      </div>
    </form>
  );
}

function OptionPicker({ moment, canDefer, focusFirst, handlers, help }: { moment: MomentView; canDefer: boolean; focusFirst: boolean; handlers: MomentHandlers; help: HelpUi }) {
  const firstRef = useRef<HTMLButtonElement>(null);
  const hadVerdict = Boolean(moment.verdict);
  useEffect(() => {
    // After a live "Not quite" (not a card restored from history), move focus to the options.
    if (focusFirst) firstRef.current?.focus({ preventScroll: true });
  }, [focusFirst]);
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-muted">{hadVerdict ? "Try it with options:" : "Pick the best option:"}</p>
      <div role="group" aria-label="Answer options" className="grid gap-2">
        {(moment.mcOptions ?? []).map((opt, i) => (
          <button
            key={i}
            ref={i === 0 ? firstRef : undefined}
            type="button"
            onClick={() => handlers.onChooseOption(i)}
            className={`flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition hover:border-primary ${focusRing}`}
          >
            <span aria-hidden="true" className="font-bold text-primary">{LETTERS[i]}</span>
            <span className="flex-1"><Markdown>{opt}</Markdown></span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-x-1 gap-y-2">
        <SecondaryActions moment={moment} canDefer={canDefer} handlers={handlers} help={help} showOptions={false} />
      </div>
    </div>
  );
}

/** The quiet right-hand row: help, then the opt-outs. Submit (or picking an option) stays the main action. */
function SecondaryActions({ moment, canDefer, handlers, help, showOptions }: { moment: MomentView; canDefer: boolean; handlers: MomentHandlers; help: HelpUi; showOptions: boolean }) {
  const hints = moment.help?.hints.length ?? 0;
  return (
    <>
      {help.mode !== "none" && hints < MAX_HINTS && (
        <QuietAction onClick={handlers.onHint} disabled={Boolean(help.busy)}>{hints ? "Another hint" : "Give me a hint"}</QuietAction>
      )}
      {help.mode === "full" && !help.open && (
        <QuietAction onClick={() => help.setOpen(true)}>Help me learn this</QuietAction>
      )}
      {showOptions && <QuietAction onClick={handlers.onShowOptions}>Show options</QuietAction>}
      <QuietAction onClick={handlers.onSkip}>Skip</QuietAction>
      {canDefer && <QuietAction onClick={handlers.onDefer}>Quiz me later</QuietAction>}
    </>
  );
}

/** After answering: the Ask Claude thread stays available for "why?" follow-ups. */
function FollowUp({ help, panel }: { help: HelpUi; panel: React.ReactNode }) {
  if (help.mode !== "full") return null;
  if (help.open) return <>{panel}</>;
  return (
    <div className="flex justify-end">
      <QuietAction onClick={() => help.setOpen(true)}>Ask Claude why</QuietAction>
    </div>
  );
}

function OptionResults({ moment }: { moment: MomentView }) {
  return (
    <ul className="grid gap-2" aria-label="Answer options">
      {(moment.mcOptions ?? []).map((opt, i) => {
        const chosen = i === moment.mcChoice;
        const best = i === moment.correctIndex;
        const tags = [chosen && "Your pick", best && "Best answer"].filter(Boolean).join(" · ");
        return (
          <li
            key={i}
            className={`flex items-center gap-3 rounded-2xl border-2 bg-surface px-4 py-3 ${
              best ? "border-success" : chosen ? "border-primary" : "border-transparent opacity-70"
            }`}
          >
            <span aria-hidden="true" className="font-bold text-muted">{LETTERS[i]}</span>
            <span className="flex-1"><Markdown>{opt}</Markdown></span>
            {tags && <span className={`shrink-0 text-xs font-bold ${best ? "text-success" : "text-primary"}`}>{tags}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Feedback({ verdict, why, xpAmount, big }: { verdict: Verdict; why?: string; xpAmount: number; big: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <Pip mood={pipMoodFor(verdict, big)} className="hidden shrink-0 text-xs sm:block" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <VerdictChip verdict={verdict} />
          <XpChip amount={xpAmount} />
        </div>
        {why && <Markdown>{why}</Markdown>}
      </div>
    </div>
  );
}

function YourAnswer({ text, label = "Your answer" }: { text: string; label?: string }) {
  return (
    <div className="rounded-2xl bg-surface/70 px-4 py-2.5 text-sm">
      <span className="font-bold text-muted">{label}: </span>
      <span className="whitespace-pre-wrap">{text}</span>
    </div>
  );
}

const CLOSED_COPY: Record<"skipped" | "deferred" | "reported", (concept: string) => string> = {
  skipped: (c) => `Skipped a question on ${c}.`,
  deferred: (c) => `Saved a question on ${c} for your wrap-up quiz.`,
  reported: () => "Thanks for flagging that question. It won't count toward your XP.",
};

function ClosedLine({ phase, concept, className }: { phase: "skipped" | "deferred" | "reported"; concept: string; className: string }) {
  return (
    <p className={`flex items-center gap-2 px-1 text-sm text-muted ${className}`}>
      <span aria-hidden="true">{phase === "reported" ? "⚑" : phase === "deferred" ? "◔" : "↷"}</span>
      {CLOSED_COPY[phase](concept)}
    </p>
  );
}
