import { describe, expect, it } from "vitest";
import type { TranscriptItem } from "@/lib/contracts/session";
import type { ChatStreamEvent } from "@/lib/contracts/stream";
import { applyEvent } from "./transcript";

const reduce = (events: ChatStreamEvent[], start: TranscriptItem[] = []) => events.reduce(applyEvent, start);
const level = { level: 1, xp: 10, levelStartXp: 0, nextLevelXp: 100 };

describe("applyEvent", () => {
  it("appends text deltas to the matching assistant_text item", () => {
    const items = reduce([
      { type: "text_delta", itemId: "a", text: "Hel" },
      { type: "text_delta", itemId: "a", text: "lo" },
      { type: "text_delta", itemId: "b", text: "Next" },
    ]);
    expect(items).toEqual([
      { kind: "assistant_text", id: "a", text: "Hello" },
      { kind: "assistant_text", id: "b", text: "Next" },
    ]);
  });

  it("builds a code_run from code_start then code_result", () => {
    const items = reduce([
      { type: "code_start", itemId: "c", language: "python", code: "print(1)" },
      { type: "code_result", itemId: "c", stdout: "1\n", stderr: "", returnCode: 0, fileIds: ["f"] },
    ]);
    expect(items).toEqual([{ kind: "code_run", id: "c", language: "python", code: "print(1)", stdout: "1\n", stderr: "", returnCode: 0, fileIds: ["f"] }]);
  });

  it("removes a code block that never ran", () => {
    const items = applyEvent([], { type: "code_start", itemId: "srv_x", language: "python", code: "print(1)" });
    expect(applyEvent(items, { type: "remove_item", itemId: "srv_x" })).toEqual([]);
    expect(applyEvent(items, { type: "remove_item", itemId: "other" })).toBe(items);
  });

  it("creates a code_run if a result arrives without a start", () => {
    expect(reduce([{ type: "code_result", itemId: "c", stdout: "", stderr: "x", returnCode: 1, fileIds: [] }])[0]).toMatchObject({ kind: "code_run", returnCode: 1 });
  });

  it("adds moment, prediction, milestone, and notice items once", () => {
    const moment: ChatStreamEvent = {
      type: "moment",
      itemId: "moment:m1",
      moment: { id: "m1", sessionId: "s", type: "predict", concept: "c", question: "q", status: "awaiting_answer" },
    };
    const items = reduce([
      moment,
      moment,
      { type: "prediction_reveal", itemId: "prediction:m1", momentId: "m1", actualResult: "0.85", verdict: "correct", why: "w", xp: { amount: 10, reason: "r", level } },
      { type: "milestone", itemId: "ms", label: "Data explored", bossDue: false },
      { type: "notice", itemId: "n", text: "Reset." },
    ]);
    expect(items).toEqual([
      { kind: "moment", id: "moment:m1", momentId: "m1" },
      { kind: "prediction_reveal", id: "prediction:m1", momentId: "m1", actualResult: "0.85", verdict: "correct", why: "w", xp: 10 },
      { kind: "milestone", id: "ms", label: "Data explored" },
      { kind: "notice", id: "n", text: "Reset." },
    ]);
  });

  it("ignores status, error, and turn_end, returning the same array", () => {
    const start: TranscriptItem[] = [{ kind: "user", id: "u", text: "hi", at: 0 }];
    expect(applyEvent(start, { type: "status", status: "thinking" })).toBe(start);
    expect(applyEvent(start, { type: "turn_end", reason: "end_turn" })).toBe(start);
    expect(applyEvent(start, { type: "error", message: "x", retryable: true })).toBe(start);
  });

  it("does not mutate the input", () => {
    const start: TranscriptItem[] = [{ kind: "assistant_text", id: "a", text: "x" }];
    applyEvent(start, { type: "text_delta", itemId: "a", text: "y" });
    expect(start[0]).toEqual({ kind: "assistant_text", id: "a", text: "x" });
  });
});
