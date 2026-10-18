"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function AccessForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("checking");
    const res = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setMessage(body.error ?? "That password didn't work.");
    setState("error");
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col items-center gap-3">
      <label htmlFor="access" className="sr-only">Access password</label>
      <input
        id="access"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); if (state === "error") setState("idle"); }}
        className="w-full rounded-full border border-border bg-surface px-6 py-3 text-center shadow-soft outline-none focus:border-primary focus:ring-4 focus:ring-primary-soft"
      />
      <button
        type="submit"
        disabled={!password || state === "checking"}
        className="rounded-full bg-primary px-6 py-2 text-primary-foreground disabled:opacity-50"
      >
        {state === "checking" ? "Checking…" : "Enter"}
      </button>
      <p className="min-h-5 text-sm text-muted" aria-live="polite">{state === "error" ? message : ""}</p>
    </form>
  );
}
