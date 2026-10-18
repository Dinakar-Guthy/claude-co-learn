/** Test fixtures for Store implementations. */
import { initialEngineState } from "@/lib/contracts/engine";
import type { BossState, MomentRecord, Session } from "@/lib/contracts/session";

export function makeSession(id: string, anonId: string, createdAt: number, overrides: Partial<Session> = {}): Session {
  return {
    id,
    anonId,
    createdAt,
    title: `Session ${id}`,
    intent: { goal: "Train a churn model", familiarity: "some", minutes: 10, demo: true },
    fileIds: [],
    demoFileAttached: true,
    status: "active",
    engine: initialEngineState(),
    story: { chapters: [] },
    ...overrides,
  };
}

export function makeMoment(id: string, sessionId: string, createdAt: number, overrides: Partial<MomentRecord> = {}): MomentRecord {
  return {
    id,
    sessionId,
    createdAt,
    type: "predict",
    candidate: {
      type: "predict",
      concept: "class imbalance",
      question: "What accuracy will a majority-class baseline get?",
      ideal_answer: "About 80%, the share of non-churners.",
      rubric: { key_points: ["~80%", "majority class share"] },
      mc_fallback: { options: ["50%", "80%", "95%"], correct_index: 1, why: ["no", "yes", "no"] },
      difficulty: 2,
      first_exposure: true,
      learning_value: 4,
      value_reason: "Sets up why accuracy misleads.",
      costly_mistake: true,
      timing: "before_step",
    },
    status: "awaiting_answer",
    mcOffered: false,
    ...overrides,
  };
}

export function makeBoss(id: string, sessionId: string): BossState {
  return {
    id,
    sessionId,
    name: "The Overfit Bug",
    ascii: "bug",
    intro: "A bug that memorises everything.",
    maxHp: 3,
    hp: 3,
    momentIds: ["m1", "m2"],
    createdAt: 1,
  };
}
