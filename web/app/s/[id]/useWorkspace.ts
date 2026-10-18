"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatRequest, GradeRequest, GradeResponse, SessionView, StartBossResponse, UserView, WrapUpResponse } from "@/lib/contracts/api";
import type { LevelReward, UserSettings } from "@/lib/contracts/engine";
import type { StoryChapter, SessionSummary } from "@/lib/contracts/session";
import type { ChatStreamEvent, TurnEndReason, XpAward } from "@/lib/contracts/stream";
import type { MomentAction } from "@/components/MomentCard";
import { apiGet, apiPatch, apiPost, errorMessage } from "@/lib/client/api";
import { streamChat } from "@/lib/client/chatStream";
import { addChapter, applyBossStart, applyGrade, applyStreamEvent, appendUserMessage, bossTrigger, mergeMoments, reconcile } from "@/lib/client/workspace";
import { celebrate } from "@/lib/ui/celebrate";

type Status = Extract<ChatStreamEvent, { type: "status" }>["status"];

export interface TurnProblem {
  reason: Extract<TurnEndReason, "max_steps" | "error" | "refusal">;
  message?: string;
  /** What "Try again" / "Continue" sends. */
  retry: ChatRequest;
}

export interface LevelUpState {
  from: number;
  to: number;
  rewards: LevelReward[];
}

const STORY_POLL_MS = 1500;
const STORY_POLL_MAX_MS = 25_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function gradeBody(sessionId: string, momentId: string, action: MomentAction): GradeRequest {
  switch (action.kind) {
    case "submit":
      return { sessionId, momentId, action: "submit", answer: action.answer };
    case "mc":
      return { sessionId, momentId, action: "mc", choice: action.choice };
    default:
      return { sessionId, momentId, action: action.kind };
  }
}

export function useWorkspace(sessionId: string) {
  const [view, setView] = useState<SessionView | null>(null);
  const [user, setUser] = useState<UserView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [problem, setProblem] = useState<TurnProblem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [grading, setGrading] = useState<Record<string, boolean>>({});
  const [xpByMoment, setXpByMoment] = useState<Record<string, XpAward>>({});
  const [xpGain, setXpGain] = useState<{ amount: number; id: number } | undefined>();
  const [levelUp, setLevelUp] = useState<LevelUpState | null>(null);
  const [liveIds, setLiveIds] = useState<Set<string>>(() => new Set());

  const [bossShown, setBossShown] = useState<Record<string, string>>({});
  const [bossState, setBossState] = useState<"idle" | "loading" | "error">("idle");
  const [bossError, setBossError] = useState<string | null>(null);
  const [storyWaiting, setStoryWaiting] = useState(false);

  const [wrap, setWrap] = useState<{ loading: boolean; data?: WrapUpResponse; error?: string }>({ loading: false });
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const localIdRef = useRef(0);

  const update = useCallback((fn: (v: SessionView) => SessionView) => setView((v) => (v ? fn(v) : v)), []);

  // ---- loading ----
  useEffect(() => {
    let cancelled = false;
    Promise.all([apiGet<SessionView>(`/api/session/${encodeURIComponent(sessionId)}`), apiGet<UserView>("/api/user")])
      .then(([v, u]) => {
        if (cancelled) return;
        setView(v);
        setUser(u);
      })
      .catch((err) => !cancelled && setLoadError(errorMessage(err)));
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [sessionId]);

  const sync = useCallback(async () => {
    try {
      const server = await apiGet<SessionView>(`/api/session/${encodeURIComponent(sessionId)}`);
      setView((local) => (local ? reconcile(local, server) : server));
    } catch {
      // Keep the live state; the next turn re-syncs.
    }
  }, [sessionId]);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await apiGet<UserView>("/api/user"));
    } catch {
      /* non-critical */
    }
  }, []);

  // ---- XP ----
  const applyXp = useCallback(
    (award: XpAward | undefined, momentId?: string) => {
      if (!award) return;
      setUser((u) => (u ? { ...u, xp: award.level.xp, level: award.level } : u));
      if (award.amount > 0) setXpGain((g) => ({ amount: award.amount, id: (g?.id ?? 0) + 1 }));
      if (momentId) setXpByMoment((x) => ({ ...x, [momentId]: award }));
      if (award.levelUp) {
        setLevelUp(award.levelUp);
        void celebrate(`levelup:${award.levelUp.to}`, "levelUp");
        void refreshUser();
      }
    },
    [refreshUser],
  );

  // ---- boss ----
  const startBoss = useCallback(async () => {
    setBossState("loading");
    setBossError(null);
    try {
      const res = await apiPost<StartBossResponse>("/api/boss", { sessionId });
      update((v) => applyBossStart(v, res));
      setLiveIds((s) => new Set([...s, ...Object.keys(res.moments)]));
      setBossState("idle");
    } catch (err) {
      setBossError(errorMessage(err));
      setBossState("error");
    }
  }, [sessionId, update]);

  // ---- chat turns ----
  const send = useCallback(
    async (req: ChatRequest) => {
      if (streamingRef.current) return;
      streamingRef.current = true;
      setStreaming(true);
      setStatus("thinking");
      setProblem(null);
      setNotice(null);
      if (req.kind === "message") {
        const id = `local-user-${++localIdRef.current}`;
        update((v) => appendUserMessage(v, id, req.text, Date.now()));
      }

      const controller = new AbortController();
      abortRef.current = controller;
      let end: TurnEndReason | null = null;
      let error: Extract<ChatStreamEvent, { type: "error" }> | null = null;
      let sawProgress = false;

      await streamChat(
        req,
        (event) => {
          switch (event.type) {
            case "status":
              setStatus(event.status);
              return;
            case "turn_end":
              end = event.reason;
              return;
            case "error":
              error = event;
              return;
            case "moment":
              setLiveIds((s) => new Set(s).add(event.moment.id));
              break;
            case "prediction_reveal":
              setLiveIds((s) => new Set(s).add(event.itemId));
              applyXp(event.xp);
              break;
          }
          sawProgress = true;
          update((v) => applyStreamEvent(v, event));
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;

      streamingRef.current = false;
      setStreaming(false);
      setStatus(null);
      await sync();

      const reason = end as TurnEndReason | null;
      const err = error as Extract<ChatStreamEvent, { type: "error" }> | null;
      if (reason === "boss_due") void startBoss();
      else if (reason === "max_steps") setProblem({ reason, retry: { sessionId, kind: "continue" } });
      else if (reason === "error" || reason === "refusal") {
        // Nothing reached the model loop (e.g. a 429 before streaming): resend the same request.
        // Otherwise committed progress was saved, so continuing picks up where it stopped.
        const retry: ChatRequest = sawProgress || req.kind !== "message" ? { sessionId, kind: "continue" } : req;
        setProblem({ reason, message: err?.message, retry });
      }
    },
    [applyXp, sessionId, startBoss, sync, update],
  );

  const sendMessage = useCallback((text: string) => void send({ sessionId, kind: "message", text }), [send, sessionId]);

  // ---- story ----
  const waitForChapter = useCallback(
    async (trigger: string): Promise<StoryChapter | null> => {
      const started = Date.now();
      while (Date.now() - started < STORY_POLL_MAX_MS) {
        try {
          const { chapter } = await apiGet<{ chapter: StoryChapter | null }>(
            `/api/story?sessionId=${encodeURIComponent(sessionId)}&trigger=${encodeURIComponent(trigger)}`,
          );
          if (chapter) return chapter;
        } catch {
          /* keep polling */
        }
        await sleep(STORY_POLL_MS);
      }
      return null;
    },
    [sessionId],
  );

  // ---- moments ----
  const onBossFinished = useCallback(
    async (res: GradeResponse) => {
      if (!res.boss) return;
      setStoryWaiting(true);
      const chapter = await waitForChapter(bossTrigger(res.boss.bossId));
      setStoryWaiting(false);
      if (chapter) {
        setLiveIds((s) => new Set(s).add(chapter.id));
        update((v) => addChapter(v, chapter));
      }
      if (res.continueWith) await send(res.continueWith);
    },
    [send, update, waitForChapter],
  );

  const act = useCallback(
    async (momentId: string, action: MomentAction) => {
      if (grading[momentId]) return;
      const slow = action.kind === "submit";
      if (slow) setGrading((g) => ({ ...g, [momentId]: true }));
      setNotice(null);
      try {
        const res = await apiPost<GradeResponse>("/api/moment/grade", gradeBody(sessionId, momentId, action));
        update((v) => applyGrade(v, res));
        if (wrap.data) setWrap((w) => (w.data ? { ...w, data: { ...w.data, deferred: w.data.deferred.map((d) => (d.id === momentId ? res.moment : d)) } } : w));
        applyXp(res.xp, momentId);
        if (res.boss?.done) void onBossFinished(res);
        else if (res.continueWith) void send(res.continueWith);
      } catch (err) {
        setNotice(errorMessage(err));
      } finally {
        if (slow) setGrading((g) => ({ ...g, [momentId]: false }));
      }
    },
    [applyXp, grading, onBossFinished, send, sessionId, update, wrap.data],
  );

  const showBossQuestion = useCallback((bossId: string, momentId: string) => setBossShown((s) => ({ ...s, [bossId]: momentId })), []);

  // ---- wrap-up ----
  const wrapUp = useCallback(async () => {
    if (wrap.loading) return;
    setWrap({ loading: true });
    try {
      const data = await apiPost<WrapUpResponse>("/api/wrapup", { sessionId });
      setWrap({ loading: false, data });
      setUser(data.user);
      update((v) => mergeMoments({ ...v, status: "wrapped" }, data.deferred));
      if (data.chapter) setLiveIds((s) => new Set(s).add(data.chapter!.id));
      const last = data.levelUps.at(-1);
      if (last) {
        const first = data.levelUps[0];
        setLevelUp({ from: first.from, to: last.to, rewards: data.levelUps.flatMap((l) => l.rewards) });
        void celebrate(`levelup:${last.to}`, "levelUp");
      }
    } catch (err) {
      setWrap({ loading: false, error: errorMessage(err) });
    }
  }, [sessionId, update, wrap.loading]);

  // ---- settings ----
  const changeSettings = useCallback(async (patch: Partial<UserSettings>) => {
    setUser((u) => (u ? { ...u, settings: { ...u.settings, ...patch, guardrails: { ...u.settings.guardrails, ...patch.guardrails } } } : u));
    try {
      setUser(await apiPatch<UserView>("/api/user", patch));
    } catch (err) {
      setNotice(errorMessage(err));
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await apiGet<SessionSummary[]>("/api/sessions"));
    } catch {
      /* drawer still works without the list */
    }
  }, []);

  return {
    view,
    user,
    loadError,
    streaming,
    status,
    problem,
    notice,
    dismissNotice: () => setNotice(null),
    grading,
    xpByMoment,
    xpGain,
    levelUp,
    dismissLevelUp: () => setLevelUp(null),
    liveIds,
    bossShown,
    bossState,
    bossError,
    storyWaiting,
    wrap,
    sessions,
    send,
    sendMessage,
    act,
    startBoss,
    showBossQuestion,
    wrapUp,
    changeSettings,
    loadSessions,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
