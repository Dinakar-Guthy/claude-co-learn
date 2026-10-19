"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionView } from "@/lib/contracts/api";
import type { TranscriptItem } from "@/lib/contracts/session";
import { UiProviders } from "@/components/UiProviders";
import { TopBar } from "@/components/TopBar";
import { ChatInput } from "@/components/ChatInput";
import { AssistantMessage, MilestoneDivider, Notice, UserMessage } from "@/components/Messages";
import { CodeRunBlock } from "@/components/CodeRunBlock";
import { MomentCard, momentHandlers } from "@/components/MomentCard";
import { PredictionReveal } from "@/components/PredictionReveal";
import { BossCard } from "@/components/BossCard";
import { BossOffer } from "@/components/BossOffer";
import { PrimerCard } from "@/components/PrimerCard";
import { AsciiBoss } from "@/components/AsciiBoss";
import { StoryChapterCard } from "@/components/StoryChapterCard";
import { LevelUpToast } from "@/components/LevelUpToast";
import { WrapUp } from "@/components/WrapUp";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { LimitsBanner } from "@/components/LimitsBanner";
import { Pip } from "@/components/Pip";
import { Button, Spinner } from "@/components/ui";
import { activeBoss, bossMomentId, nextBossQuestion, openMoment, revealedPredictions } from "@/lib/client/workspace";
import { rememberTheme } from "@/lib/ui/themeBoot";
import { startOverAsNewUser } from "@/lib/client/reset";
import { apiPost, errorMessage } from "@/lib/client/api";
import { useNow } from "@/lib/ui/useNow";
import { useWorkspace, type Workspace as WorkspaceApi } from "./useWorkspace";

const STATUS_LABEL = {
  thinking: "Claude is thinking…",
  summarizing: "Tidying up my notes so far… (a few extra seconds)",
  searching: "Looking up sources…",
  running_code: "Running code…",
  preparing_moment: "Preparing a question for you…",
} as const;

/** Keyed by bfcacheId so a fresh navigation to a session reloads it instead of reviving a hidden stale copy. */
export function Workspace({ sessionId }: { sessionId: string }) {
  const { bfcacheId } = useRouter();
  return <WorkspaceRoot key={bfcacheId} sessionId={sessionId} />;
}

function WorkspaceRoot({ sessionId }: { sessionId: string }) {
  const ws = useWorkspace(sessionId);
  const { user } = ws;

  useEffect(() => {
    if (user) rememberTheme(user.settings.theme);
  }, [user]);

  if (ws.loadError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <Pip mood="encouraging" />
        <p className="text-lg font-semibold">{ws.loadError}</p>
        <Link href="/" className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-soft">Back to start</Link>
      </main>
    );
  }
  if (!ws.view || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Spinner label="Loading your session" />
      </main>
    );
  }

  return (
    <UiProviders theme={user.settings.theme} sound={{ enabled: user.settings.sound, volume: user.settings.volume, pack: user.settings.soundPack }}>
      <WorkspaceBody ws={ws} view={ws.view} />
    </UiProviders>
  );
}

function WorkspaceBody({ ws, view }: { ws: WorkspaceApi; view: SessionView }) {
  const router = useRouter();
  const user = ws.user!;
  const [drawer, setDrawer] = useState(false);
  const [keepGoing, setKeepGoing] = useState(false);
  const now = useNow(5000);
  const kickedOff = useRef(false);

  // A new session starts working on the learner's goal right away (design-plan §2, step 2).
  const { send } = ws;
  useEffect(() => {
    if (kickedOff.current || view.transcript.length > 0 || view.status !== "active") return;
    kickedOff.current = true;
    void send({ sessionId: view.id, kind: "message", text: view.intent.goal });
  }, [send, view.id, view.intent.goal, view.status, view.transcript.length]);

  useStickToBottom(view, ws.streaming);

  // The level-up toast steps aside on its own after a while (it's a reward, not a task).
  const { levelUp, dismissLevelUp } = ws;
  useEffect(() => {
    if (!levelUp) return;
    const t = setTimeout(dismissLevelUp, 12_000);
    return () => clearTimeout(t);
  }, [levelUp, dismissLevelUp]);

  const pending = openMoment(view);
  const boss = activeBoss(view);
  const wrapped = view.status === "wrapped";
  const busy = ws.streaming || ws.bossState === "loading" || ws.storyWaiting;
  const timeUp = now !== null && now >= view.endsAt;
  const showTimePrompt = timeUp && !wrapped && !keepGoing && !busy && !pending && !boss && !view.bossOfferPending && !ws.wrap.data && !ws.wrap.loading;
  const revealed = revealedPredictions(view);

  const openDrawer = useCallback(() => {
    setDrawer(true);
    void ws.loadSessions();
  }, [ws]);

  const inputPlaceholder = boss
    ? "Finish or skip the boss challenge above to keep working…"
    : view.bossOfferPending
      ? "Or just keep typing to carry on with your work…"
    : pending
      ? "Answer the question above, or type to skip it…"
      : "Message Claude…";

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        title={view.title}
        level={user.level}
        xpGain={ws.xpGain}
        endsAt={wrapped ? undefined : view.endsAt}
        muted={!user.settings.sound}
        onToggleMute={() => void ws.changeSettings({ sound: !user.settings.sound })}
        onOpenSettings={openDrawer}
        codexHref={`/codex?from=/s/${view.id}`}
      />
      <LimitsBanner />
      <SettingsDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        settings={user.settings}
        level={user.level.level}
        unlocks={user.unlocks}
        onChange={(p) => void ws.changeSettings(p)}
        sessions={ws.sessions}
        currentSessionId={view.id}
        onOpenSession={(id) => {
          setDrawer(false);
          if (id !== view.id) router.push(`/s/${id}`);
        }}
        onResetData={() => {
          startOverAsNewUser()
            .then(() => router.replace("/?start=1"))
            .catch((err) => window.alert(errorMessage(err)));
        }}
      />
      {ws.levelUp && (
        <LevelUpToast
          from={ws.levelUp.from}
          to={ws.levelUp.to}
          rewards={ws.levelUp.rewards}
          onTryTheme={(id) => void ws.changeSettings({ theme: id })}
          onTrySoundPack={(id) => void ws.changeSettings({ soundPack: id })}
          onDismiss={ws.dismissLevelUp}
        />
      )}

      <main className="mx-auto w-full max-w-[720px] flex-1 space-y-5 px-4 pt-6 pb-10">
        {view.primer && !view.primer.dismissed && (
          <PrimerCard primer={view.primer} xp={ws.primerXp} busy={ws.primerBusy} onAnswer={ws.answerPrimer} onDismiss={ws.dismissPrimer} />
        )}
        {view.transcript.map((item) => (
          <div key={item.id} id={anchorId(item.id)} className="scroll-mt-20 rounded-card transition-shadow duration-700">
            <TranscriptEntry item={item} ws={ws} view={view} revealed={revealed} hideWrapChapter={Boolean(ws.wrap.data)} />
          </div>
        ))}

        {ws.streaming && ws.status && <StatusLine text={STATUS_LABEL[ws.status]} />}

        {view.bossOfferPending && !ws.streaming && ws.bossState !== "loading" && !boss && (
          <BossOffer onTake={ws.takeBoss} onDecline={ws.declineBoss} story={view.storyEnabled} />
        )}

        {ws.bossState === "loading" && (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border p-6 text-center" role="status">
            <AsciiBoss kind="bug" frame="full" className="text-xs opacity-60 motion-safe:animate-pulse" />
            <p className="font-semibold">A boss approaches…</p>
            <p className="text-sm text-muted">Claude is building a challenge from what you&apos;ve learned so far.</p>
          </div>
        )}
        {ws.bossState === "error" && (
          <div className="space-y-2">
            <Notice text={`The boss got lost on the way: ${ws.bossError ?? "something went wrong"}.`} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void ws.startBoss()}>Try again</Button>
            </div>
          </div>
        )}
        {ws.storyWaiting && <StoryChapterCard loading />}

        {ws.problem && !ws.streaming && (
          <div className="space-y-2">
            {ws.problem.reason === "max_steps" ? (
              <Notice text="Claude paused after a long stretch of work." />
            ) : (
              <Notice text={ws.problem.message ?? "Something went wrong. Try again."} />
            )}
            <Button size="sm" variant="primary" onClick={() => void ws.send(ws.problem!.retry)}>
              {ws.problem.reason === "max_steps" ? "Continue" : "Try again"}
            </Button>
          </div>
        )}
        {ws.notice && (
          <div className="flex items-start gap-2">
            <div className="flex-1"><Notice text={ws.notice} /></div>
            <Button size="sm" variant="quiet" onClick={ws.dismissNotice}>Dismiss</Button>
          </div>
        )}

        {showTimePrompt && (
          <div className="flex flex-col items-center gap-3 rounded-card bg-primary-soft p-5 text-center sm:flex-row sm:text-left">
            <Pip mood="happy" className="shrink-0 text-xs" />
            <p className="flex-1">That&apos;s your {view.intent.minutes} minutes. Want to wrap up and see what you learned, or keep going?</p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => void ws.wrapUp()}>Wrap up</Button>
              <Button onClick={() => setKeepGoing(true)}>Keep going</Button>
            </div>
          </div>
        )}

        {ws.wrap.loading && <StatusLine text="Pip is tallying up your session…" />}
        {ws.wrap.error && (
          <div className="space-y-2">
            <Notice text={ws.wrap.error} />
            <Button size="sm" onClick={() => void ws.wrapUp()}>Try again</Button>
          </div>
        )}
        {ws.wrap.data && (
          <div id="wrapup" className="pt-4">
            <WrapUp
              data={ws.wrap.data}
              moments={view.moments}
              gradingMomentId={Object.keys(ws.grading).find((id) => ws.grading[id])}
              helpBusy={ws.helpBusy}
              xpByMoment={ws.xpByMoment}
              onMomentAction={(id, a) => void ws.act(id, a)}
              onTryTheme={(id) => void ws.changeSettings({ theme: id })}
              onSuggestion={(s) => router.push(`/?start=1&goal=${encodeURIComponent(s)}`)}
              onNewSession={() => router.push("/?start=1")}
              onShowContext={(momentId) => showContext(view, momentId)}
              onFeedback={(helpful) => void apiPost("/api/feedback", { sessionId: view.id, helpful }).catch(() => undefined)}
              reading={ws.reading}
            />
          </div>
        )}
        {wrapped && !ws.wrap.data && !ws.wrap.loading && (
          <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-5 text-center">
            <p className="font-semibold">This session is wrapped up.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => void ws.wrapUp()}>See the wrap-up</Button>
              <Button variant="primary" onClick={() => router.push("/?start=1")}>Start a new session</Button>
            </div>
          </div>
        )}
      </main>

      {!wrapped && !ws.wrap.data && (
        <div className="sticky bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2 px-4 py-3">
            <ChatInput onSend={ws.sendMessage} disabled={busy || Boolean(boss)} placeholder={inputPlaceholder} autoFocus />
            <div className="flex justify-end">
              <Button size="sm" variant="quiet" onClick={() => void ws.wrapUp()} disabled={busy || ws.wrap.loading}>
                Wrap up session
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const anchorId = (itemId: string) => `item-${itemId.replace(/[^\w-]/g, "_")}`;

/** Scrolls to where a moment first came up and briefly highlights it. */
function showContext(view: SessionView, momentId: string) {
  const item = view.transcript.find((i) => i.kind === "moment" && i.momentId === momentId);
  const el = item && document.getElementById(anchorId(item.id));
  if (!el) return;
  // Start at Claude's lead-in right before the question, so the context is visible too.
  const target = (el.previousElementSibling as HTMLElement | null) ?? el;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.add("ring-4", "ring-accent");
  setTimeout(() => el.classList.remove("ring-4", "ring-accent"), 2500);
}

function StatusLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted" role="status">
      <Spinner label={text} className="h-4 w-4" />
      <span>{text}</span>
    </div>
  );
}

function TranscriptEntry({
  item,
  ws,
  view,
  revealed,
  hideWrapChapter,
}: {
  item: TranscriptItem;
  ws: WorkspaceApi;
  view: SessionView;
  revealed: Set<string>;
  hideWrapChapter: boolean;
}) {
  const last = view.transcript.at(-1)?.id === item.id;
  switch (item.kind) {
    case "user":
      return <UserMessage text={item.text} />;
    case "assistant_text":
      return <AssistantMessage text={item.text} sources={item.sources} streaming={ws.streaming && last} />;
    case "code_run":
      return (
        <CodeRunBlock
          sessionId={view.id}
          language={item.language}
          code={item.code}
          stdout={item.stdout}
          stderr={item.stderr}
          returnCode={item.returnCode}
          fileIds={item.fileIds}
          running={ws.streaming && item.returnCode === undefined}
        />
      );
    case "moment": {
      const m = view.moments[item.momentId];
      if (!m) return null;
      // Once the real run reveals a prediction, the card stays "locked in" and the reveal shows the verdict.
      const shown = m.type === "predict" && revealed.has(m.id) ? { ...m, status: "awaiting_prediction_result" as const } : m;
      return (
        <MomentCard
          moment={shown}
          grading={Boolean(ws.grading[m.id])}
          helpBusy={ws.helpBusy[m.id]}
          xp={ws.xpByMoment[m.id]}
          autoFocus={ws.liveIds.has(m.id) && m.status === "awaiting_answer"}
          {...momentHandlers((a) => void ws.act(m.id, a))}
        />
      );
    }
    case "prediction_reveal":
      return (
        <PredictionReveal
          prediction={view.moments[item.momentId]?.answer}
          actualResult={item.actualResult}
          verdict={item.verdict}
          why={item.why}
          xp={item.xp}
          live={ws.liveIds.has(item.id)}
        />
      );
    case "milestone":
      return <MilestoneDivider label={item.label} />;
    case "boss": {
      const boss = view.bosses[item.bossId];
      if (!boss) return null;
      const shownId = bossMomentId(boss, ws.bossShown[boss.id]);
      const moment = shownId ? view.moments[shownId] : undefined;
      const next = nextBossQuestion(boss, shownId);
      return (
        <div className="space-y-2">
          <BossCard
            boss={boss}
            moment={moment}
            grading={moment ? Boolean(ws.grading[moment.id]) : false}
            helpBusy={moment ? ws.helpBusy[moment.id] : undefined}
            xp={moment ? ws.xpByMoment[moment.id] : undefined}
            momentHandlers={momentHandlers((a) => moment && void ws.act(moment.id, a))}
            onSkip={() => void ws.skipBoss(boss.id)}
          />
          {next && (
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => ws.showBossQuestion(boss.id, next)}>Next question →</Button>
            </div>
          )}
        </div>
      );
    }
    case "story": {
      const chapter = view.chapters[item.chapterId];
      if (!chapter || (hideWrapChapter && chapter.trigger === "wrapup")) return null;
      return <StoryChapterCard chapter={chapter} live={ws.liveIds.has(chapter.id)} />;
    }
    case "notice":
      return <Notice text={item.text} />;
  }
}

/** Keeps the newest content in view while the learner is already near the bottom of the page. */
function useStickToBottom(view: SessionView, streaming: boolean) {
  const nearBottom = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      nearBottom.current = window.innerHeight + window.scrollY >= document.body.scrollHeight - 240;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const lastItem = view.transcript.at(-1);
  const size = view.transcript.length + (lastItem?.kind === "assistant_text" ? lastItem.text.length : 0);
  useLayoutEffect(() => {
    if (nearBottom.current) window.scrollTo({ top: document.body.scrollHeight });
  }, [size, streaming]);
}
