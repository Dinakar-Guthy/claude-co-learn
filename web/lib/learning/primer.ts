/** Novice primer actions: answer the warm-up check (5 XP if right, no mastery update) or dismiss the card. */
import { z } from "zod";
import type { PrimerRequest, PrimerResponse } from "@/lib/contracts/api";
import { toPrimerView } from "@/lib/views";
import { HttpError, type HandlerResult, type LearningDeps } from "./deps";
import { loadOwnedSession, patchSession } from "./sessionStore";
import { awardXp } from "./xp";

export const PrimerRequestSchema = z.union([
  z.object({ action: z.literal("dismiss") }),
  z.object({ action: z.literal("answer"), choice: z.number().int().min(0).max(3) }),
]);

export async function handlePrimer(deps: LearningDeps, anonId: string, sessionId: string, req: PrimerRequest): Promise<HandlerResult<PrimerResponse>> {
  const session = await loadOwnedSession(deps, anonId, sessionId);
  const primer = session.primer;
  if (!primer) throw new HttpError(404, "No primer for this session");

  if (req.action === "dismiss") {
    const saved = await patchSession(deps, sessionId, (latest) => ({ primer: latest.primer && { ...latest.primer, dismissed: true } }));
    await deps.store.logEvent({ at: deps.now(), anonId, sessionId, name: "primer_dismissed", props: { answered: Boolean(primer.answer) } });
    return { body: { primer: toPrimerView(saved?.primer ?? { ...primer, dismissed: true }) }, background: [] };
  }

  if (primer.answer) return { body: { primer: toPrimerView(primer) }, background: [] };
  if (req.choice >= primer.check.options.length) throw new HttpError(400, "Choice out of range");
  const correct = req.choice === primer.check.correctIndex;
  const saved = await patchSession(deps, sessionId, (latest) => ({ primer: latest.primer && { ...latest.primer, answer: latest.primer.answer ?? { choice: req.choice, correct } } }));
  const xp = await awardXp(deps, anonId, sessionId, [{ kind: "primer_check", correct }], "Warm-up question");
  await deps.store.logEvent({ at: deps.now(), anonId, sessionId, name: "primer_answered", props: { correct } });
  return { body: { primer: toPrimerView(saved?.primer ?? { ...primer, answer: { choice: req.choice, correct } }), xp }, background: [] };
}
