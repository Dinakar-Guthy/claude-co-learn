/**
 * Content-generation contract (Track D implements in lib/claude/content/*).
 * Each function makes one structured Claude call (messages.parse + zodOutputFormat).
 */
import type { LearningMomentInput, Verdict } from "./moment";
import type { Intent, Primer, Reading, SessionSketch, Source, StoryBible, StoryChapter } from "./session";
import type { BossOutcome, Familiarity } from "./engine";

export interface GradeResult {
  verdict: Verdict;
  why: string; // 1-2 sentences, encouraging, explains the reasoning (P3)
  missingPoints: string[];
  misconception?: string;
}

export interface VerifyResult {
  ok: boolean; // false → gate converts to skip("unverified")
  reason?: string;
}

export interface BossDraft {
  name: string;
  ascii: "bug" | "slime" | "ghost";
  intro: string; // 1-2 playful sentences
  questions: LearningMomentInput[]; // 2-3 linked questions, type "explain_back"/"spot_issue"/"decide" shapes reused
}

export interface WrapUpDraft {
  codex: { concept: string; summary: string; result: "strong" | "growing" | "review" }[];
  suggestions: string[]; // 2-3 "next time you could..." ideas
}

/** What the help tools know about one question (the answer key stays server-side). */
export interface HelpContext {
  candidate: LearningMomentInput;
  /** The learner has attempted (answered or picked an option) or the answer is already out: help may discuss it freely. */
  attempted: boolean;
  /** Their attempt so far, if any. */
  answer?: string;
  hints: string[];
  lesson?: string;
  thread: { role: "learner" | "claude"; text: string }[];
  /** Short summary of the work so far (real numbers), so help is grounded in their task. */
  workContext: string;
}

export interface ContentApi {
  /** retryAvailable: an incorrect answer gets a multiple-choice retry next, so the "why" must not give the answer away. */
  /** sessionLog: what actually happened in the session (saved predict questions re-asked at wrap-up are graded against it). */
  gradeAnswer(input: { candidate: LearningMomentInput; answer: string; retryAvailable?: boolean; sessionLog?: string }): Promise<GradeResult>;
  verifyMoment(input: { candidate: LearningMomentInput }): Promise<VerifyResult>;
  /** One more hint (never the answer). */
  generateHint(input: HelpContext): Promise<{ hint: string }>;
  /** "Teach me": a short lesson with a similar worked example, then the learner answers the original question. */
  teachConcept(input: HelpContext): Promise<{ lesson: string }>;
  /**
   * "Ask Claude" about the question. wantsAnswer: the learner asked to be told the answer. Before an attempt the
   * reply nudges them to try first unless `declinedBefore`, in which case it gives the answer (the app then
   * closes the question as revealed).
   */
  askTutor(input: HelpContext & { message: string; declinedBefore: boolean }): Promise<{ reply: string; wantsAnswer: boolean }>;
  generateSketch(input: { intent: Intent }): Promise<SessionSketch>;
  /** Novice primer: 3-4 key ideas for this goal plus one easy multiple-choice warm-up. */
  generatePrimer(input: { intent: Intent }): Promise<Omit<Primer, "createdAt" | "dismissed" | "answer">>;
  generateBoss(input: {
    intent: Intent;
    familiarity: Familiarity;
    concepts: string[];
    workSummary: string; // what was built so far, incl. real metrics
    misconceptions: string[];
    targetDifficulty: number;
  }): Promise<BossDraft>;
  generateStoryBible(input: { intent: Intent }): Promise<StoryBible>;
  generateChapter(input: {
    bible: StoryBible;
    previous: Pick<StoryChapter, "title" | "summary">[];
    trigger: string;
    beat: "boss" | "wrapup";
    performance?: BossOutcome;
  }): Promise<Omit<StoryChapter, "id" | "createdAt" | "trigger">>;
  /** "Learn more": 3-5 real readings (from web search) that go one step deeper than the session. */
  generateFurtherReading(input: { intent: Intent; concepts: string[]; cited: Source[] }): Promise<Reading[]>;
  generateWrapUp(input: {
    intent: Intent;
    outcomes: { concept: string; type: string; score: number }[];
    workSummary: string;
  }): Promise<WrapUpDraft>;
}
