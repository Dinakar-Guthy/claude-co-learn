/**
 * Server → browser stream protocol for POST /api/chat.
 * Transport: newline-delimited JSON (one ChatStreamEvent per line), Content-Type application/x-ndjson.
 */
import type { MomentView, Verdict } from "./moment";
import type { LevelInfo, LevelReward } from "./engine";
import type { LearningPath, Source } from "./session";

export interface XpAward {
  amount: number;
  reason: string;
  level: LevelInfo;
  levelUp?: { from: number; to: number; rewards: LevelReward[] };
}

export type TurnEndReason =
  | "end_turn" // Claude finished; waiting for the user's next message
  | "awaiting_learner" // a learning moment is shown; waiting for the answer
  | "boss_due" // milestone reached and a boss should start (client calls /api/boss)
  | "refusal"
  | "max_steps"
  | "error";

export type ChatStreamEvent =
  | { type: "status"; status: "thinking" | "summarizing" | "searching" | "running_code" | "preparing_moment" } // summarizing: compacting a long history before the turn
  | { type: "text_delta"; itemId: string; text: string }
  /** The full, numbered source list of a text item so far (replaces the previous one). */
  | { type: "sources"; itemId: string; sources: Source[] }
  | { type: "code_start"; itemId: string; language: "bash" | "python" | "file"; code: string }
  | { type: "code_result"; itemId: string; stdout: string; stderr: string; returnCode: number; fileIds: string[] }
  | { type: "moment"; itemId: string; moment: MomentView }
  | { type: "prediction_reveal"; itemId: string; momentId: string; actualResult: string; verdict: Verdict; why: string; xp: XpAward }
  | { type: "milestone"; itemId: string; label: string; bossDue: boolean }
  | { type: "notice"; itemId: string; text: string }
  /** Learn mode: the learning path was set or moved on. */
  | { type: "path"; path: LearningPath }
  /** A streamed item that turned out not to happen (code requested next to a question or milestone never runs). */
  | { type: "remove_item"; itemId: string }
  | { type: "turn_end"; reason: TurnEndReason; detail?: string }
  | { type: "error"; message: string; retryable: boolean; code?: "rate_limited" | "spend_cap" | "bad_request" | "upstream" };
