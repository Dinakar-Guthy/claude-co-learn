"use client";

import { useState } from "react";
import { Pip } from "@/components/Pip";
import { UNLOCK_PHRASE } from "@/lib/contracts/api";

/** Landing: a single input. Typing /co-learn "unlocks" the mode (framing, not security). */
export default function UnlockPage() {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "unlocked" | "wrong">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim().toLowerCase() !== UNLOCK_PHRASE) {
      setState("wrong");
      return;
    }
    setState("checking");
    const res = await fetch("/api/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phrase: value }),
    });
    setState(res.ok ? "unlocked" : "wrong");
    // P2: navigate to the intent flow.
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <Pip mood={state === "unlocked" ? "celebrating" : state === "wrong" ? "encouraging" : "neutral"} />
      <form onSubmit={submit} className="w-full max-w-md">
        <label htmlFor="unlock" className="sr-only">Type /co-learn to begin</label>
        <input
          id="unlock"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => { setValue(e.target.value); if (state === "wrong") setState("idle"); }}
          placeholder={UNLOCK_PHRASE}
          disabled={state === "checking" || state === "unlocked"}
          className="w-full rounded-full border border-border bg-surface px-6 py-4 text-center text-lg shadow-soft outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft"
        />
      </form>
      <p className="text-sm text-muted" aria-live="polite">
        {state === "unlocked"
          ? "Co-learn mode is on."
          : state === "wrong"
            ? "Almost — type /co-learn to switch on Co-learn mode."
            : "Type /co-learn to switch on Co-learn mode."}
      </p>
    </main>
  );
}
