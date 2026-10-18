/**
 * POST /api/moment/help: learner-requested help on one question (decision log 2026-10-18).
 * - hint: up to 2 per question (bosses: hints only).
 * - teach: one short lesson; the learner then answers the original question.
 * - ask: a small thread. Before an attempt, a request for the answer is declined once; asking again reveals
 *   it and closes the question as "revealed" (no credit, the concept goes to review).
 * Help used before the final answer sets `help.level`, which reduces credit when the answer is graded.
 */
import { z } from "zod";
import type { ChatRequest, HelpRequest, HelpResponse } from "@/lib/contracts/api";
import type { HelpContext } from "@/lib/contracts/content";
import type { HelpLevel, HelpMessage } from "@/lib/contracts/moment";
import type { MomentRecord, Session } from "@/lib/contracts/session";
import { thetaOf } from "@/lib/engine/mastery";
import { toMomentView } from "@/lib/views";
import { HttpError, type HandlerResult, type LearningDeps } from "./deps";
import { loadOwnedSession, patchSession } from "./sessionStore";
import { workSummary } from "./workSummary";

export const MAX_HINTS = 2;
export const MAX_QUESTIONS = 8;
export const MAX_MESSAGE_CHARS = 1000;

const ids = { sessionId: z.string().min(1).max(100), momentId: z.string().min(1).max(100) };
export const HelpRequestSchema = z.union([
  z.object({ ...ids, action: z.enum(["hint", "teach"]) }),
  z.object({ ...ids, action: z.literal("ask"), text: z.string().trim().min(1, "Type a question").max(MAX_MESSAGE_CHARS) }),
]);

type Help = NonNullable<MomentRecord["help"]>;

const emptyHelp = (): Help => ({ hints: [], thread: [] });

/** Still open for an answer (help used now counts toward reduced credit). */
const open = (m: MomentRecord) => m.status === "awaiting_answer" || m.status === "deferred";

/** The learner tried (free-form or an option), or the answer is already out. */
export const attempted = (m: MomentRecord) =>
  m.answer !== undefined || m.mcChoice !== undefined || m.status === "answered" || m.status === "skipped" || m.status === "revealed";

const LEVEL_RANK: Record<HelpLevel, number> = { hint: 1, teach: 2 };
export const raiseLevel = (current: HelpLevel | undefined, next: HelpLevel): HelpLevel =>
  current && LEVEL_RANK[current] >= LEVEL_RANK[next] ? current : next;

const done = (body: HelpResponse): HandlerResult<HelpResponse> => ({ body, background: [] });

export async function handleHelp(deps: LearningDeps, anonId: string, req: HelpRequest): Promise<HandlerResult<HelpResponse>> {
  const session = await loadOwnedSession(deps, anonId, req.sessionId);
  const record = await deps.store.getMoment(session.id, req.momentId);
  if (!record) throw new HttpError(404, "Moment not found");
  if (record.status === "reported") throw new HttpError(409, "This question was reported");
  if (record.bossId && req.action !== "hint") throw new HttpError(400, "Boss questions offer hints only");

  const help: Help = { ...emptyHelp(), ...record.help };
  const context = await helpContext(deps, session, record, help);

  switch (req.action) {
    case "hint": {
      if (!open(record)) throw new HttpError(409, "This question is already answered");
      if (help.hints.length >= MAX_HINTS) return done({ moment: toMomentView(record) });
      const { hint } = await deps.content.generateHint(context);
      const next = await save(deps, record, { ...help, hints: [...help.hints, hint], level: raiseLevel(help.level, "hint") });
      await log(deps, session, record, "help_hint");
      return done({ moment: toMomentView(next) });
    }
    case "teach": {
      if (!open(record)) throw new HttpError(409, "This question is already answered");
      if (help.lesson) return done({ moment: toMomentView(record) });
      const { lesson } = await deps.content.teachConcept(context);
      const next = await save(deps, record, { ...help, lesson, level: raiseLevel(help.level, "teach") });
      await log(deps, session, record, "help_teach");
      return done({ moment: toMomentView(next) });
    }
    case "ask":
      return ask(deps, session, record, help, context, req.text.trim());
  }
}

async function ask(deps: LearningDeps, session: Session, record: MomentRecord, help: Help, context: HelpContext, text: string): Promise<HandlerResult<HelpResponse>> {
  if (help.thread.filter((t) => t.role === "learner").length >= MAX_QUESTIONS) {
    throw new HttpError(429, "That's a lot of questions on this one! Try answering it, or skip it for now.");
  }
  const tried = attempted(record);
  const { reply, wantsAnswer } = await deps.content.askTutor({ ...context, message: text, declinedBefore: Boolean(help.declinedReveal) });
  const now = deps.now();
  const thread: HelpMessage[] = [...help.thread, { role: "learner", text, at: now }, { role: "claude", text: reply, at: now }];
  const nextHelp: Help = {
    ...help,
    thread,
    // Help only reduces credit while the question is still open.
    level: open(record) ? raiseLevel(help.level, "teach") : help.level,
    declinedReveal: help.declinedReveal || (wantsAnswer && !tried),
  };
  await log(deps, session, record, "help_ask");

  // Second request for the answer before any attempt: reveal it and close the question.
  if (wantsAnswer && !tried && help.declinedReveal && open(record)) {
    const revealed = await reveal(deps, session, { ...record, help: nextHelp });
    const continueWith: ChatRequest | undefined =
      session.status === "wrapped" || record.status === "deferred" || record.bossId ? undefined : { sessionId: session.id, kind: "moment_response", momentId: record.id };
    return done({ moment: toMomentView(revealed), continueWith });
  }
  const next = await save(deps, record, nextHelp);
  return done({ moment: toMomentView(next) });
}

/** Closes a question as revealed: no XP, a zero score for mastery (it goes to review), pending cleared. */
async function reveal(deps: LearningDeps, session: Session, record: MomentRecord): Promise<MomentRecord> {
  const now = deps.now();
  const { concept, difficulty } = record.candidate;
  const mastery = await deps.store.getMastery(session.anonId);
  const updated = deps.engine.updateMastery(mastery[concept], 0, difficulty, session.intent.familiarity, now);
  await deps.store.putMastery(session.anonId, concept, updated);
  await patchSession(deps, session.id, (latest) => {
    const engine = deps.engine.recordOutcome(latest.engine, { momentId: record.id, concept, type: record.type, score: 0, at: now });
    return { engine: { ...engine, pendingMomentId: engine.pendingMomentId === record.id ? undefined : engine.pendingMomentId } };
  });
  const next: MomentRecord = { ...record, status: "revealed", xp: 0, answeredAt: now, masteryDelta: updated.theta - thetaOf(mastery[concept], session.intent.familiarity) };
  await deps.store.putMoment(next);
  await log(deps, session, record, "moment_revealed");
  return next;
}

async function helpContext(deps: LearningDeps, session: Session, record: MomentRecord, help: Help): Promise<HelpContext> {
  const transcript = await deps.store.getTranscript(session.id);
  return {
    candidate: record.candidate,
    attempted: attempted(record),
    answer: record.answer,
    hints: help.hints,
    lesson: help.lesson,
    thread: help.thread.map(({ role, text }) => ({ role, text })),
    workContext: workSummary(transcript, 1500),
  };
}

async function save(deps: LearningDeps, record: MomentRecord, help: Help): Promise<MomentRecord> {
  const next = { ...record, help };
  await deps.store.putMoment(next);
  return next;
}

function log(deps: LearningDeps, session: Session, record: MomentRecord, name: "help_hint" | "help_teach" | "help_ask" | "moment_revealed") {
  return deps.store.logEvent({
    at: deps.now(),
    anonId: session.anonId,
    sessionId: session.id,
    name,
    props: { momentId: record.id, type: record.type, concept: record.candidate.concept, boss: !!record.bossId },
  });
}
