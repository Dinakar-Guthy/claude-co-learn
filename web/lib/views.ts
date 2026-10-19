/** Server → client view mappers (shared). Never leak answer keys to the browser. */
import type { MomentView } from "@/lib/contracts/moment";
import type { BossState, MomentRecord, Primer, Session, TranscriptItem, User } from "@/lib/contracts/session";
import type { BossView, PrimerView, SessionView, UserView } from "@/lib/contracts/api";
import { engine } from "@/lib/engine";
import { modeOf } from "@/lib/modes";

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
    help: m.help ? { hints: m.help.hints, lesson: m.help.lesson, thread: m.help.thread } : undefined,
    helpLevel: m.help?.level,
    // The ideal answer only once it's out: answered, skipped ("See the answer"), or revealed on request.
    answerExplanation: m.status === "answered" || m.status === "skipped" || m.status === "revealed" ? m.candidate.ideal_answer : undefined,
    explainAtWrapUp: m.explainAtWrapUp,
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

export function toSessionView(s: Session, transcript: TranscriptItem[], moments: MomentRecord[], bosses: BossState[]): SessionView {
  return {
    id: s.id,
    title: s.title,
    intent: s.intent,
    sketch: s.sketch,
    status: s.status,
    createdAt: s.createdAt,
    endsAt: s.createdAt + s.intent.minutes * 60_000,
    transcript,
    moments: Object.fromEntries(moments.map((m) => [m.id, toMomentView(m)])),
    bosses: Object.fromEntries(bosses.map((b) => [b.id, toBossView(b, moments)])),
    chapters: Object.fromEntries(s.story.chapters.map((c) => [c.id, c])),
    storyEnabled: s.story.enabled === true,
    mode: modeOf(s.intent),
    path: s.path,
    bossOfferPending: Boolean(s.engine.bossOfferPending) && bosses.every((b) => b.outcome),
    primer: s.primer ? toPrimerView(s.primer) : undefined,
  };
}

/** The primer's check reveals its answer key only once it's been answered. */
export function toPrimerView(p: Primer): PrimerView {
  const { question, options, correctIndex, why } = p.check;
  return {
    ideas: p.ideas,
    check: {
      question,
      options,
      answered: p.answer ? { choice: p.answer.choice, correct: p.answer.correct, correctIndex, why: why[p.answer.choice] ?? "" } : undefined,
    },
    dismissed: Boolean(p.dismissed),
  };
}
