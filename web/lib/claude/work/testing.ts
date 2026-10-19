/** Test helpers: fake model streams and fixtures (used only by *.test.ts). */
import type Anthropic from "@anthropic-ai/sdk";
import type { LearningMomentInput } from "@/lib/contracts/moment";
import type { Session } from "@/lib/contracts/session";
import { initialEngineState } from "@/lib/contracts/engine";
import type { ModelStream } from "./stream";

type Block = Anthropic.Beta.BetaContentBlock;
type RawEvent = Anthropic.Beta.BetaRawMessageStreamEvent;

let seq = 0;

export function fakeMessage(
  content: Block[],
  stop_reason: Anthropic.Beta.BetaStopReason = "end_turn",
  extra: Partial<Anthropic.Beta.BetaMessage> = {},
): Anthropic.Beta.BetaMessage {
  return {
    id: `msg_${++seq}`,
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    container: { id: "cntr_1", expires_at: "2099-01-01T00:00:00Z", skills: null },
    content,
    context_management: null,
    diagnostics: null,
    stop_details: null,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } as Anthropic.Beta.BetaUsage,
    ...extra,
  };
}

export const text = (t: string): Block => ({ type: "text", text: t, citations: null });

export const toolUse = (name: string, input: unknown, id = `toolu_${++seq}`): Block =>
  ({ type: "tool_use", id, name, input }) as Block;

export const bash = (command: string, id = `srvtoolu_${++seq}`): Block =>
  ({ type: "server_tool_use", id, name: "bash_code_execution", input: { command } }) as Block;

export const bashResult = (toolUseId: string, stdout: string, fileIds: string[] = [], return_code = 0): Block => ({
  type: "bash_code_execution_tool_result",
  tool_use_id: toolUseId,
  content: {
    type: "bash_code_execution_result",
    stdout,
    stderr: "",
    return_code,
    content: fileIds.map((file_id) => ({ type: "bash_code_execution_output" as const, file_id })),
  },
});

/** Raw stream events equivalent to `message`, the way the API streams it. */
export function rawEvents(message: Anthropic.Beta.BetaMessage): RawEvent[] {
  const events: RawEvent[] = [{ type: "message_start", message: { ...message, content: [], stop_reason: null } }];
  message.content.forEach((block, index) => {
    if (block.type === "text") {
      events.push({ type: "content_block_start", index, content_block: { ...block, text: "", citations: block.citations ? [] : null } });
      const mid = Math.ceil(block.text.length / 2);
      for (const part of [block.text.slice(0, mid), block.text.slice(mid)]) {
        if (part) events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: part } });
      }
      for (const citation of block.citations ?? []) events.push({ type: "content_block_delta", index, delta: { type: "citations_delta", citation } });
    } else if (block.type === "tool_use" || block.type === "server_tool_use") {
      events.push({ type: "content_block_start", index, content_block: { ...block, input: {} } } as RawEvent);
      events.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    } else {
      events.push({ type: "content_block_start", index, content_block: block } as RawEvent);
    }
    events.push({ type: "content_block_stop", index });
  });
  events.push({ type: "message_stop" });
  return events;
}

export function fakeStream(message: Anthropic.Beta.BetaMessage): ModelStream {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of rawEvents(message)) yield e;
    },
    finalMessage: async () => message,
  };
}

/** A stream that fails before producing any event. */
export function failingStream(error: unknown): ModelStream {
  return {
    async *[Symbol.asyncIterator]() {
      throw error;
    },
    finalMessage: () => Promise.reject(error),
  };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    anonId: "00000000-0000-4000-8000-000000000001",
    createdAt: 1_000_000,
    title: "Churn model",
    intent: { goal: "Train a churn model", familiarity: "some", minutes: 10, demo: false },
    fileIds: [],
    demoFileAttached: false,
    status: "active",
    engine: initialEngineState(),
    story: { chapters: [] },
    ...overrides,
  };
}

export function momentInput(overrides: Partial<LearningMomentInput> = {}): LearningMomentInput {
  return {
    type: "predict",
    concept: "class imbalance",
    concept_card: "When one class is rare, accuracy can look great while missing it.",
    question: "If a model predicts nobody churns, what accuracy would it get?",
    ideal_answer: "About 85%, the share of non-churners.",
    rubric: { key_points: ["about 85%", "majority class"] },
    mc_fallback: { options: ["50%", "85%", "15%"], correct_index: 1, why: ["no", "yes", "no"] },
    difficulty: 2,
    first_exposure: true,
    learning_value: 5,
    value_reason: "Sets up metric choice.",
    costly_mistake: false,
    timing: "before_step",
    ...overrides,
  };
}
