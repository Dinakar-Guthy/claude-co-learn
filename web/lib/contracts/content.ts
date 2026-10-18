/**
 * Content-generation contract (Track D implements in lib/claude/content/*).
 * Each function makes one structured Claude call (messages.parse + zodOutputFormat).
 */
import type { LearningMomentInput, Verdict } from "./moment";
import type { Intent, SessionSketch, StoryBible, StoryChapter } from "./session";
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

export interface ContentApi {
  /** retryAvailable: an incorrect answer gets a multiple-choice retry next, so the "why" must not give the answer away. */
  gradeAnswer(input: { candidate: LearningMomentInput; answer: string; retryAvailable?: boolean }): Promise<GradeResult>;
  verifyMoment(input: { candidate: LearningMomentInput }): Promise<VerifyResult>;
  generateSketch(input: { intent: Intent }): Promise<SessionSketch>;
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
  generateWrapUp(input: {
    intent: Intent;
    outcomes: { concept: string; type: string; score: number }[];
    workSummary: string;
  }): Promise<WrapUpDraft>;
}
