import { describe, expect, it } from "vitest";
import type { ChatStreamEvent } from "@/lib/contracts/stream";
import { consumeStream } from "./stream";
import { bash, bashResult, fakeMessage, fakeStream, text, toolUse } from "./testing";

describe("consumeStream", () => {
  it("emits text deltas, code start/result, and moment status; returns the final message", async () => {
    const message = fakeMessage(
      [text("Let me look."), bash("ls", "srv_1"), bashResult("srv_1", "churn.csv\n"), toolUse("learning_moment", { a: 1 })],
      "tool_use",
    );
    const events: ChatStreamEvent[] = [];
    let first = 0;
    const final = await consumeStream(fakeStream(message), (e) => events.push(e), () => first++);

    expect(final).toBe(message);
    expect(first).toBe(1);
    const id = `${message.id}:0`;
    expect(events).toEqual([
      { type: "text_delta", itemId: id, text: "Let me" },
      { type: "text_delta", itemId: id, text: " look." },
      { type: "status", status: "running_code" },
      { type: "code_start", itemId: "srv_1", language: "bash", code: "ls" },
      { type: "code_result", itemId: "srv_1", stdout: "churn.csv\n", stderr: "", returnCode: 0, fileIds: [] },
      { type: "status", status: "preparing_moment" },
    ]);
  });
});
