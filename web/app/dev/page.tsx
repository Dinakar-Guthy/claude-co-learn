"use client";

import { useState, type ReactNode } from "react";
import type { BossView } from "@/lib/contracts/api";
import type { UserSettings } from "@/lib/contracts/engine";
import type { MomentView } from "@/lib/contracts/moment";
import type { Intent } from "@/lib/contracts/session";
import { THEMES } from "@/lib/themes";
import { SOUND_EVENTS, SOUND_PACKS, type SoundPackId } from "@/lib/sound";
import { celebrate } from "@/lib/ui/celebrate";
import { useNow } from "@/lib/ui/useNow";
import { UiProviders } from "@/components/UiProviders";
import { useSounds } from "@/components/SoundProvider";
import { TopBar } from "@/components/TopBar";
import { XPBar } from "@/components/XPBar";
import { ChatInput } from "@/components/ChatInput";
import { AssistantMessage, MilestoneDivider, Notice, UserMessage } from "@/components/Messages";
import { CodeRunBlock } from "@/components/CodeRunBlock";
import { MomentCard, momentHandlers, type MomentAction } from "@/components/MomentCard";
import { PredictionReveal } from "@/components/PredictionReveal";
import { BossCard } from "@/components/BossCard";
import { AsciiBoss, type BossFrame, type BossKind } from "@/components/AsciiBoss";
import { StoryChapterCard } from "@/components/StoryChapterCard";
import { LevelUpToast } from "@/components/LevelUpToast";
import { WrapUp } from "@/components/WrapUp";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { IntentFlow } from "@/components/IntentFlow";
import { Pip, type PipMood } from "@/components/Pip";
import { Button, Chip } from "@/components/ui";
import { ASSISTANT_MD, BOSS, BOSS_MOMENT, CHAPTER, CODE, LEVEL, MOMENT_STATES, OPTIONS, SESSIONS, SETTINGS, STDOUT, UNLOCKS, WRAPUP, XP10 } from "./mocks";

const noop = () => {};
const NOOP_HANDLERS = momentHandlers(noop);

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-4 border-t border-border pt-8">
      <h2 className="text-sm font-bold tracking-widest text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-muted">{children}</p>;
}

/** /dev: every Track C component in every state, with mock data. Integration uses this to verify the UI. */
export default function DevPage() {
  const [settings, setSettings] = useState<UserSettings>(SETTINGS);
  const patch = (p: Partial<UserSettings>) => setSettings((s) => ({ ...s, ...p }));

  return (
    <UiProviders theme={settings.theme} sound={{ enabled: settings.sound, volume: settings.volume, pack: settings.soundPack }}>
      <Showcase settings={settings} patch={patch} />
    </UiProviders>
  );
}

function Showcase({ settings, patch }: { settings: UserSettings; patch: (p: Partial<UserSettings>) => void }) {
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(false);
  const [gain, setGain] = useState<{ amount: number; id: number } | undefined>();
  const [level, setLevel] = useState(LEVEL);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  // Counts down to the next 10-minute boundary (Date.now() can't run during prerender).
  const now = useNow(60_000);
  const endsAt = now === null ? undefined : Math.ceil((now + 1) / 600_000) * 600_000;

  function addXp(amount: number) {
    setLevel((l) => ({ ...l, xp: Math.min(l.nextLevelXp, l.xp + amount) }));
    setGain((g) => ({ amount, id: (g?.id ?? 0) + 1 }));
  }

  return (
    <div className="min-h-screen">
      <TopBar
        title="Churn model (dev showcase)"
        level={level}
        xpGain={gain}
        endsAt={endsAt}
        muted={!settings.sound}
        onToggleMute={() => patch({ sound: !settings.sound })}
        onOpenSettings={() => setDrawer(true)}
      />
      <SettingsDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        settings={settings}
        level={level.level}
        unlocks={UNLOCKS}
        onChange={patch}
        sessions={SESSIONS}
        currentSessionId="s1"
        onOpenSession={noop}
        onResetData={noop}
      />
      {toast && (
        <LevelUpToast
          from={2}
          to={3}
          rewards={[
            { level: 3, kind: "theme", id: "sunset", label: "Sunset theme" },
            { level: 3, kind: "sound_pack", id: "marimba", label: "Marimba sound pack" },
          ]}
          onTryTheme={(id) => patch({ theme: id })}
          onTrySoundPack={(id) => patch({ soundPack: id })}
          onDismiss={() => setToast(false)}
        />
      )}

      <main className="mx-auto max-w-[720px] space-y-10 px-4 py-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold">Co-learn UI kit</h1>
          <p className="text-muted">Every component in every state, with mock data. Click once anywhere to enable sound.</p>
        </header>

        <Section id="themes" title="Themes">
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <Chip key={t.id} selected={settings.theme === t.id} onClick={() => patch({ theme: t.id })}>
                {t.label} · L{t.unlockLevel}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs sm:grid-cols-8">
            {["background", "surface", "surface-2", "border", "primary", "primary-soft", "accent", "muted"].map((tok) => (
              <div key={tok} className="space-y-1 text-center">
                <div className="h-10 rounded-xl border border-border" style={{ background: `var(--${tok})` }} />
                <span className="text-muted">{tok}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="sounds" title="Sounds">
          <SoundBoard settings={settings} patch={patch} />
        </Section>

        <Section id="xp" title="Top bar, XP bar">
          <XPBar level={level} gain={gain} className="max-w-xs" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => addXp(10)}>+10 XP</Button>
            <Button size="sm" onClick={() => addXp(50)}>+50 XP</Button>
            <Button size="sm" onClick={() => setLevel(LEVEL)}>Reset</Button>
            <Button size="sm" onClick={() => setToast(true)}>Show level-up toast</Button>
            <Button size="sm" onClick={() => setDrawer(true)}>Open settings</Button>
          </div>
        </Section>

        <Section id="intent" title="Intent flow">
          <div className="rounded-card border border-dashed border-border p-6">
            <IntentFlow onComplete={setIntent} autoFocus={false} />
          </div>
          {intent && <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-xs">{JSON.stringify(intent, null, 2)}</pre>}
        </Section>

        <Section id="chat" title="Chat items">
          <UserMessage text="Help me train a model to predict customer churn from this CSV." />
          <AssistantMessage text={ASSISTANT_MD} />
          <AssistantMessage text="Training a baseline now" streaming />
          <Label>Code run (finished, long output)</Label>
          <CodeRunBlock sessionId="s1" language="python" code={CODE} stdout={STDOUT} returnCode={0} fileIds={[]} />
          <Label>Code run (running)</Label>
          <CodeRunBlock sessionId="s1" language="python" code={"model.fit(X_train, y_train)"} running />
          <Label>Code run (stderr, non-zero exit, missing chart)</Label>
          <CodeRunBlock sessionId="s1" language="bash" code="pip list | grep sklearn" stderr="ModuleNotFoundError: No module named 'xgboost'" returnCode={1} fileIds={["file_missing"]} />
          <Notice text="The environment was reset, so Claude is reloading the data." />
          <MilestoneDivider label="First model trained" />
          {sent.map((t, i) => <UserMessage key={i} text={t} />)}
          <ChatInput onSend={(t) => setSent((s) => [...s, t])} />
          <ChatInput onSend={noop} disabled placeholder="Answer the question above to continue…" />
        </Section>

        <Section id="moment-live" title="MomentCard (interactive)">
          <InteractiveMoment />
        </Section>

        <Section id="moment-states" title="MomentCard (all states)">
          {MOMENT_STATES.map((s) => (
            <div key={s.label} className="space-y-2">
              <Label>{s.label}</Label>
              <MomentCard moment={s.moment} grading={s.grading} xp={s.xp} {...NOOP_HANDLERS} />
            </div>
          ))}
        </Section>

        <Section id="prediction" title="Prediction reveal">
          <PredictionReveal prediction="about 85%" actualResult="A model that predicts *no churn* scores **84.9%** accuracy." verdict="correct" why="Accuracy rewards the majority class, so it looks great while missing every churner." xp={10} />
          <PredictionReveal prediction="It goes down steadily" actualResult="Validation loss fell until epoch 6, then **rose**." verdict="partial" why="It does fall at first; after that the model starts memorizing the training data." xp={5} />
        </Section>

        <Section id="boss" title="Boss (interactive)">
          <InteractiveBoss />
        </Section>

        <Section id="boss-states" title="Boss (outcomes)">
          <BossCard boss={{ ...BOSS, id: "b-flawless", hp: 0, outcome: "flawless" }} momentHandlers={NOOP_HANDLERS} onContinue={noop} continueLabel="Read the chapter" />
          <BossCard boss={{ ...BOSS, id: "b-slime", name: "The Leaky Slime", ascii: "slime", intro: "It oozes future information into your features.", hp: 1, outcome: "victory" }} momentHandlers={NOOP_HANDLERS} onContinue={noop} />
          <BossCard boss={{ ...BOSS, id: "b-ghost", name: "The Imbalance Ghost", ascii: "ghost", intro: "It haunts models that only see the majority.", hp: 2.5, outcome: "retreat" }} momentHandlers={NOOP_HANDLERS} onContinue={noop} />
          <div className="grid grid-cols-3 gap-4 rounded-card border border-border bg-surface p-4">
            {(["bug", "slime", "ghost"] as BossKind[]).flatMap((k) =>
              (["full", "hit", "defeated"] as BossFrame[]).map((f) => (
                <div key={`${k}-${f}`} className="space-y-1">
                  <AsciiBoss kind={k} frame={f} className="text-sm" />
                  <Label>{k} · {f}</Label>
                </div>
              )),
            )}
          </div>
        </Section>

        <Section id="story" title="Story chapter">
          <StoryChapterCard loading />
          <StoryChapterCard chapter={CHAPTER} />
        </Section>

        <Section id="pip" title="Pip">
          <div className="flex flex-wrap gap-6">
            {(["neutral", "happy", "thinking", "celebrating", "encouraging"] as PipMood[]).map((mood) => (
              <div key={mood} className="space-y-1">
                <Pip mood={mood} />
                <Label>{mood}</Label>
              </div>
            ))}
          </div>
        </Section>

        <Section id="wrapup" title="Wrap-up">
          <InteractiveWrapUp onTryTheme={(id) => patch({ theme: id })} />
        </Section>
      </main>
    </div>
  );
}

function SoundBoard({ settings, patch }: { settings: UserSettings; patch: (p: Partial<UserSettings>) => void }) {
  const sounds = useSounds();
  const [streak, setStreak] = useState(0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Chip selected={settings.sound} onClick={() => patch({ sound: !settings.sound })}>{settings.sound ? "Sound on" : "Sound off"}</Chip>
        <label className="flex items-center gap-2 text-sm text-muted">
          Volume
          <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => patch({ volume: Number(e.target.value) })} className="accent-primary" />
        </label>
        <Button size="sm" onClick={() => { sounds.playVerdict("correct"); setStreak((s) => s + 1); }}>Correct (streak {streak})</Button>
        <Button size="sm" onClick={() => { sounds.playVerdict("incorrect"); setStreak(0); }}>Miss (reset streak)</Button>
        <Button size="sm" onClick={() => void celebrate(`dev:${Date.now()}`, "levelUp")}>Confetti</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-muted">Pack</th>
              {SOUND_EVENTS.map((e) => <th key={e} className="px-1 py-1 text-xs font-semibold text-muted">{e}</th>)}
            </tr>
          </thead>
          <tbody>
            {SOUND_PACKS.map((p) => (
              <tr key={p.id}>
                <td className="px-2 py-1 font-semibold whitespace-nowrap">{p.label}</td>
                {SOUND_EVENTS.map((e) => (
                  <td key={e} className="px-1 py-1">
                    <button
                      type="button"
                      aria-label={`Play ${e} in ${p.label}`}
                      onClick={() => sounds.play(e, { pack: p.id as SoundPackId, streak: e === "streak" ? 4 : undefined })}
                      className="h-8 w-8 rounded-full border border-border bg-surface text-xs hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      ▶
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Fake grader: answers mentioning "recall" are correct; others get "Not quite" + options. */
function useFakeMoment(initial: MomentView) {
  const [moment, setMoment] = useState<MomentView>(initial);
  const [grading, setGrading] = useState(false);
  const later = (fn: () => void) => { setGrading(true); setTimeout(() => { setGrading(false); fn(); }, 900); };

  function act(a: MomentAction) {
    switch (a.kind) {
      case "submit":
        return later(() =>
          setMoment((m) =>
            /recall/i.test(a.answer)
              ? { ...m, answer: a.answer, status: "answered", verdict: "correct", why: "Recall measures how many churners we catch.", xp: 10 }
              : { ...m, answer: a.answer, verdict: "incorrect", why: "That metric can look great while missing most churners.", mcOptions: OPTIONS },
          ),
        );
      case "show_options":
        return setMoment((m) => ({ ...m, mcOptions: OPTIONS }));
      case "mc":
        return setMoment((m) => ({ ...m, status: "answered", mcChoice: a.choice, correctIndex: 1, verdict: a.choice === 1 ? "correct" : "incorrect", why: "Recall catches the most churners, which is what matters when misses are costly.", xp: a.choice === 1 ? 5 : 0 }));
      case "skip":
        return setMoment((m) => ({ ...m, status: "skipped" }));
      case "defer":
        return setMoment((m) => ({ ...m, status: "deferred" }));
      case "report":
        return setMoment((m) => ({ ...m, status: "reported" }));
    }
  }
  return { moment, grading, act, reset: () => { setMoment(initial); setGrading(false); } };
}

function InteractiveMoment() {
  const { moment, grading, act, reset } = useFakeMoment(MOMENT_STATES[0].moment);
  return (
    <div className="space-y-2">
      <Label>Try: answer with &quot;recall&quot; (correct) or anything else (Not quite → options).</Label>
      <MomentCard moment={moment} grading={grading} xp={moment.verdict === "correct" && moment.mcChoice === undefined ? XP10 : undefined} {...momentHandlers(act)} />
      <Button size="sm" onClick={reset}>Reset</Button>
    </div>
  );
}

function InteractiveBoss() {
  const [boss, setBoss] = useState<BossView>(BOSS);
  const [q, setQ] = useState<MomentView>(BOSS_MOMENT);
  const [grading, setGrading] = useState(false);
  const hit = (amount: number) =>
    setBoss((b) => {
      const hp = Math.max(0, b.hp - amount);
      return { ...b, hp, outcome: hp === 0 ? (b.hp === b.maxHp && amount >= b.maxHp ? "flawless" : "victory") : b.outcome };
    });

  function act(a: MomentAction) {
    if (a.kind === "submit") {
      setGrading(true);
      setTimeout(() => {
        setGrading(false);
        setQ((m) => ({ ...m, answer: a.answer, status: "answered", verdict: "correct", why: "Overfitting: the model memorized training data. Regularize or simplify first.", xp: 15 }));
        hit(1);
      }, 900);
    } else if (a.kind === "skip") setQ((m) => ({ ...m, status: "skipped" }));
  }

  return (
    <div className="space-y-3">
      <BossCard boss={boss} moment={q} grading={grading} momentHandlers={momentHandlers(act)} onContinue={() => { setBoss(BOSS); setQ(BOSS_MOMENT); }} continueLabel="Fight again" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => hit(1)}>Hit</Button>
        <Button size="sm" onClick={() => hit(0.5)}>Half hit</Button>
        <Button size="sm" onClick={() => setBoss((b) => ({ ...b, outcome: "retreat" }))}>Retreat</Button>
        <Button size="sm" onClick={() => setQ({ ...BOSS_MOMENT, id: "bq2", question: "Name one way to check for overfitting before you see test data." })}>Next question</Button>
        <Button size="sm" onClick={() => { setBoss(BOSS); setQ(BOSS_MOMENT); }}>Reset</Button>
      </div>
    </div>
  );
}

function InteractiveWrapUp({ onTryTheme }: { onTryTheme: (id: string) => void }) {
  const { moment, grading, act } = useFakeMoment(WRAPUP.deferred[0]);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <WrapUp
        data={WRAPUP}
        moments={{ [moment.id]: moment }}
        gradingMomentId={grading ? moment.id : undefined}
        onMomentAction={(_id, a) => act(a)}
        onTryTheme={onTryTheme}
        onSuggestion={setPicked}
        onNewSession={() => setPicked("(new session)")}
      />
      {picked && <Notice text={`Picked: ${picked}`} />}
      <Label>Chapter still generating:</Label>
      <StoryChapterCard loading />
    </div>
  );
}
