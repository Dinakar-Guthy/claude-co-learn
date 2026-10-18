/**
 * POST /api/moment/grade logic: free-form grading with MC fallback, deterministic MC grading,
 * skip/defer/report, and boss hits. See design-plan §5.3, §6.3, §7.4.
 */
import { z } from "zod";
import type { ChatRequest, GradeRequest, GradeResponse } from "@/lib/contracts/api";
import type { XpEvent } from "@/lib/contracts/engine";
import type { MomentRecord, Session } from "@/lib/contracts/session";
import { recordSkipped } from "@/lib/engine";
import { toMomentView } from "@/lib/views";
import { advanceBoss, mergeAwards } from "./boss";
import { HttpError, type BackgroundTask, type HandlerResult, type LearningDeps } from "./deps";
import { answerXpReason, resolveMoment, type Resolution } from "./resolve";
import { hitFor, isSettled } from "./scores";
import { loadOwnedSession, patchSession } from "./sessionStore";

const ids = { sessionId: z.string().min(1).max(100), momentId: z.string().min(1).max(100) };
export const GradeRequestSchema = z.union([
  z.object({ ...ids, action: z.literal("submit"), answer: z.string().max(4000) }),
  z.object({ ...ids, action: z.literal("mc"), choice: z.number().int().min(0).max(3) }),
  z.object({ ...ids, action: z.literal("show_options") }),
  z.object({ ...ids, action: z.enum(["skip", "defer", "report"]) }),
]);

const answerable = (m: MomentRecord) => m.status === "awaiting_answer" || m.status === "deferred";

interface Ctx {
  deps: LearningDeps;
  session: Session;
  record: MomentRecord;
  /** Deferred moments answered during wrap-up never continue the work loop. */
  fromWrapUp: boolean;
}

export async function handleGrade(deps: LearningDeps, anonId: string, req: GradeRequest): Promise<HandlerResult<GradeResponse>> {
  const session = await loadOwnedSession(deps, anonId, req.sessionId);
  const record = await deps.store.getMoment(session.id, req.momentId);
  if (!record) throw new HttpError(404, "Moment not found");
  const ctx: Ctx = { deps, session, record, fromWrapUp: session.status === "wrapped" || record.status === "deferred" };

  if (req.action === "report") return settleWithoutGrade(ctx, "report");
  if (!answerable(record)) throw new HttpError(409, "This moment has already been answered or set aside");

  switch (req.action) {
    case "submit":
      return submit(ctx, req.answer);
    case "mc":
      return multipleChoice(ctx, req.choice);
    case "show_options":
      return showOptions(ctx);
    default:
      return settleWithoutGrade(ctx, req.action);
  }
}

const continueWork = (ctx: Ctx): ChatRequest | undefined =>
  ctx.fromWrapUp ? undefined : { sessionId: ctx.session.id, kind: "moment_response", momentId: ctx.record.id };

const done = (body: GradeResponse, background: BackgroundTask[] = []): HandlerResult<GradeResponse> => ({ body, background });

async function submit(ctx: Ctx, rawAnswer: string): Promise<HandlerResult<GradeResponse>> {
  const { deps, session, record } = ctx;
  const answer = rawAnswer.trim();
  if (!answer) throw new HttpError(400, "Answer is empty");

  // Predictions are graded against the real run by the work loop (resolve_prediction), not here.
  if (record.type === "predict" && !record.bossId && !ctx.fromWrapUp) {
    const pending: MomentRecord = { ...record, answer, status: "awaiting_prediction_result", answeredAt: deps.now() };
    await deps.store.putMoment(pending);
    await deps.store.logEvent({ at: deps.now(), anonId: session.anonId, sessionId: session.id, name: "moment_answered", props: { momentId: record.id, type: record.type, pendingPrediction: true } });
    return done({ moment: toMomentView(pending), offerMC: false, continueWith: continueWork(ctx) });
  }

  const grade = await deps.content.gradeAnswer({ candidate: record.candidate, answer });
  const answered: MomentRecord = { ...record, answer };

  if (grade.verdict === "incorrect" && !record.mcOffered) {
    const retry: MomentRecord = { ...answered, mcOffered: true, verdict: "incorrect", why: grade.why, missingPoints: grade.missingPoints };
    await deps.store.putMoment(retry);
    await deps.store.logEvent({ at: deps.now(), anonId: session.anonId, sessionId: session.id, name: "mc_offered", props: { momentId: record.id, after: "miss" } });
    return done({ moment: toMomentView(retry), verdict: "incorrect", offerMC: true });
  }

  return finalize({ ...ctx, record: answered }, { verdict: grade.verdict, why: grade.why, missingPoints: grade.missingPoints, afterMC: false });
}

async function multipleChoice(ctx: Ctx, choice: number): Promise<HandlerResult<GradeResponse>> {
  const { options, correct_index: ci, why } = ctx.record.candidate.mc_fallback;
  if (choice >= options.length) throw new HttpError(400, "Choice out of range");
  const correct = choice === ci;
  const explanation = correct ? why[ci] : `${why[choice]} The best answer is "${options[ci]}": ${why[ci]}`;
  return finalize(
    { ...ctx, record: { ...ctx.record, mcOffered: true } },
    { verdict: correct ? "correct" : "incorrect", why: explanation, afterMC: true, mcChoice: choice },
  );
}

async function showOptions(ctx: Ctx): Promise<HandlerResult<GradeResponse>> {
  const { deps, session, record } = ctx;
  const next: MomentRecord = { ...record, mcOffered: true };
  await deps.store.putMoment(next);
  await deps.store.logEvent({ at: deps.now(), anonId: session.anonId, sessionId: session.id, name: "mc_offered", props: { momentId: record.id, after: "requested" } });
  return done({ moment: toMomentView(next), offerMC: false });
}

/** Resolves the moment (mastery, engine, XP); boss moments also land a hit. */
async function finalize(ctx: Ctx, res: Resolution): Promise<HandlerResult<GradeResponse>> {
  const { deps, session, record } = ctx;

  if (!record.bossId) {
    const events: XpEvent[] = [{ kind: "answer", verdict: res.verdict, afterMC: res.afterMC }];
    const resolved = await resolveMoment(deps, session, record, res, { events, reason: answerXpReason(res.verdict, res.afterMC) });
    return done({ moment: toMomentView(resolved.moment), verdict: res.verdict, offerMC: false, xp: resolved.xp, continueWith: continueWork(ctx) });
  }

  const hit = hitFor(res.verdict, res.afterMC);
  const events: XpEvent[] = hit > 0 ? [{ kind: "boss_hit", partial: hit < 1 }] : [];
  const resolved = await resolveMoment(deps, session, record, res, { events, reason: hit >= 1 ? "Boss hit" : "Glancing boss hit" });
  const advance = await advanceBoss(deps, session, record.bossId, hit);
  return done(
    {
      moment: toMomentView(resolved.moment),
      verdict: res.verdict,
      offerMC: false,
      xp: mergeAwards(resolved.xp, advance?.xp),
      boss: advance?.boss,
      continueWith: advance?.finished ? { sessionId: session.id, kind: "boss_result", bossId: record.bossId } : undefined,
    },
    advance?.background,
  );
}

const STATUS = { skip: "skipped", defer: "deferred", report: "reported" } as const;
const EVENT = { skip: "moment_skipped", defer: "moment_deferred", report: "moment_reported" } as const;

/** Skip, defer, or report: no mastery or XP. Boss questions can't be deferred, so defer counts as a skip there. */
async function settleWithoutGrade(ctx: Ctx, action: "skip" | "defer" | "report"): Promise<HandlerResult<GradeResponse>> {
  const { deps, session, record } = ctx;
  if (record.status === "reported") throw new HttpError(409, "Already reported");
  const wasSettled = isSettled(record) || record.status === "awaiting_prediction_result";
  const effective = record.bossId && action === "defer" ? "skip" : action;

  const next: MomentRecord = { ...record, status: STATUS[effective] };
  await deps.store.putMoment(next);
  if (session.engine.pendingMomentId === record.id) {
    await patchSession(deps, session.id, (latest) => ({ engine: recordSkipped(latest.engine, record.id) }));
  }
  await deps.store.logEvent({ at: deps.now(), anonId: session.anonId, sessionId: session.id, name: EVENT[effective], props: { momentId: record.id, type: record.type, concept: record.candidate.concept, boss: !!record.bossId } });

  if (record.bossId) {
    const advance = wasSettled ? null : await advanceBoss(deps, session, record.bossId, 0);
    return done(
      {
        moment: toMomentView(next),
        offerMC: false,
        xp: advance?.xp,
        boss: advance?.boss,
        continueWith: advance?.finished ? { sessionId: session.id, kind: "boss_result", bossId: record.bossId } : undefined,
      },
      advance?.background,
    );
  }
  // Reporting a moment the work already moved past shouldn't trigger another continuation.
  return done({ moment: toMomentView(next), offerMC: false, continueWith: wasSettled ? undefined : continueWork(ctx) });
}
