/** Fixtures for learning-logic tests: MemoryStore, stand-in-compatible engine, and a mocked ContentApi. */
import { vi } from "vitest";
import type { ContentApi } from "@/lib/contracts/content";
import { initialEngineState } from "@/lib/contracts/engine";
import type { LearningMomentInput } from "@/lib/contracts/moment";
import type { MomentRecord, Session } from "@/lib/contracts/session";
import { engine } from "@/lib/engine";
import { MemoryStore } from "@/lib/store/memory";
import { newUser } from "@/lib/store/defaults";
import type { LearningDeps } from "./deps";

export const ANON = "11111111-1111-4111-8111-111111111111";
export const OTHER = "22222222-2222-4222-8222-222222222222";

export function candidate(overrides: Partial<LearningMomentInput> = {}): LearningMomentInput {
  return {
    type: "explain_back",
    concept: "class imbalance",
    question: "Why is accuracy misleading here?",
    ideal_answer: "Because 85% of customers don't churn, predicting 'no churn' always scores 85%.",
    rubric: { key_points: ["majority class dominates accuracy"], misconceptions: ["accuracy is always fine"] },
    mc_fallback: {
      options: ["It rewards the majority class", "It is too slow", "It needs scaling"],
      correct_index: 0,
      why: ["Right: the majority class dominates.", "Speed isn't the issue.", "Scaling doesn't affect accuracy."],
    },
    difficulty: 2,
    first_exposure: true,
    learning_value: 5,
    value_reason: "Core to their goal",
    costly_mistake: false,
    timing: "after_step",
    ...overrides,
  };
}

export function mockContent(overrides: Partial<ContentApi> = {}): ContentApi {
  const base: ContentApi = {
    gradeAnswer: vi.fn(async () => ({ verdict: "correct" as const, why: "Nice.", missingPoints: [] })),
    verifyMoment: vi.fn(async () => ({ ok: true })),
    generateSketch: vi.fn(async () => ({ title: "Churn model", goalSummary: "Train a churn model", novice: true, milestones: ["Explore"], conceptRadar: [] })),
    generateBoss: vi.fn(async () => ({
      name: "The Overfit Bug",
      ascii: "bug" as const,
      intro: "A bug appears!",
      questions: [candidate({ concept: "overfitting", question: "Q1?" }), candidate({ concept: "metric choice", question: "Q2?" })],
    })),
    generateStoryBible: vi.fn(async () => ({
      genre: "sky-pirate romp",
      tone: "warm",
      setting: "clouds",
      protagonist: "Ada",
      motif: "a compass that learns",
      arc: ["start", "middle", "end"],
      seeds: { narrator: "a talking map", twist: "the map is upside down" },
    })),
    generateChapter: vi.fn(async () => ({ title: "Chapter", text: "Once upon a time…", summary: "Things happened." })),
    generateWrapUp: vi.fn(async ({ outcomes }: Parameters<ContentApi["generateWrapUp"]>[0]) => ({
      codex: outcomes.map((o) => ({ concept: o.concept, summary: "Learned it.", result: "strong" as const })),
      suggestions: ["Next time you could tune thresholds."],
    })),
  };
  return { ...base, ...overrides };
}

export function makeDeps(content: ContentApi = mockContent()): LearningDeps & { store: MemoryStore } {
  let t = 1_700_000_000_000;
  let n = 0;
  return { store: new MemoryStore(), content, engine, now: () => (t += 1000), newId: () => `id-${++n}` };
}

export async function seedSession(deps: LearningDeps, overrides: Partial<Session> = {}): Promise<Session> {
  const session: Session = {
    id: "s1",
    anonId: ANON,
    createdAt: 1_700_000_000_000,
    title: "Churn",
    intent: { goal: "Train a churn model", familiarity: "some", minutes: 10, demo: true },
    fileIds: [],
    demoFileAttached: false,
    status: "active",
    engine: initialEngineState(),
    story: { chapters: [] },
    ...overrides,
  };
  await deps.store.putSession(session);
  await deps.store.putTranscript(session.id, []);
  await deps.store.putUser(newUser(ANON));
  return session;
}

export async function seedMoment(deps: LearningDeps, overrides: Partial<MomentRecord> = {}): Promise<MomentRecord> {
  const m: MomentRecord = {
    id: "m1",
    sessionId: "s1",
    createdAt: 1_700_000_000_500,
    type: "explain_back",
    candidate: candidate(),
    status: "awaiting_answer",
    mcOffered: false,
    ...overrides,
  };
  await deps.store.putMoment(m);
  return m;
}
