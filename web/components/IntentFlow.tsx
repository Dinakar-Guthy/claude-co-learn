"use client";

import { useId, useState } from "react";
import type { Familiarity } from "@/lib/contracts/engine";
import type { Intent } from "@/lib/contracts/session";
import { Pip } from "./Pip";
import { useSounds } from "./SoundProvider";
import { Button, Chip, focusRing } from "./ui";

export const DEMO_GOAL = "Help me train a model to predict customer churn from this CSV.";

const FAMILIARITY: { id: Familiarity; label: string }[] = [
  { id: "new", label: "New to this" },
  { id: "some", label: "Some experience" },
  { id: "comfortable", label: "Comfortable" },
];
const MINUTES = [10, 20, 30] as const;

export interface IntentFlowProps {
  onComplete: (intent: Intent) => void;
  /** Disable the final button while the session is being created. */
  busy?: boolean;
  autoFocus?: boolean;
  /** Prefills the goal (e.g. a "Next time you could…" suggestion from a wrap-up). */
  initialGoal?: string;
}

/** Intent step: goal (or the demo starter), then familiarity + time chips. */
export function IntentFlow({ onComplete, busy = false, autoFocus = true, initialGoal = "" }: IntentFlowProps) {
  const [step, setStep] = useState<"goal" | "details">("goal");
  const [goal, setGoal] = useState(initialGoal);
  const [demo, setDemo] = useState(initialGoal.trim() === DEMO_GOAL);
  const [familiarity, setFamiliarity] = useState<Familiarity | null>(null);
  const [minutes, setMinutes] = useState<number>(10);
  const sounds = useSounds();
  const goalId = useId();
  const famLabel = useId();
  const timeLabel = useId();

  function next() {
    if (!goal.trim()) return;
    setStep("details");
  }

  function startDemo() {
    sounds.play("click");
    setGoal(DEMO_GOAL);
    setDemo(true);
    setStep("details");
  }

  function finish() {
    if (!familiarity || busy) return;
    onComplete({ goal: goal.trim(), familiarity, minutes, demo: demo && goal.trim() === DEMO_GOAL });
  }

  if (step === "goal") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-5">
        <Pip mood="happy" />
        <label htmlFor={goalId} className="text-center text-xl font-bold">What are you working on?</label>
        <textarea
          id={goalId}
          autoFocus={autoFocus}
          rows={3}
          value={goal}
          maxLength={1000}
          placeholder="e.g. Analyze our signup funnel in SQL, or draft a project plan…"
          onChange={(e) => { setGoal(e.target.value); setDemo(e.target.value.trim() === DEMO_GOAL); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); next(); }
          }}
          className="w-full resize-none rounded-card border border-border bg-surface p-4 leading-relaxed shadow-soft outline-none placeholder:text-muted focus:border-primary"
        />
        <div className="flex w-full flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={startDemo}
            className={`rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-soft transition hover:brightness-110 ${focusRing}`}
          >
            <span aria-hidden="true">▶ </span>Try the demo: train a churn model
          </button>
          <Button onClick={next} disabled={!goal.trim()}>Next</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6">
      <Pip mood="neutral" />
      <div className="w-full rounded-card bg-surface-2 px-4 py-3 text-sm">
        <span className="font-bold text-muted">Working on: </span>
        <span>{goal.trim()}</span>{" "}
        <button type="button" onClick={() => setStep("goal")} className={`rounded font-semibold text-primary underline underline-offset-2 ${focusRing}`}>
          Change
        </button>
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        <p id={famLabel} className="text-lg font-bold">How familiar are you with this?</p>
        <div role="group" aria-labelledby={famLabel} className="flex flex-wrap justify-center gap-2">
          {FAMILIARITY.map((f) => (
            <Chip key={f.id} selected={familiarity === f.id} onClick={() => { sounds.play("click"); setFamiliarity(f.id); }}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        <p id={timeLabel} className="text-lg font-bold">How long do you have?</p>
        <div role="group" aria-labelledby={timeLabel} className="flex flex-wrap justify-center gap-2">
          {MINUTES.map((n) => (
            <Chip key={n} selected={minutes === n} onClick={() => { sounds.play("click"); setMinutes(n); }}>
              {n} min
            </Chip>
          ))}
        </div>
      </div>

      <Button variant="primary" onClick={finish} disabled={!familiarity || busy}>
        {busy ? "Starting…" : "Let's go"}
      </Button>
    </div>
  );
}
