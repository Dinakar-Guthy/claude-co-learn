/**
 * Consumes one streamed model response and forwards what the browser should see live:
 * text deltas (consecutive text blocks grouped, with numbered source markers), code starts (once the command is
 * complete), code results, and web search status.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ChatStreamEvent } from "@/lib/contracts/stream";
import { codeResult, describeCode, isCodeToolName, TextGroups, webCitations } from "./blocks";
import type { Source } from "@/lib/contracts/session";
import { LEARNING_MOMENT, TEACH } from "./tools";

export type Emit = (event: ChatStreamEvent) => void;

export interface ModelStream extends AsyncIterable<Anthropic.Beta.BetaRawMessageStreamEvent> {
  finalMessage(): Promise<Anthropic.Beta.BetaMessage>;
}

/**
 * Iterates the stream, emitting events, and resolves with the final message.
 * `onFirstEvent` fires when the first stream event arrives (used to decide whether a failure is retryable).
 */
export async function consumeStream(stream: ModelStream, emit: Emit, onFirstEvent?: () => void): Promise<Anthropic.Beta.BetaMessage> {
  let messageId = "";
  let started = false;
  let groups = new TextGroups("");
  const pendingCode = new Map<number, { id: string; name: string; json: string; input: unknown }>();
  /** Open text blocks: their item id and the web citations seen so far. */
  const openText = new Map<number, { itemId: string; citations: Source[] }>();

  for await (const event of stream) {
    if (!started) {
      started = true;
      onFirstEvent?.();
    }
    switch (event.type) {
      case "message_start":
        messageId = event.message.id;
        groups = new TextGroups(messageId);
        break;
      case "content_block_start": {
        const block = event.content_block;
        const itemId = groups.start(event.index, block.type === "text");
        if (block.type === "text" && itemId) {
          openText.set(event.index, { itemId, citations: webCitations(block.citations) });
          if (block.text) emit({ type: "text_delta", itemId, text: block.text });
        } else if (block.type === "server_tool_use" && block.name === "web_search") {
          emit({ type: "status", status: "searching" });
        } else if (block.type === "server_tool_use" && isCodeToolName(block.name)) {
          emit({ type: "status", status: "running_code" });
          pendingCode.set(event.index, { id: block.id, name: block.name, json: "", input: block.input });
        } else if (block.type === "tool_use" && block.name === LEARNING_MOMENT) {
          emit({ type: "status", status: "preparing_moment" });
        } else if (block.type === "tool_use" && block.name === TEACH) {
          emit({ type: "status", status: "teaching" });
        } else {
          const result = codeResult(block);
          if (result) {
            const { toolUseId, ...rest } = result;
            emit({ type: "code_result", itemId: toolUseId, ...rest });
          }
        }
        break;
      }
      case "content_block_delta":
        if (event.delta.type === "text_delta") {
          const text = openText.get(event.index);
          if (text) emit({ type: "text_delta", itemId: text.itemId, text: event.delta.text });
        } else if (event.delta.type === "citations_delta") {
          openText.get(event.index)?.citations.push(...webCitations([event.delta.citation]));
        } else if (event.delta.type === "input_json_delta") {
          const code = pendingCode.get(event.index);
          if (code) code.json += event.delta.partial_json;
        }
        break;
      case "content_block_stop": {
        const text = openText.get(event.index);
        if (text) {
          openText.delete(event.index);
          const { marker, sources } = groups.cite(text.citations);
          if (marker) {
            emit({ type: "text_delta", itemId: text.itemId, text: marker });
            emit({ type: "sources", itemId: text.itemId, sources });
          }
        }
        const code = pendingCode.get(event.index);
        if (code) {
          pendingCode.delete(event.index);
          emit({ type: "code_start", itemId: code.id, ...describeCode(code.name, parseInput(code.json, code.input)) });
        }
        break;
      }
    }
  }
  return stream.finalMessage();
}

function parseInput(json: string, fallback: unknown): unknown {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
