/**
 * Consumes one streamed model response and forwards what the browser should see live:
 * text deltas, code starts (once the command is complete), and code results.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ChatStreamEvent } from "@/lib/contracts/stream";
import { codeResult, describeCode, isCodeToolName, textItemId } from "./blocks";
import { LEARNING_MOMENT } from "./tools";

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
  const pendingCode = new Map<number, { id: string; name: string; json: string; input: unknown }>();

  for await (const event of stream) {
    if (!started) {
      started = true;
      onFirstEvent?.();
    }
    switch (event.type) {
      case "message_start":
        messageId = event.message.id;
        break;
      case "content_block_start": {
        const block = event.content_block;
        if (block.type === "text" && block.text) {
          emit({ type: "text_delta", itemId: textItemId(messageId, event.index), text: block.text });
        } else if (block.type === "server_tool_use" && isCodeToolName(block.name)) {
          emit({ type: "status", status: "running_code" });
          pendingCode.set(event.index, { id: block.id, name: block.name, json: "", input: block.input });
        } else if (block.type === "tool_use" && block.name === LEARNING_MOMENT) {
          emit({ type: "status", status: "preparing_moment" });
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
          emit({ type: "text_delta", itemId: textItemId(messageId, event.index), text: event.delta.text });
        } else if (event.delta.type === "input_json_delta") {
          const code = pendingCode.get(event.index);
          if (code) code.json += event.delta.partial_json;
        }
        break;
      case "content_block_stop": {
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
