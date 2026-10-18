/** Boss lifecycle: start (generate + verify questions), hits, and the outcome (design-plan §7.4). */
import type { GradeResponse, SkipBossResponse, StartBossResponse } from "@/lib/contracts/api";
import type { LearningMomentInput } from "@/lib/contracts/moment";
import type { BossState, MomentRecord, Session } from "@/lib/contracts/session";
import type { XpAward } from "@/lib/contracts/stream";
import { recordBossFinished, recordBossStarted } from "@/lib/engine";
import { toBossView, toMomentView } from "@/lib/views";
import { HttpError, type BackgroundTask, type HandlerResult, type LearningDeps } from "./deps";
import { isSettled } from "./scores";
import { appendTranscript, patchSession } from "./sessionStore";
import { addChapter } from "./story";
import { recentMisconceptions, workSummary } from "./workSummary";
import { awardXp } from "./xp";

const BOSS_OUTCOME_LABEL = { flawless: "Flawless boss win", victory: "Boss defeated", retreat: "The boss retreats", skipped: "Boss skipped" } as const;

function distinctRecent(values: string[], limit: number): string[] {
  const out: string[] = [];
  for (let i = values.length - 1; i >= 0 && out.length < limit; i--) if (!out.includes(values[i])) out.push(values[i]);
  return out.reverse();
}

/** Concepts for the boss: practised since the last boss, else the most recent outcomes, else the sketch's radar. */
export function bossConcepts(session: Session): string[] {
  if (session.engine.conceptsSinceBoss.length) return [...new Set(session.engine.conceptsSinceBoss)];
  const recent = distinctRecent(session.engine.recentOutcomes.map((o) => o.concept), 4);
  if (recent.length) return recent;
  return (session.sketch?.conceptRadar ?? []).slice(0, 3).map((c) => c.concept);
}

/** Keeps verified questions; if verification rejects (or fails on) everything, keeps the originals rather than blocking the boss. */
async function verifiedQuestions(deps: LearningDeps, questions: LearningMomentInput[]): Promise<LearningMomentInput[]> {
  const checks = await Promise.all(
    questions.map((candidate) => deps.content.verifyMoment({ candidate }).catch(() => ({ ok: true as const }))),
  );
  const passed = questions.filter((_, i) => checks[i].ok);
  return passed.length ? passed : questions;
}

async function activeBoss(deps: LearningDeps, session: Session): Promise<StartBossResponse | null> {
  const open = [...session.engine.bosses].reverse().find((b) => !b.outcome);
  if (!open) return null;
  const boss = await deps.store.getBoss(session.id, open.id);
  if (!boss || boss.outcome) return null;
  const moments = (await deps.store.listMoments(session.id)).filter((m) => m.bossId === boss.id);
  if (moments.every(isSettled)) return null;
  return { boss: toBossView(boss, moments), moments: Object.fromEntries(moments.map((m) => [m.id, toMomentView(m)])) };
}

export async function startBoss(deps: LearningDeps, session: Session): Promise<HandlerResult<StartBossResponse>> {
  const existing = await activeBoss(deps, session);
  if (existing) return { body: existing, background: [] };

  const [transcript, allMoments] = await Promise.all([deps.store.getTranscript(session.id), deps.store.listMoments(session.id)]);
  const familiarity = session.intent.familiarity;
  const draft = await deps.content.generateBoss({
    intent: session.intent,
    familiarity,
    concepts: bossConcepts(session),
    workSummary: workSummary(transcript, 2000),
    misconceptions: recentMisconceptions(allMoments),
    targetDifficulty: deps.engine.targetDifficulty(undefined, "boss", familiarity, session.engine.recentOutcomes),
  });
  const questions = await verifiedQuestions(deps, draft.questions);

  const now = deps.now();
  const bossId = deps.newId();
  // createdAt offsets keep the questions in order (listMoments sorts by createdAt).
  const records: MomentRecord[] = questions.map((candidate, i) => ({
    id: deps.newId(),
    sessionId: session.id,
    createdAt: now + i,
    type: "boss",
    candidate,
    bossId,
    status: "awaiting_answer",
    mcOffered: false,
  }));
  const boss: BossState = {
    id: bossId,
    sessionId: session.id,
    name: draft.name,
    ascii: draft.ascii,
    intro: draft.intro,
    maxHp: records.length,
    hp: records.length,
    momentIds: records.map((r) => r.id),
    createdAt: now,
  };

  for (const r of records) await deps.store.putMoment(r);
  await deps.store.putBoss(boss);
  const concepts = [...new Set(questions.map((q) => q.concept))];
  await patchSession(deps, session.id, (latest) => ({
    engine: { ...recordBossStarted(latest.engine, { id: bossId, startedAt: now, concepts }), bossOfferPending: false },
  }));
  await appendTranscript(deps, session.id, { kind: "boss", id: `boss-${bossId}`, bossId });
  await deps.store.logEvent({ at: now, anonId: session.anonId, sessionId: session.id, name: "boss_started", props: { bossId, questions: records.length, name: boss.name } });

  return {
    body: { boss: toBossView(boss, records), moments: Object.fromEntries(records.map((r) => [r.id, toMomentView(r)])) },
    background: [],
  };
}

export interface BossAdvance {
  boss: NonNullable<GradeResponse["boss"]>;
  xp?: XpAward;
  finished: boolean;
  background: BackgroundTask[];
}

/** Applies a hit (0, 0.5 or 1) after one of the boss's moments settles, finishing the boss when all are settled. */
export async function advanceBoss(deps: LearningDeps, session: Session, bossId: string, hit: number): Promise<BossAdvance | null> {
  const boss = await deps.store.getBoss(session.id, bossId);
  if (!boss) return null;
  const moments = (await deps.store.listMoments(session.id)).filter((m) => m.bossId === bossId);
  const updated: BossState = { ...boss, hp: Math.max(0, boss.hp - hit) };
  const nextMomentId = boss.momentIds.find((id) => moments.find((m) => m.id === id && !isSettled(m)));
  const done = !nextMomentId;
  const background: BackgroundTask[] = [];
  let xp: XpAward | undefined;

  if (done && !boss.outcome) {
    const hits = updated.maxHp - updated.hp;
    const outcome = deps.engine.bossOutcome(hits, updated.maxHp);
    updated.outcome = outcome;
    xp = await awardXp(deps, session.anonId, session.id, [{ kind: "boss_outcome", outcome }], BOSS_OUTCOME_LABEL[outcome]);
    await patchSession(deps, session.id, (latest) => ({ engine: recordBossFinished(latest.engine, bossId, outcome) }));
    await deps.store.logEvent({ at: deps.now(), anonId: session.anonId, sessionId: session.id, name: "boss_finished", props: { bossId, outcome, hits, maxHp: updated.maxHp } });
    background.push(async () => {
      await addChapter(deps, session.id, `boss:${bossId}`, "boss", outcome);
    });
  }
  await deps.store.putBoss(updated);

  return {
    boss: { bossId, hp: updated.hp, maxHp: updated.maxHp, done, outcome: updated.outcome, nextMomentId },
    xp,
    finished: done,
    background,
  };
}

/** Combines the hit award and the outcome award into the single XpAward a response carries. */
export function mergeAwards(a: XpAward | undefined, b: XpAward | undefined): XpAward | undefined {
  if (!a || !b) return a ?? b;
  const levelUp =
    a.levelUp && b.levelUp
      ? { from: a.levelUp.from, to: b.levelUp.to, rewards: [...a.levelUp.rewards, ...b.levelUp.rewards] }
      : (a.levelUp ?? b.levelUp);
  return { amount: a.amount + b.amount, reason: `${a.reason} + ${b.reason}`, level: b.level, ...(levelUp ? { levelUp } : {}) };
}

/**
 * "Skip this boss" (Dinakar, 2026-10-18): closes the remaining questions in one click. Answers already given
 * keep their XP; the skipped part earns nothing, there's no story chapter, and the work resumes right away.
 */
export async function skipBoss(deps: LearningDeps, session: Session, bossId: string): Promise<HandlerResult<SkipBossResponse>> {
  const boss = await deps.store.getBoss(session.id, bossId);
  if (!boss) throw new HttpError(404, "Boss not found");
  let moments = (await deps.store.listMoments(session.id)).filter((m) => m.bossId === bossId);
  let final = boss;

  if (!boss.outcome) {
    moments = moments.map((m) => (isSettled(m) ? m : { ...m, status: "skipped" as const }));
    for (const m of moments) await deps.store.putMoment(m);
    final = { ...boss, outcome: "skipped" };
    await deps.store.putBoss(final);
    await patchSession(deps, session.id, (latest) => ({ engine: recordBossFinished(latest.engine, bossId, "skipped") }));
    await deps.store.logEvent({
      at: deps.now(),
      anonId: session.anonId,
      sessionId: session.id,
      name: "boss_skipped",
      props: { bossId, questions: moments.length },
    });
  }

  return {
    body: {
      boss: toBossView(final, moments),
      moments: Object.fromEntries(moments.map((m) => [m.id, toMomentView(m)])),
      continueWith: { sessionId: session.id, kind: "boss_result", bossId },
    },
    background: [],
  };
}
