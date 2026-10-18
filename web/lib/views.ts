/** Server → client view mappers (shared). Never leak answer keys to the browser. */
import type { MomentView } from "@/lib/contracts/moment";
import type { BossState, MomentRecord, User } from "@/lib/contracts/session";
import type { BossView, UserView } from "@/lib/contracts/api";
import { engine } from "@/lib/engine";

export function toMomentView(m: MomentRecord): MomentView {
  const revealMC = m.mcOffered;
  return {
    id: m.id,
    sessionId: m.sessionId,
    type: m.type,
    concept: m.candidate.concept,
    conceptCard: m.candidate.concept_card,
    question: m.candidate.question,
    mcOptions: revealMC ? m.candidate.mc_fallback.options : undefined,
    status: m.status,
    bossId: m.bossId,
    answer: m.answer,
    mcChoice: m.mcChoice,
    verdict: m.verdict,
    why: m.why,
    correctIndex: m.mcChoice !== undefined ? m.candidate.mc_fallback.correct_index : undefined,
    xp: m.xp,
  };
}

export function toBossView(b: BossState, moments: MomentRecord[]): BossView {
  const current = b.momentIds.find((id) => {
    const m = moments.find((x) => x.id === id);
    return m && m.status === "awaiting_answer";
  });
  return { id: b.id, name: b.name, ascii: b.ascii, intro: b.intro, hp: b.hp, maxHp: b.maxHp, momentIds: b.momentIds, currentMomentId: current, outcome: b.outcome };
}

export function toUserView(u: User): UserView {
  return { xp: u.xp, level: engine.levelFor(u.xp), unlocks: u.unlocks, settings: u.settings };
}
