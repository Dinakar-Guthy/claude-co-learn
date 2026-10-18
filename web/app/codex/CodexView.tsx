"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CodexList } from "@/components/CodexList";
import { Button, Spinner, focusRing } from "@/components/ui";
import type { CodexEntry, CodexResponse } from "@/lib/codex";
import { ApiError, apiGet, errorMessage } from "@/lib/client/api";

type Load = { kind: "loading" } | { kind: "error"; message: string; signedOut: boolean } | { kind: "ready"; concepts: CodexEntry[]; now: number };

/** Only same-origin app paths are allowed as the back target (no "//host" or "/\host" open redirects). */
export function safeBackHref(from: string | null): string {
  return from && /^\/(?![/\\])/.test(from) ? from : "/";
}

export function CodexView() {
  const backHref = safeBackHref(useSearchParams().get("from"));
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0); // bumped by "Try again"

  useEffect(() => {
    const ctrl = new AbortController();
    apiGet<CodexResponse>("/api/codex", ctrl.signal)
      .then((res) => setLoad({ kind: "ready", concepts: res.concepts, now: Date.now() }))
      .catch((err) => {
        if (!ctrl.signal.aborted) setLoad({ kind: "error", message: errorMessage(err), signedOut: err instanceof ApiError && err.status === 401 });
      });
    return () => ctrl.abort();
  }, [attempt]);

  const mastered = load.kind === "ready" ? load.concepts.filter((c) => c.status === "mastered").length : 0;

  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pt-6 pb-12">
      <Link href={backHref} className={`inline-flex items-center gap-1 rounded-full px-1 py-1 text-sm text-muted hover:text-text ${focusRing}`}>
        <span aria-hidden="true">←</span> {backHref.startsWith("/s/") ? "Back to your session" : "Back"}
      </Link>
      <header className="mt-4 mb-6 px-1">
        <h1 className="text-2xl font-extrabold">Codex</h1>
        <p className="text-muted">
          Everything you&apos;ve practised with Co-learn, across sessions.
          {load.kind === "ready" && load.concepts.length > 0 && (
            <> {load.concepts.length} {load.concepts.length === 1 ? "concept" : "concepts"} so far, {mastered} mastered.</>
          )}
        </p>
      </header>

      <div>
        {load.kind === "loading" && (
          <div className="flex justify-center py-12">
            <Spinner label="Loading your Codex" />
          </div>
        )}
        {load.kind === "error" && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p role="status" className="text-muted">{load.message}</p>
            {load.signedOut ? (
              <Link href="/" className={`rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-soft ${focusRing}`}>
                Go to start
              </Link>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setLoad({ kind: "loading" });
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </Button>
            )}
          </div>
        )}
        {load.kind === "ready" && <CodexList concepts={load.concepts} now={load.now} />}
      </div>
    </main>
  );
}
