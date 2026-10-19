/**
 * Validates a ChatRequest against stored state before any streaming starts, so failures map to HTTP statuses.
 */
import { z } from "zod";
import type { ChatRequest } from "@/lib/contracts/api";
import type { Session, User } from "@/lib/contracts/session";
import type { Store } from "@/lib/contracts/store";
import { newUser } from "@/lib/store/defaults";
import { isPausedAssistant } from "./blocks";
import { bossDeclinedText, bossResultText, continueText, momentResponseText } from "./userText";
import { modeOf } from "@/lib/modes";

export { isPausedAssistant } from "./blocks";

export const MAX_MESSAGE_CHARS = 4000;

const id = z.string().min(1).max(100);
export const ChatRequestSchema = z.discriminatedUnion("kind", [
  z.object({ sessionId: id, kind: z.literal("message"), text: z.string() }),
  z.object({ sessionId: id, kind: z.literal("moment_response"), momentId: id }),
  z.object({ sessionId: id, kind: z.literal("boss_result"), bossId: id }),
  z.object({ sessionId: id, kind: z.literal("continue") }),
  z.object({ sessionId: id, kind: z.literal("boss_declined") }),
]);

export interface TurnPlan {
  anonId: string;
  ip: string;
  session: Session;
  user: User;
  request: ChatRequest;
  /** Text for Claude's new user turn; null resumes a paused response without a new user turn. */
  modelText: string | null;
  /** What the learner typed (shown in the transcript), for `message` requests. */
  userText?: string;
}

export type PrepareResult = { ok: true; plan: TurnPlan } | { ok: false; status: number; error: string };

const fail = (status: number, error: string): PrepareResult => ({ ok: false, status, error });

export async function prepareTurn(store: Store, anonId: string, ip: string, body: unknown): Promise<PrepareResult> {
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, "Invalid request.");
  const request = parsed.data;

  const session = await store.getSession(request.sessionId);
  if (!session || session.anonId !== anonId) return fail(404, "Session not found.");
  const user = (await store.getUser(anonId)) ?? newUser(anonId);
  const mode = modeOf(session.intent);

  const plan = (modelText: string | null, userText?: string): PrepareResult => ({
    ok: true,
    plan: { anonId, ip, session, user, request, modelText, userText },
  });

  switch (request.kind) {
    case "message": {
      const text = request.text.trim();
      if (!text) return fail(400, "Message is empty.");
      if (text.length > MAX_MESSAGE_CHARS) return fail(400, `Messages are limited to ${MAX_MESSAGE_CHARS} characters.`);
      return plan(text, text);
    }
    case "moment_response": {
      const moment = await store.getMoment(session.id, request.momentId);
      if (!moment) return fail(404, "Moment not found.");
      if (moment.bossId) return fail(400, "Boss questions continue via boss_result.");
      const text = momentResponseText(moment, mode);
      return text ? plan(text) : fail(409, "This moment hasn't been answered yet.");
    }
    case "boss_result": {
      const boss = await store.getBoss(session.id, request.bossId);
      if (!boss) return fail(404, "Boss not found.");
      const concepts = await bossConcepts(store, session, boss.id);
      const text = bossResultText(boss, concepts, mode);
      return text ? plan(text) : fail(409, "This boss challenge isn't finished yet.");
    }
    case "boss_declined":
      if (!session.engine.bossOfferPending) return fail(409, "There's no boss offer to decline.");
      return plan(bossDeclinedText(mode));
    case "continue": {
      const last = (await store.getApiMessages(session.id)).at(-1);
      return plan(isPausedAssistant(last) ? null : continueText(mode));
    }
  }
}


async function bossConcepts(store: Store, session: Session, bossId: string): Promise<string[]> {
  const record = session.engine.bosses.find((b) => b.id === bossId);
  if (record?.concepts.length) return record.concepts;
  const moments = await store.listMoments(session.id);
  return [...new Set(moments.filter((m) => m.bossId === bossId).map((m) => m.candidate.concept))];
}
