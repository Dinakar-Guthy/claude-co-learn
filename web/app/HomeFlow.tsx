"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CreateSessionResponse, UnlockResponse, UserView } from "@/lib/contracts/api";
import type { Intent, SessionSummary } from "@/lib/contracts/session";
import { UNLOCK_PHRASE } from "@/lib/contracts/api";
import { IntentFlow } from "@/components/IntentFlow";
import { LimitsBanner } from "@/components/LimitsBanner";
import { Pip } from "@/components/Pip";
import { useSounds } from "@/components/SoundProvider";
import { UiProviders } from "@/components/UiProviders";
import { Button, Spinner } from "@/components/ui";
import { ApiError, apiGet, apiPost, errorMessage } from "@/lib/client/api";
import { rememberTheme } from "@/lib/ui/themeBoot";
import { startOverAsNewUser } from "@/lib/client/reset";

type Stage = "checking" | "unlock" | "home" | "intent";

/**
 * `/`: the /co-learn unlock ritual → continue a past session or start one (intent) → the workspace.
 * Keyed by bfcacheId: Next keeps visited routes mounted (Activity), so a fresh push/replace (e.g. "Start a new
 * session" from a wrap-up) must start over instead of showing the last visit's half-finished intent form.
 */
export function HomeFlow() {
  const { bfcacheId } = useRouter();
  return <HomeFlowInner key={bfcacheId} />;
}

function HomeFlowInner() {
  const params = useSearchParams();
  const startDirectly = params.get("start") === "1";
  const initialGoal = params.get("goal") ?? "";
  const [stage, setStage] = useState<Stage>(startDirectly ? "checking" : "unlock");
  const [user, setUser] = useState<UserView | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  // "Start a new session" from a wrap-up skips the ritual when the browser is already unlocked.
  useEffect(() => {
    if (!startDirectly) return;
    apiGet<UserView>("/api/user")
      .then((u) => {
        setUser(u);
        setStage("intent");
      })
      .catch(() => setStage("unlock"));
  }, [startDirectly]);

  useEffect(() => {
    if (user) rememberTheme(user.settings.theme);
  }, [user]);

  const s = user?.settings;
  return (
    <UiProviders theme={s?.theme} sound={s ? { enabled: s.sound, volume: s.volume, pack: s.soundPack } : undefined}>
      <LimitsBanner />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
        {stage === "checking" && <Spinner label="Loading" />}
        {stage === "unlock" && (
          <UnlockBox
            onUnlocked={(res) => {
              setUser(res.user);
              setSessions(res.sessions);
              setStage(res.sessions.length ? "home" : "intent");
            }}
          />
        )}
        {stage === "home" && (
          <Welcome
            sessions={sessions}
            onNew={() => setStage("intent")}
            onStartOver={async () => {
              const fresh = await startOverAsNewUser();
              setUser(fresh);
              setSessions([]);
              setStage("intent");
            }}
          />
        )}
        {stage === "intent" && <Intent initialGoal={initialGoal} />}
      </main>
    </UiProviders>
  );
}

function UnlockBox({ onUnlocked }: { onUnlocked: (res: UnlockResponse) => void }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "unlocked" | "wrong" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const sounds = useSounds();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim().toLowerCase() !== UNLOCK_PHRASE) {
      setState("wrong");
      sounds.play("gentle");
      return;
    }
    setState("checking");
    try {
      const res = await apiPost<UnlockResponse>("/api/unlock", { phrase: value.trim() });
      setState("unlocked");
      sounds.play("unlock");
      // A beat to enjoy the "box opens" moment before moving on.
      setTimeout(() => onUnlocked(res), 900);
    } catch (err) {
      setError(errorMessage(err));
      setState("error");
    }
  }

  return (
    <>
      <Pip mood={state === "unlocked" ? "celebrating" : state === "wrong" || state === "error" ? "encouraging" : "neutral"} />
      <form onSubmit={submit} className="w-full max-w-md">
        <label htmlFor="unlock" className="sr-only">Type /co-learn to begin</label>
        <input
          id="unlock"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => { setValue(e.target.value); if (state === "wrong" || state === "error") setState("idle"); }}
          placeholder={UNLOCK_PHRASE}
          disabled={state === "checking" || state === "unlocked"}
          className={`w-full rounded-full border bg-surface px-6 py-4 text-center text-lg shadow-soft outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft ${state === "unlocked" ? "scale-105 border-primary" : "border-border"}`}
        />
      </form>
      <p className="text-sm text-muted" aria-live="polite">
        {state === "unlocked"
          ? "Co-learn mode is on."
          : state === "wrong"
            ? "Almost: type /co-learn to switch on Co-learn mode."
            : state === "error"
              ? error
              : "Type /co-learn to switch on Co-learn mode."}
      </p>
    </>
  );
}

function Welcome({ sessions, onNew, onStartOver }: { sessions: SessionSummary[]; onNew: () => void; onStartOver: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const recent = [...sessions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
      <Pip mood="happy" />
      <p className="text-xl font-bold">Welcome back!</p>
      <div className="flex w-full flex-col gap-2">
        {recent.map((s) => (
          <Button key={s.id} onClick={() => router.push(`/s/${s.id}`)} className="w-full justify-between">
            <span className="truncate">{s.status === "wrapped" ? "Revisit" : "Continue"}: {s.title}</span>
            <span className="shrink-0 text-xs font-normal text-muted">{shortDate(s.createdAt)}</span>
          </Button>
        ))}
      </div>
      <Button variant="primary" onClick={onNew}>Start something new</Button>
      {confirm ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
          <p>Start over as a brand-new user? Your XP, unlocks, and past sessions on this browser will be gone.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => onStartOver().catch((err) => setError(errorMessage(err)))}>Yes, start over</Button>
            <Button size="sm" onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
          {error && <p role="alert" className="text-muted">{error}</p>}
        </div>
      ) : (
        <Button size="sm" variant="quiet" onClick={() => setConfirm(true)}>Start over as a new user</Button>
      )}
    </div>
  );
}

const shortDate = (at: number) => new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Intent({ initialGoal }: { initialGoal: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(intent: Intent) {
    setBusy(true);
    setError(null);
    try {
      const { sessionId } = await apiPost<CreateSessionResponse>("/api/session", { intent });
      router.push(`/s/${sessionId}`);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Your Co-learn session expired. Reload and type /co-learn again." : errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <IntentFlow onComplete={start} busy={busy} initialGoal={initialGoal} />
      {error && <p role="alert" className="text-sm text-muted">{error}</p>}
    </div>
  );
}
