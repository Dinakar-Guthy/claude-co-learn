/** Mocked Anthropic client for content tests: queue responses, inspect requests. */
import { vi } from "vitest";

export interface FakeResponse {
  json?: unknown;
  text?: string;
  stop_reason?: string;
  category?: string | null;
  model?: string;
}

export function fakeClient() {
  const queue: FakeResponse[] = [];
  const toMessage = (params: { model: string }) => {
    const r = queue.shift();
    if (!r) throw new Error("fakeClient: no queued response");
    const text = r.text ?? (r.json === undefined ? undefined : JSON.stringify(r.json));
    return {
      model: r.model ?? params.model,
      stop_reason: r.stop_reason ?? "end_turn",
      stop_details: r.stop_reason === "refusal" ? { type: "refusal", category: r.category ?? null, explanation: null } : null,
      usage: { input_tokens: 100, output_tokens: 50 },
      content: text === undefined ? [] : [{ type: "text", text }],
    };
  };
  const create = vi.fn(async (params: { model: string }) => toMessage(params));
  const betaCreate = vi.fn(async (params: { model: string }) => toMessage(params));
  return {
    queue: (...rs: FakeResponse[]) => queue.push(...rs),
    create,
    betaCreate,
    client: { messages: { create }, beta: { messages: { create: betaCreate } } },
  };
}
