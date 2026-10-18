import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { MemoryStore } from "@/lib/store/memory";
import {
  COMPACT_AT_TOKENS,
  COMPACTION_BETA,
  buildCompactionParams,
  compactionUsage,
  estimateTokens,
  findCut,
  hasCompactionBlock,
  isCleanBoundary,
  maybeCompact,
  planCompaction,
  type CompactInput,
} from "./compact";
import { WORK_SYSTEM } from "./prompt";
import type { ApiMessage } from "./state";
import { WORK_TOOLS } from "./tools";
import { fakeMessage, makeSession } from "./testing";

const pad = (n: number) => "x".repeat(n);
let seq = 0;

const user = (t: string): ApiMessage => ({ role: "user", content: [{ type: "text", text: t }] });
const sys = (t = "context"): ApiMessage => ({ role: "system", content: t } as ApiMessage);
const thinking = { type: "thinking", thinking: "", signature: pad(4000) } as const;
const reply = (t: string): ApiMessage => ({ role: "assistant", content: [thinking, { type: "text", text: t }] });
/** An assistant reply that ran code (server tool call and its result in the same message). */
const codeReply = (stdout: string, id = `srvtoolu_${++seq}`): ApiMessage => ({
  role: "assistant",
  content: [
    thinking,
    { type: "server_tool_use", id, name: "bash_code_execution", input: { command: "python3 run.py" } },
    { type: "bash_code_execution_tool_result", tool_use_id: id, content: { type: "bash_code_execution_result", stdout, stderr: "", return_code: 0, content: [] } },
    { type: "text", text: "Done." },
  ],
});
const momentCall = (id = `toolu_${++seq}`): ApiMessage => ({
  role: "assistant",
  content: [thinking, { type: "tool_use", id, name: "learning_moment", input: { question: "?" } }],
});
const toolResult = (id: string): ApiMessage => ({ role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "{}" }] });

/** One ordinary turn: the learner's message, the per-turn context, and a reply that ran code. */
const turn = (i: number, size = 2_000): ApiMessage[] => [user(`step ${i}`), sys(), codeReply(pad(size))];
const turns = (n: number, size?: number) => Array.from({ length: n }, (_, i) => turn(i, size)).flat();

describe("estimateTokens", () => {
  it("counts ~4 characters per token and ignores signatures", () => {
    const small = estimateTokens([user(pad(4_000))]);
    expect(small).toBeGreaterThan(1_000);
    expect(small).toBeLessThan(1_100);
    expect(estimateTokens([reply("hi")])).toBeLessThan(50);
  });
});

describe("isCleanBoundary", () => {
  it("accepts a learner/app user message after a finished assistant turn", () => {
    const h = [user("a"), sys(), reply("b"), user("c")];
    expect(isCleanBoundary(h, 3)).toBe(true);
  });

  it("rejects tool results, system messages, and assistant messages", () => {
    const call = momentCall("toolu_x");
    const h = [user("a"), sys(), call, toolResult("toolu_x"), user("answer"), sys(), reply("ok")];
    expect(isCleanBoundary(h, 3)).toBe(false); // tool_result
    expect(isCleanBoundary(h, 4)).toBe(false); // follows a user message (would merge)
    expect(isCleanBoundary(h, 5)).toBe(false); // system
    expect(isCleanBoundary(h, 6)).toBe(false); // assistant
    expect(isCleanBoundary(h, 0)).toBe(false); // nothing to summarize
  });

  it("rejects a cut after an assistant turn with an open client tool call", () => {
    // Malformed on purpose: a user text right after a tool_use (no tool_result in between).
    const h = [user("a"), sys(), momentCall("toolu_y"), user("b")];
    expect(isCleanBoundary(h, 3)).toBe(false);
  });

  it("rejects a cut after a paused assistant turn (its server tool call has no result yet)", () => {
    const paused: ApiMessage = { role: "assistant", content: [{ type: "server_tool_use", id: "srv_p", name: "bash_code_execution", input: {} }] };
    const h = [user("a"), sys(), paused, user("continue")];
    expect(isCleanBoundary(h, 3)).toBe(false);
  });
});

describe("findCut", () => {
  it("keeps about the last 12 messages, cutting at a turn boundary", () => {
    const h = turns(10); // 30 messages, boundaries at 3, 6, ..., 27
    const k = findCut(h)!;
    expect(k).toBe(18);
    expect(h.length - k).toBe(12);
    expect(h[k]).toEqual(user("step 6"));
  });

  it("moves the cut earlier (keeping more) rather than splitting a turn", () => {
    // A long last turn: moment call, tool result, learner answer, reply. No clean boundary inside it.
    const call = momentCall("toolu_m");
    const h = [...turns(6), user("train"), sys(), call, toolResult("toolu_m"), user("my answer"), sys(), codeReply("x"), codeReply("y")];
    // Keeping 4 would cut inside the moment round (at the learner's answer, which follows a tool result).
    const k = findCut(h, 4)!;
    expect(h[k]).toEqual(user("train"));
    expect(h.length - k).toBe(8);
    expect(findCut(h, 6)).toBe(k);
  });

  it("keeps fewer messages only when no earlier boundary exists", () => {
    const h = [user("a"), sys(), reply("b"), ...Array.from({ length: 20 }, () => codeReply("y")), user("c"), sys(), reply("d")];
    expect(findCut(h)).toBe(23);
  });

  it("never splits a server tool call from a result that landed in a later message", () => {
    // pause_turn: the call is in one assistant message and its result in the next.
    const call: ApiMessage = { role: "assistant", content: [{ type: "server_tool_use", id: "srv_split", name: "bash_code_execution", input: {} }] };
    const result: ApiMessage = {
      role: "assistant",
      content: [
        { type: "bash_code_execution_tool_result", tool_use_id: "srv_split", content: { type: "bash_code_execution_result", stdout: "", stderr: "", return_code: 0, content: [] } },
        { type: "text", text: "ok" },
      ],
    };
    // Malformed on purpose so that a "clean-looking" boundary sits between the pair.
    const h = [user("a"), sys(), reply("b"), user("c"), sys(), { ...call, content: [...(call.content as []), { type: "text", text: "hm" }] } as ApiMessage, user("d"), result];
    expect(isCleanBoundary(h, 6)).toBe(true); // looks clean locally, so the pair check must catch it
    expect(findCut(h, 1)).toBe(3);
  });

  it("returns null when there's no clean boundary", () => {
    expect(findCut([user("a"), sys(), reply("b")])).toBeNull();
    expect(findCut([])).toBeNull();
  });

  it("can cut after an earlier compaction block, never right after it", () => {
    const block: ApiMessage = { role: "assistant", content: [{ type: "compaction", content: "summary", signature: "sig" } as Anthropic.Beta.BetaCompactionBlockParam] };
    const h = [block, user("a"), sys(), reply("b"), user("c"), sys(), reply("d")];
    expect(isCleanBoundary(h, 1)).toBe(false);
    expect(findCut(h, 3)).toBe(4);
  });
});

describe("planCompaction", () => {
  it("is a no-op while the history is small", () => {
    const h = turns(10, 500);
    expect(estimateTokens(h)).toBeLessThan(COMPACT_AT_TOKENS);
    expect(planCompaction(h)).toBeNull();
  });

  it("splits a large history into older and kept parts", () => {
    const h = turns(30, 6_000);
    expect(estimateTokens(h)).toBeGreaterThan(COMPACT_AT_TOKENS);
    const plan = planCompaction(h)!;
    expect(plan.older.length + plan.kept.length).toBe(h.length);
    expect(plan.kept).toHaveLength(12);
    expect(plan.older.at(-1)!.role).toBe("assistant");
    expect(plan.kept[0].role).toBe("user");
  });

  it("skips when the part it could summarize is small (the tail holds most of the tokens)", () => {
    const h = [...turns(3, 100), user("big"), sys(), ...Array.from({ length: 12 }, () => codeReply(pad(20_000)))];
    expect(estimateTokens(h)).toBeGreaterThan(COMPACT_AT_TOKENS);
    expect(planCompaction(h)).toBeNull();
  });
});

describe("buildCompactionParams", () => {
  it("matches the work loop's model, system, and tools, and asks for a summary", () => {
    const older = turns(2);
    const p = buildCompactionParams(older, "cntr_1");
    expect(p).toMatchObject({ model: "claude-sonnet-5-5", output_config: { effort: "medium" }, system: WORK_SYSTEM, tools: WORK_TOOLS, container: "cntr_1", betas: [COMPACTION_BETA] });
    expect(p.messages).toBe(older);
    expect(p.compaction).toMatchObject({ type: "summarize" });
    expect(p.compaction!.instructions).toMatch(/Do not call any tools/);
    expect(p.compaction!.instructions!.length).toBeLessThanOrEqual(16_384);
    expect(p).not.toHaveProperty("fallbacks");
    expect(buildCompactionParams(older, undefined)).not.toHaveProperty("container");
  });
});

describe("compactionUsage", () => {
  it("sums usage.iterations (the top-level counts are zero)", () => {
    const usage = {
      input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
      iterations: [{ type: "compaction", input_tokens: 100, output_tokens: 900, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 5, cache_creation: null }],
    } as unknown as Anthropic.Beta.BetaUsage;
    expect(compactionUsage(usage)).toEqual({ input_tokens: 100, output_tokens: 900, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 5 });
  });
});

describe("hasCompactionBlock", () => {
  it("detects a compaction block anywhere in the history", () => {
    expect(hasCompactionBlock(turns(2))).toBe(false);
    expect(hasCompactionBlock([{ role: "assistant", content: [{ type: "compaction", content: "s" }] }, user("a")])).toBe(true);
  });
});

describe("maybeCompact", () => {
  const block = { type: "compaction", content: "Summary: loaded churn.csv (5000 rows).", encrypted_content: null, signature: "sig_1" } as Anthropic.Beta.BetaCompactionBlock;
  const compactionResponse = (overrides: Partial<Anthropic.Beta.BetaMessage> = {}) =>
    fakeMessage([block], "compaction", {
      usage: {
        input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
        iterations: [{ type: "compaction", input_tokens: 50, output_tokens: 800, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 0, cache_creation: null }],
      } as unknown as Anthropic.Beta.BetaUsage,
      ...overrides,
    });

  async function setup(history: ApiMessage[], compact: CompactInput["deps"]["compact"]) {
    const store = new MemoryStore();
    const session = makeSession({ containerId: "cntr_1" });
    await store.putSession(session);
    await store.putApiMessages(session.id, history);
    await store.putTranscript(session.id, [{ kind: "user", id: "u1", text: "step 0", at: 1 }]);
    const deps = { store, compact: vi.fn(compact), recordUsage: vi.fn(async () => {}) };
    const input: CompactInput = { deps, session, anonId: session.anonId, ip: "1.2.3.4", history, signal: new AbortController().signal };
    return { store, session, deps, input };
  }

  it("does nothing (and calls nothing) for a small history", async () => {
    const h = turns(4);
    const t = await setup(h, async () => compactionResponse());
    const onStart = vi.fn();
    expect(await maybeCompact({ ...t.input, onStart })).toBe(h);
    expect(t.deps.compact).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("calls onStart once, before the summary request", async () => {
    const h = turns(30, 6_000);
    const t = await setup(h, async () => compactionResponse());
    const onStart = vi.fn(() => expect(t.deps.compact).not.toHaveBeenCalled());
    await maybeCompact({ ...t.input, onStart });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(t.deps.compact).toHaveBeenCalledTimes(1);
  });

  it("swaps the older messages for the summary block and keeps the tail verbatim", async () => {
    const h = turns(30, 6_000);
    const t = await setup(h, async () => compactionResponse());
    const out = await maybeCompact(t.input);

    const params = t.deps.compact.mock.calls[0][0];
    const plan = planCompaction(h)!;
    expect(params.messages).toEqual(plan.older);
    expect(out).toEqual([{ role: "assistant", content: [block] }, ...plan.kept]);
    expect(out.slice(1)).toEqual(h.slice(-12));
    expect(await t.store.getApiMessages(t.session.id)).toEqual(out);
    expect((await t.store.getSession(t.session.id))!.rollingSummary).toBe(block.content);
    expect(t.session.rollingSummary).toBe(block.content);
    // Billing comes from usage.iterations, on the same spend-cap path as the loop.
    expect(t.deps.recordUsage).toHaveBeenCalledWith(t.session.anonId, "1.2.3.4", "claude-sonnet-5-5", { input_tokens: 50, output_tokens: 800, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 0 });
    // The UI transcript is untouched.
    expect(await t.store.getTranscript(t.session.id)).toEqual([{ kind: "user", id: "u1", text: "step 0", at: 1 }]);
  });

  it("re-compacts a history that already starts with a block, sending only the newest block", async () => {
    const old: ApiMessage = { role: "assistant", content: [{ type: "compaction", content: "older summary", signature: "sig_0" } as Anthropic.Beta.BetaCompactionBlockParam] };
    const h = [old, ...turns(30, 6_000)];
    const t = await setup(h, async () => compactionResponse());
    const out = await maybeCompact(t.input);
    expect(t.deps.compact.mock.calls[0][0].messages[0]).toBe(old);
    expect(out.filter((m) => hasCompactionBlock([m]))).toHaveLength(1);
    expect(out[0]).toEqual({ role: "assistant", content: [block] });
  });

  it("falls back to the full history when the call fails", async () => {
    const h = turns(30, 6_000);
    const t = await setup(h, async () => {
      throw new Error("529 overloaded");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await maybeCompact(t.input)).toBe(h);
    expect(await t.store.getApiMessages(t.session.id)).toEqual(h);
    expect((await t.store.getSession(t.session.id))!.rollingSummary).toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("falls back when no summary comes back, but still records the billed usage", async () => {
    const h = turns(30, 6_000);
    const t = await setup(h, async () => compactionResponse({ content: [], stop_reason: "max_tokens" }));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await maybeCompact(t.input)).toBe(h);
    expect(await t.store.getApiMessages(t.session.id)).toEqual(h);
    expect(t.deps.recordUsage).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("keeps the full history if the compacted one can't be saved", async () => {
    const h = turns(30, 6_000);
    const t = await setup(h, async () => compactionResponse());
    t.store.putApiMessages = async () => {
      throw new Error("redis down");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await maybeCompact(t.input)).toBe(h);
    spy.mockRestore();
  });
});
