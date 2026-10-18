/** Resolving a graded moment: record the verdict, update mastery and engine state, award XP. */
import type { XpEvent } from "@/lib/contracts/engine";
import type { Verdict } from "@/lib/contracts/moment";
import type { MomentRecord, Session } from "@/lib/contracts/session";
import type { XpAward } from "@/lib/contracts/stream";
import type { LearningDeps } from "./deps";
import { scoreFor } from "./scores";
import { patchSession } from "./sessionStore";
import { awardXp } from "./xp";

export interface Resolution {
  verdict: Verdict;
  why: string;
  afterMC: boolean;
  missingPoints?: string[];
  mcChoice?: number;
}

export interface Resolved {
  moment: MomentRecord;
  score: number;
  xp?: XpAward;
}

export const answerXpReason = (verdict: Verdict, afterMC: boolean) =>
  verdict === "correct" ? (afterMC ? "Correct with options" : "Correct answer") : verdict === "partial" ? "Partly right" : "Answer";

export async function resolveMoment(
  deps: LearningDeps,
  session: Session,
  record: MomentRecord,
  res: Resolution,
  xp: { events: XpEvent[]; reason: string },
): Promise<Resolved> {
  const now = deps.now();
  const score = scoreFor(res.verdict, res.afterMC);
  const { concept, difficulty } = record.candidate;

  const mastery = await deps.store.getMastery(session.anonId);
  const nextMastery = deps.engine.updateMastery(mastery[concept], score, difficulty, session.intent.familiarity, now);
  await deps.store.putMastery(session.anonId, concept, nextMastery);

  await patchSession(deps, session.id, (latest) => ({
    engine: deps.engine.recordOutcome(latest.engine, { momentId: record.id, concept, type: record.type, score, at: now }),
  }));

  const award = await awardXp(deps, session.anonId, session.id, xp.events, xp.reason);

  const moment: MomentRecord = {
    ...record,
    status: "answered",
    verdict: res.verdict,
    why: res.why,
    missingPoints: res.missingPoints,
    mcChoice: res.mcChoice ?? record.mcChoice,
    xp: award?.amount ?? 0,
    answeredAt: now,
  };
  await deps.store.putMoment(moment);
  await deps.store.logEvent({
    at: now,
    anonId: session.anonId,
    sessionId: session.id,
    name: "moment_answered",
    props: { momentId: record.id, type: record.type, concept, verdict: res.verdict, afterMC: res.afterMC, score, boss: !!record.bossId },
  });
  return { moment, score, xp: award };
}
