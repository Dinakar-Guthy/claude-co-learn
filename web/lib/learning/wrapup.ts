/** POST /api/wrapup logic: mark wrapped, completion XP (once), codex + suggestions, final chapter. */
import type { WrapUpResponse } from "@/lib/contracts/api";
import type { WrapUpDraft } from "@/lib/contracts/content";
import type { MomentRecord, Session, StoryChapter } from "@/lib/contracts/session";
import { classifyConcepts } from "@/lib/claude/content/wrapup";
import { toMomentView, toUserView } from "@/lib/views";
import type { HandlerResult, LearningDeps } from "./deps";
import { momentScore } from "./scores";
import { loadOwnedSession, patchSession } from "./sessionStore";
import { addChapter } from "./story";
import { workSummary } from "./workSummary";
import { awardXp, loadUser } from "./xp";

export function outcomesFrom(moments: MomentRecord[]): { concept: string; type: string; score: number }[] {
  return moments.flatMap((m) => {
    const score = momentScore(m);
    return score === null ? [] : [{ concept: m.candidate.concept, type: m.type, score }];
  });
}

/** Deterministic codex used if the wrap-up model call fails, so wrap-up never dead-ends. */
export function fallbackWrapUp(outcomes: ReturnType<typeof outcomesFrom>): WrapUpDraft {
  return {
    codex: classifyConcepts(outcomes).map((c) => ({
      concept: c.concept,
      summary: c.result === "strong" ? "You applied this confidently." : c.result === "growing" ? "You're getting there; one more rep will lock it in." : "Worth another look next session.",
      result: c.result,
    })),
    suggestions: ["Pick up where you left off and revisit the concepts marked for review"],
  };
}

export function sessionXp(deps: LearningDeps, session: Session, moments: MomentRecord[]): number {
  const momentXp = moments.reduce((sum, m) => sum + (m.xp ?? 0), 0);
  const bossXp = session.engine.bosses.reduce((sum, b) => sum + (b.outcome ? deps.engine.xpFor({ kind: "boss_outcome", outcome: b.outcome }) : 0), 0);
  return momentXp + bossXp + deps.engine.xpFor({ kind: "session_complete" });
}

export async function handleWrapUp(deps: LearningDeps, anonId: string, sessionId: string): Promise<HandlerResult<WrapUpResponse>> {
  const session = await loadOwnedSession(deps, anonId, sessionId);
  const firstWrap = session.status !== "wrapped";
  const levelUps: WrapUpResponse["levelUps"] = [];

  if (firstWrap) {
    await patchSession(deps, sessionId, () => ({ status: "wrapped" }));
    const award = await awardXp(deps, anonId, sessionId, [{ kind: "session_complete" }], "Session complete");
    if (award?.levelUp) levelUps.push(award.levelUp);
  }

  const [moments, transcript] = await Promise.all([deps.store.listMoments(sessionId), deps.store.getTranscript(sessionId)]);
  const outcomes = outcomesFrom(moments);

  const [draft, chapter] = await Promise.all([
    deps.content
      .generateWrapUp({ intent: session.intent, outcomes, workSummary: workSummary(transcript, 2000) })
      .catch(() => fallbackWrapUp(outcomes)),
    addChapter(deps, sessionId, "wrapup", "wrapup").catch((): StoryChapter | null => null),
  ]);

  const latest = (await deps.store.getSession(sessionId)) ?? session;
  if (firstWrap) {
    await deps.store.logEvent({ at: deps.now(), anonId, sessionId, name: "session_wrapped", props: { moments: moments.length, answered: outcomes.length } });
  }

  return {
    body: {
      deferred: (await asWrapUpQuestions(deps, moments.filter((m) => m.status === "deferred"))).map(toMomentView),
      codex: draft.codex,
      sessionXp: sessionXp(deps, latest, moments),
      user: toUserView(await loadUser(deps, anonId)),
      chapter: chapter ?? undefined,
      suggestions: draft.suggestions,
      levelUps,
    },
    background: [],
  };
}

/**
 * A saved *predict* question can't be graded against "the next run" anymore (the work moved on), so at wrap-up
 * it becomes "what actually happened, and why?", graded against the session log (Dinakar, 2026-10-18).
 */
export async function asWrapUpQuestions(deps: LearningDeps, deferred: MomentRecord[]): Promise<MomentRecord[]> {
  const out: MomentRecord[] = [];
  for (const m of deferred) {
    if (m.type !== "predict" || m.bossId || m.explainAtWrapUp) {
      out.push(m);
      continue;
    }
    const next: MomentRecord = {
      ...m,
      type: "explain_back",
      explainAtWrapUp: true,
      candidate: {
        ...m.candidate,
        type: "explain_back",
        question: `Earlier, before running the code, you were asked to predict: "${m.candidate.question}" Now that the work has run, what actually happened, and why?`,
      },
    };
    await deps.store.putMoment(next);
    out.push(next);
  }
  return out;
}
