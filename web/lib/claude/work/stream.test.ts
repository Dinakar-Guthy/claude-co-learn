import { describe, expect, it } from "vitest";
import type { ChatStreamEvent } from "@/lib/contracts/stream";
import type Anthropic from "@anthropic-ai/sdk";
import { transcriptFromContent } from "./blocks";
import { applyEvent } from "@/lib/client/transcript";
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

  it("streams a cited answer as one item with source markers, matching the persisted transcript", async () => {
    const cite = (url: string) => ({ type: "web_search_result_location" as const, url, title: "Docs", cited_text: "x", encrypted_index: "e" });
    const block = (t: string, ...c: ReturnType<typeof cite>[]) => ({ type: "text", text: t, citations: c.length ? c : null }) as Anthropic.Beta.BetaContentBlock;
    const search = { type: "server_tool_use", id: "srv_s", name: "web_search", input: { query: "q" } } as unknown as Anthropic.Beta.BetaContentBlock;
    const message = fakeMessage([search, block("Per the docs, "), block("weights shift scores", cite("https://a.org/x")), block(".")]);
    const events: ChatStreamEvent[] = [];
    await consumeStream(fakeStream(message), (e) => events.push(e));

    expect(events[0]).toEqual({ type: "status", status: "searching" });
    expect(events).toContainEqual({ type: "sources", itemId: `${message.id}:1`, sources: [{ url: "https://a.org/x", title: "Docs" }] });
    const live = events.reduce(applyEvent, []);
    expect(live).toEqual(transcriptFromContent(message.id, message.content));
    expect(live).toEqual([{ kind: "assistant_text", id: `${message.id}:1`, text: "Per the docs, weights shift scores [1].", sources: [{ url: "https://a.org/x", title: "Docs" }] }]);
  });
});
