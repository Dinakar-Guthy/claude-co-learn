/**
 * Pure SessionView updates for the workspace page. Live results from the JSON routes (grade, boss, story)
 * are folded in with the same item ids the server persists, so a reload renders the same transcript.
 */
import type { BossView, GradeResponse, SessionView, StartBossResponse } from "@/lib/contracts/api";
import type { MomentView } from "@/lib/contracts/moment";
import type { StoryChapter, TranscriptItem } from "@/lib/contracts/session";
import type { ChatStreamEvent } from "@/lib/contracts/stream";
import { applyEvent } from "./transcript";

const addItemOnce = (items: TranscriptItem[], item: TranscriptItem) => (items.some((i) => i.id === item.id) ? items : [...items, item]);

export const bossItemId = (bossId: string) => `boss-${bossId}`;
export const storyItemId = (chapterId: string) => `story-${chapterId}`;
export const bossTrigger = (bossId: string) => `boss:${bossId}`;

/** Applies one chat stream event: transcript items plus any moment view it carries. */
export function applyStreamEvent(view: SessionView, event: ChatStreamEvent): SessionView {
  const transcript = applyEvent(view.transcript, event);
  if (event.type === "moment") {
    return { ...view, transcript, moments: { ...view.moments, [event.moment.id]: event.moment } };
  }
  if (event.type === "prediction_reveal") {
    const m = view.moments[event.momentId];
    const moments = m ? { ...view.moments, [m.id]: { ...m, status: "answered" as const, verdict: event.verdict, why: event.why, xp: event.xp.amount } } : view.moments;
    return { ...view, transcript, moments };
  }
  return transcript === view.transcript ? view : { ...view, transcript };
}

export function mergeMoments(view: SessionView, moments: Record<string, MomentView> | MomentView[]): SessionView {
  const list = Array.isArray(moments) ? moments : Object.values(moments);
  if (!list.length) return view;
  return { ...view, moments: { ...view.moments, ...Object.fromEntries(list.map((m) => [m.id, m])) } };
}

/** Folds a grade response into the view (the moment, and the boss's HP/outcome/next question). */
export function applyGrade(view: SessionView, res: GradeResponse): SessionView {
  let next = mergeMoments(view, [res.moment]);
  if (res.boss) {
    const prev = next.bosses[res.boss.bossId];
    if (prev) {
      const boss: BossView = {
        ...prev,
        hp: res.boss.hp,
        maxHp: res.boss.maxHp,
        outcome: res.boss.outcome ?? prev.outcome,
        currentMomentId: res.boss.done ? undefined : res.boss.nextMomentId,
      };
      next = { ...next, bosses: { ...next.bosses, [boss.id]: boss } };
    }
  }
  return next;
}

export function applyBossStart(view: SessionView, res: StartBossResponse): SessionView {
  const next = mergeMoments(view, res.moments);
  return {
    ...next,
    bosses: { ...next.bosses, [res.boss.id]: res.boss },
    transcript: addItemOnce(next.transcript, { kind: "boss", id: bossItemId(res.boss.id), bossId: res.boss.id }),
  };
}

export function addChapter(view: SessionView, chapter: StoryChapter): SessionView {
  return {
    ...view,
    chapters: { ...view.chapters, [chapter.id]: chapter },
    transcript: addItemOnce(view.transcript, { kind: "story", id: storyItemId(chapter.id), chapterId: chapter.id }),
  };
}

export function appendUserMessage(view: SessionView, id: string, text: string, at: number): SessionView {
  return { ...view, transcript: [...view.transcript, { kind: "user", id, text, at }] };
}

/**
 * The boss question to display: the one the learner is looking at (kept after answering so its feedback stays
 * visible), else the server's current question, else the last one.
 */
export function bossMomentId(boss: BossView, shown: string | undefined): string | undefined {
  if (shown && boss.momentIds.includes(shown)) return shown;
  return boss.currentMomentId ?? boss.momentIds.at(-1);
}

/** The next unanswered boss question after the displayed one, if the learner still has to move on to it. */
export function nextBossQuestion(boss: BossView, shownId: string | undefined): string | undefined {
  if (boss.outcome || !boss.currentMomentId || boss.currentMomentId === shownId) return undefined;
  return boss.currentMomentId;
}

/** A work moment the learner still has to answer (input stays usable; typing instead skips it). */
export function openMoment(view: SessionView): MomentView | undefined {
  for (let i = view.transcript.length - 1; i >= 0; i--) {
    const item = view.transcript[i];
    if (item.kind === "moment") {
      const m = view.moments[item.momentId];
      return m && m.status === "awaiting_answer" ? m : undefined;
    }
  }
  return undefined;
}

/** An unfinished boss in the transcript (blocks chatting until it's done, like any challenge in flight). */
export function activeBoss(view: SessionView): BossView | undefined {
  return Object.values(view.bosses).find((b) => !b.outcome);
}

/** Moments whose prediction has been revealed by a prediction_reveal item. */
export function revealedPredictions(view: SessionView): Set<string> {
  return new Set(view.transcript.flatMap((i) => (i.kind === "prediction_reveal" ? [i.momentId] : [])));
}

/**
 * Keeps locally-known state that a server re-sync could momentarily miss (e.g. a boss that finished while
 * the sync was in flight). The server view wins otherwise.
 */
export function reconcile(local: SessionView, server: SessionView): SessionView {
  const bosses = { ...server.bosses };
  for (const [id, b] of Object.entries(local.bosses)) {
    if (!bosses[id] || (b.outcome && !bosses[id].outcome)) bosses[id] = b;
  }
  return { ...server, bosses, moments: { ...local.moments, ...server.moments } };
}
