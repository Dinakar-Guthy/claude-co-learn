import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatRequest } from "@/lib/contracts/api";
import type { EngineApi, GateDecision } from "@/lib/contracts/engine";
import type { MomentRecord, Session } from "@/lib/contracts/session";
import type { ChatStreamEvent } from "@/lib/contracts/stream";
import { engine as standIn } from "@/lib/engine";
import { MemoryStore } from "@/lib/store/memory";
import { newUser } from "@/lib/store/defaults";
import type { ModelParams, WorkDeps } from "./deps";
import { MAX_STEPS, runTurn } from "./loop";
import type { ApiMessage } from "./state";
import { prepareTurn } from "./prepare";
import type { ModelStream } from "./stream";
import { bash, bashResult, failingStream, fakeMessage, fakeStream, makeSession, momentInput, text, toolUse } from "./testing";
import { BOSS_INSTRUCTION } from "./handlers";

type Reply = Anthropic.Beta.BetaMessage | ModelStream;

interface Options {
  session?: Partial<Session>;
  gate?: GateDecision;
  bossDue?: boolean;
  verifyOk?: boolean;
  demoFileId?: string;
  limits?: Awaited<ReturnType<WorkDeps["checkLimits"]>>;
}

async function setup(opts: Options = {}) {
  const store = new MemoryStore();
  const session = makeSession(opts.session);
  await store.putSession(session);
  await store.putUser(newUser(session.anonId));
  const replies: Reply[] = [];
  const calls: ModelParams[] = [];
  let n = 0;
  const engine: EngineApi = {
    ...standIn,
    gate: opts.gate ? () => opts.gate! : standIn.gate,
    bossDue: () => opts.bossDue ?? false,
  };
  const deps: WorkDeps = {
    store,
    engine,
    content: { verifyMoment: vi.fn(async () => ({ ok: opts.verifyOk ?? true })) },
    startStream: (params) => {
      calls.push(structuredClone(params));
      const next = replies.shift();
      if (!next) throw new Error("no more scripted replies");
      return "finalMessage" in next ? next : fakeStream(next);
    },
    compact: vi.fn(async () => {
      throw new Error("compaction not scripted");
    }),
    checkLimits: async () => opts.limits ?? { ok: true },
    recordUsage: vi.fn(async () => {}),
    now: () => session.createdAt + 60_000,
    newId: () => `id${++n}`,
    demoFileId: opts.demoFileId,
  };

  async function send(request: Omit<ChatRequest, "sessionId"> & Record<string, unknown>, onEvent?: (e: ChatStreamEvent) => void) {
    const prepared = await prepareTurn(store, session.anonId, "1.2.3.4", { sessionId: session.id, ...request });
    if (!prepared.ok) throw new Error(`prepare failed: ${prepared.status} ${prepared.error}`);
    const events: ChatStreamEvent[] = [];
    await runTurn(deps, prepared.plan, (e) => { events.push(e); onEvent?.(e); }, new AbortController().signal);
    return events;
  }

  return { store, session, deps, replies, calls, send, engine };
}

const types = (events: ChatStreamEvent[]) => events.map((e) => e.type);
const lastEvent = (events: ChatStreamEvent[]) => events.at(-1);

describe("runTurn", () => {
  it("streams a simple turn, persists append-only history, transcript, and container", async () => {
    const t = await setup();
    t.replies.push(fakeMessage([text("Hello!")]));
    const events = await t.send({ kind: "message", text: "Hi" });

    expect(events[0]).toEqual({ type: "status", status: "thinking" });
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "end_turn" });
    expect(types(events)).toContain("text_delta");

    const params = t.calls[0];
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.output_config).toEqual({ effort: "medium" });
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("container");
    expect(params.fallbacks).toBe("default");
    expect(params.messages.map((m) => m.role)).toEqual(["user", "system"]);
    expect(String(params.messages[1].content)).toContain("Learner goal: Train a churn model");

    const history = await t.store.getApiMessages(t.session.id);
    expect(history.map((m) => m.role)).toEqual(["user", "system", "assistant"]);
    const transcript = await t.store.getTranscript(t.session.id);
    expect(transcript.map((i) => i.kind)).toEqual(["user", "assistant_text"]);
    const saved = (await t.store.getSession(t.session.id))!;
    expect(saved.containerId).toBe("cntr_1");
    expect(saved.engine.turnsSinceMoment).toBe(1);
    expect(t.deps.recordUsage).toHaveBeenCalledWith(t.session.anonId, "1.2.3.4", "claude-sonnet-5-5", expect.any(Object));
  });

  it("reuses the container and appends the next turn after the stored history", async () => {
    const t = await setup();
    t.replies.push(fakeMessage([text("One")]), fakeMessage([text("Two")]));
    await t.send({ kind: "message", text: "first" });
    await t.send({ kind: "message", text: "second" });
    const second = t.calls[1];
    expect(second.container).toBe("cntr_1");
    expect(second.messages.map((m) => m.role)).toEqual(["user", "system", "assistant", "user", "system"]);
    // Earlier messages are resent exactly as stored.
    expect(second.messages.slice(0, 3)).toEqual(t.calls[0].messages.concat([{ role: "assistant", content: [text("One")] }]));
  });

  it("maps code execution to code events, transcript items, and session files", async () => {
    const t = await setup();
    const run = bash("python3 -c 'print(0.15)'", "srv_1");
    t.replies.push(fakeMessage([run, bashResult("srv_1", "0.15\n", ["file_chart"]), text("Churn is 15%.")]));
    const events = await t.send({ kind: "message", text: "churn rate?" });
    expect(events).toContainEqual({ type: "code_start", itemId: "srv_1", language: "python", code: "python3 -c 'print(0.15)'" });
    expect(events).toContainEqual(expect.objectContaining({ type: "code_result", itemId: "srv_1", fileIds: ["file_chart"] }));
    expect((await t.store.getSession(t.session.id))!.fileIds).toEqual(["file_chart"]);
    const code = (await t.store.getTranscript(t.session.id)).find((i) => i.kind === "code_run");
    expect(code).toMatchObject({ stdout: "0.15\n", returnCode: 0 });
  });

  it("shows a learning moment: persists before emitting, then ends awaiting the learner", async () => {
    const t = await setup({ gate: { action: "show" } });
    const block = toolUse("learning_moment", momentInput(), "toolu_m");
    t.replies.push(fakeMessage([text("Quick one:"), block], "tool_use"));
    let pendingAtEmit: string | undefined;
    const events = await t.send({ kind: "message", text: "train it" }, (e) => {
      if (e.type === "moment") void t.store.getSession(t.session.id).then((s) => (pendingAtEmit = s!.engine.pendingMomentId));
    });
    await Promise.resolve();

    const moment = events.find((e) => e.type === "moment");
    expect(moment).toMatchObject({ type: "moment", moment: { type: "predict", concept: "class imbalance", status: "awaiting_answer" } });
    expect(JSON.stringify(moment)).not.toContain("ideal_answer");
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "awaiting_learner" });

    const id = (moment as Extract<ChatStreamEvent, { type: "moment" }>).moment.id;
    expect(pendingAtEmit).toBe(id);
    expect(await t.store.getMoment(t.session.id, id)).toMatchObject({ status: "awaiting_answer", toolUseId: "toolu_m" });
    const history = await t.store.getApiMessages(t.session.id);
    expect(history.at(-1)).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_m", content: JSON.stringify({ status: "awaiting_learner", moment_id: id }) }],
    });
    expect(t.calls).toHaveLength(1);
    const names = t.store.events.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["moment_proposed", "moment_gated", "moment_shown"]));
  });

  it("skips a gated moment and keeps working in the same turn", async () => {
    const t = await setup({ gate: { action: "skip", reason: "low_value" } });
    t.replies.push(fakeMessage([toolUse("learning_moment", momentInput(), "toolu_m")], "tool_use"), fakeMessage([text("Carrying on.")]));
    const events = await t.send({ kind: "message", text: "go" });
    expect(types(events)).not.toContain("moment");
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "end_turn" });
    const toolResult = t.calls[1].messages.at(-1)!;
    expect(toolResult).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_m", content: JSON.stringify({ status: "skip", reason: "low_value" }) }] });
    expect(await t.store.listMoments(t.session.id)).toEqual([]);
  });

  it("treats a failed verification as an unverified skip", async () => {
    const t = await setup({ gate: { action: "show" }, verifyOk: false });
    t.replies.push(fakeMessage([toolUse("learning_moment", momentInput(), "toolu_m")], "tool_use"), fakeMessage([text("ok")]));
    await t.send({ kind: "message", text: "go" });
    expect(JSON.stringify(t.calls[1].messages.at(-1))).toContain("unverified");
  });

  it("stores deferred moments for the wrap-up quiz", async () => {
    const t = await setup({ gate: { action: "defer", reason: "cap" } });
    t.replies.push(fakeMessage([toolUse("learning_moment", momentInput(), "toolu_m")], "tool_use"), fakeMessage([text("ok")]));
    await t.send({ kind: "message", text: "go" });
    const moments = await t.store.listMoments(t.session.id);
    expect(moments).toHaveLength(1);
    expect(moments[0].status).toBe("deferred");
  });

  it("returns an is_error tool_result for invalid tool input", async () => {
    const t = await setup();
    t.replies.push(fakeMessage([toolUse("learning_moment", { type: "predict" }, "toolu_bad")], "tool_use"), fakeMessage([text("ok")]));
    await t.send({ kind: "message", text: "go" });
    const result = (t.calls[1].messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(result).toMatchObject({ tool_use_id: "toolu_bad", is_error: true });
    expect(String(result.content)).toContain("Invalid input");
  });

  it("resolves a prediction: reveal with XP, mastery, outcome, user XP", async () => {
    const t = await setup();
    const moment: MomentRecord = {
      id: "m1", sessionId: t.session.id, createdAt: 0, type: "predict", candidate: momentInput(),
      status: "awaiting_prediction_result", mcOffered: false, answer: "about 85%",
    };
    await t.store.putMoment(moment);
    t.replies.push(
      fakeMessage([toolUse("resolve_prediction", { moment_id: "m1", actual_result: "Accuracy 0.85", verdict: "correct", why: "Majority class." }, "toolu_r")], "tool_use"),
      fakeMessage([text("Now let's pick a metric.")]),
    );
    const events = await t.send({ kind: "moment_response", momentId: "m1" });

    expect(JSON.stringify(t.calls[0].messages[0])).toContain("The learner predicted");
    const reveal = events.find((e) => e.type === "prediction_reveal") as Extract<ChatStreamEvent, { type: "prediction_reveal" }>;
    expect(reveal).toMatchObject({ momentId: "m1", verdict: "correct", actualResult: "Accuracy 0.85", xp: { amount: 10, reason: "Prediction: correct" } });
    expect(await t.store.getMoment(t.session.id, "m1")).toMatchObject({ status: "answered", verdict: "correct", xp: 10 });
    expect((await t.store.getUser(t.session.anonId))!.xp).toBe(10);
    expect(await t.store.getMastery(t.session.anonId)).toHaveProperty(["class imbalance"]);
    const saved = (await t.store.getSession(t.session.id))!;
    expect(saved.engine.recentOutcomes).toEqual([expect.objectContaining({ momentId: "m1", score: 1, type: "predict" })]);
    expect(JSON.stringify(t.calls[1].messages.at(-1))).toContain("recorded");
    expect((await t.store.getTranscript(t.session.id)).map((i) => i.kind)).toContain("prediction_reveal");
  });

  it("reports level-ups and unlocks rewards", async () => {
    const t = await setup();
    const user = newUser(t.session.anonId);
    user.xp = 95;
    await t.store.putUser(user);
    await t.store.putMoment({ id: "m1", sessionId: t.session.id, createdAt: 0, type: "predict", candidate: momentInput(), status: "awaiting_prediction_result", mcOffered: false });
    t.replies.push(
      fakeMessage([toolUse("resolve_prediction", { moment_id: "m1", actual_result: "0.85", verdict: "correct", why: "w" })], "tool_use"),
      fakeMessage([text("ok")]),
    );
    const events = await t.send({ kind: "moment_response", momentId: "m1" });
    const reveal = events.find((e) => e.type === "prediction_reveal") as Extract<ChatStreamEvent, { type: "prediction_reveal" }>;
    expect(reveal.xp.levelUp).toMatchObject({ from: 1, to: 2 });
    const saved = (await t.store.getUser(t.session.anonId))!;
    expect(saved.level).toBe(2);
    expect(saved.unlocks.themes).toContain("sunset");
  });

  it("rejects resolve_prediction for a moment that isn't awaiting a result", async () => {
    const t = await setup();
    t.replies.push(
      fakeMessage([toolUse("resolve_prediction", { moment_id: "nope", actual_result: "x", verdict: "correct", why: "y" })], "tool_use"),
      fakeMessage([text("ok")]),
    );
    const events = await t.send({ kind: "message", text: "go" });
    expect(types(events)).not.toContain("prediction_reveal");
    expect(JSON.stringify(t.calls[1].messages.at(-1))).toContain('"is_error":true');
  });

  it("ends the turn when a milestone makes a boss due", async () => {
    const t = await setup({ bossDue: true });
    t.replies.push(fakeMessage([toolUse("milestone_reached", { label: "First model trained", summary: "s", concepts_involved: [] }, "toolu_ms")], "tool_use"));
    const events = await t.send({ kind: "message", text: "go" });
    expect(events).toContainEqual({ type: "milestone", itemId: "toolu_ms", label: "First model trained", bossDue: true });
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "boss_due" });
    const history = await t.store.getApiMessages(t.session.id);
    const result = (history.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0];
    expect(JSON.parse(String(result.content))).toEqual({ boss_due: true, instruction: BOSS_INSTRUCTION });
    // The learner gets a "Take it on / Keep working" offer that survives reloads.
    expect((await t.store.getSession(t.session.id))?.engine.bossOfferPending).toBe(true);
  });

  it("Keep working declines the boss offer and continues the work", async () => {
    const t = await setup({ bossDue: true });
    t.replies.push(fakeMessage([toolUse("milestone_reached", { label: "First model trained", summary: "s", concepts_involved: [] }, "toolu_ms")], "tool_use"));
    await t.send({ kind: "message", text: "go" });
    t.replies.push(fakeMessage([text("Carrying on.")]));
    const events = await t.send({ kind: "boss_declined" });
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "end_turn" });
    expect((await t.store.getSession(t.session.id))?.engine.bossOfferPending).toBe(false);
    expect(JSON.stringify(t.calls.at(-1)!.messages)).toContain("keep working instead of taking on the boss");
  });

  describe("Learn mode", () => {
    const learnSession = { intent: { goal: "Teach me about the fall of the Roman Republic.", familiarity: "some" as const, minutes: 10, demo: false, mode: "learn" as const } };
    const pathInput = {
      topic: "The fall of the Roman Republic",
      parts: [
        { title: "Rome in 133 BC", summary: "The Republic at its height" },
        { title: "The Gracchi", summary: "Reform and violence" },
        { title: "Caesar", summary: "The Rubicon" },
      ],
    };

    it("uses the tutor prompt and tools (no sandbox), sets the path, and tells Claude the current part", async () => {
      const t = await setup({ session: learnSession });
      t.replies.push(fakeMessage([toolUse("set_learning_path", pathInput, "toolu_path")], "tool_use"), fakeMessage([text("Rome in 133 BC was…")]));
      const events = await t.send({ kind: "message", text: "Teach me about the fall of the Roman Republic." });

      const request = t.calls[0];
      expect((request.system as { text: string }[])[0].text).toContain("You are Claude in Learn mode");
      expect(request.tools?.map((x) => (x as { name: string }).name)).toEqual(["web_search", "teach", "learning_moment", "set_learning_path", "milestone_reached"]);
      expect(request.container).toBeUndefined();
      expect(JSON.stringify(request.messages)).toContain("Call set_learning_path first with 3 parts");

      const path = events.find((e) => e.type === "path");
      expect(path).toMatchObject({ path: { topic: "The fall of the Roman Republic", parts: [{ status: "current" }, { status: "todo" }, { status: "todo" }] } });
      const stored = await t.store.getSession(t.session.id);
      expect(stored?.path?.parts.map((p) => p.status)).toEqual(["current", "todo", "todo"]);
      expect(stored?.title).toBe("The fall of the Roman Republic");
      expect(JSON.parse(String(((await t.store.getApiMessages(t.session.id)).find((m) => JSON.stringify(m).includes("current_part"))!.content as Anthropic.ToolResultBlockParam[])[0].content))).toEqual({ status: "ok", current_part: "Rome in 133 BC" });
    });

    it("teach shows the lesson verbatim, keeping only sources that came back from a search", async () => {
      const t = await setup({ session: { ...learnSession, path: { topic: "Rome", parts: [{ title: "A", summary: "a", status: "current" }] } } });
      const search = { type: "server_tool_use", id: "srv_s", name: "web_search", input: { query: "Gracchi" } } as unknown as Anthropic.Beta.BetaContentBlock;
      const results = { type: "web_search_tool_result", tool_use_id: "srv_s", content: [{ type: "web_search_result", url: "https://www.britannica.com/biography/Tiberius-Sempronius-Gracchus", title: "Tiberius Gracchus", encrypted_content: "e", page_age: null }] } as unknown as Anthropic.Beta.BetaContentBlock;
      const lesson = "In 133 BC Tiberius Gracchus proposed a land law [1]. Senators feared him [2].";
      t.replies.push(
        fakeMessage([search, results, toolUse("teach", { lesson, sources: [{ title: "Tiberius Gracchus", url: "https://www.britannica.com/biography/Tiberius-Sempronius-Gracchus/" }, { title: "Invented", url: "https://made-up.example/x" }] }, "toolu_t"), toolUse("learning_moment", momentInput())], "tool_use"),
      );
      const events = await t.send({ kind: "message", text: "go on" });
      expect(events).toContainEqual({ type: "text_delta", itemId: "lesson:toolu_t", text: lesson });
      expect(events).toContainEqual({ type: "sources", itemId: "lesson:toolu_t", sources: [{ title: "Tiberius Gracchus", url: "https://www.britannica.com/biography/Tiberius-Sempronius-Gracchus/" }] });
      expect(events.filter((e) => e.type === "moment")).toHaveLength(1);
      const transcript = await t.store.getTranscript(t.session.id);
      expect(transcript.find((i) => i.id === "lesson:toolu_t")).toMatchObject({ kind: "assistant_text", text: lesson, sources: [{ title: "Tiberius Gracchus" }] });
      const ack = (await t.store.getApiMessages(t.session.id)).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((b) => b.type === "tool_result" && b.tool_use_id === "toolu_t") as Anthropic.ToolResultBlockParam;
      expect(JSON.parse(String(ack.content))).toEqual({ status: "shown", note: "1 source(s) dropped: only URLs from your search results can be cited." });
    });

    it("a question with no lesson written before it is sent back with 'teach first'", async () => {
      const t = await setup({ session: { ...learnSession, path: { topic: "Rome", parts: [{ title: "A", summary: "a", status: "current" }] } } });
      const lesson = "In 133 BC Tiberius Gracchus, a tribune, proposed limiting how much public land one family could hold. ".repeat(3);
      t.replies.push(
        fakeMessage([toolUse("learning_moment", momentInput())], "tool_use"),
        fakeMessage([text(lesson), toolUse("learning_moment", momentInput())], "tool_use"),
      );
      const events = await t.send({ kind: "message", text: "go on" });
      const first = t.calls[1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
      expect(JSON.parse(String(first[0].content))).toMatchObject({ status: "skip", reason: "teach_first" });
      expect(events.filter((e) => e.type === "moment")).toHaveLength(1);
      expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "awaiting_learner" });
    });

    it("a milestone finishes the current part and moves to the next", async () => {
      const t = await setup({ session: learnSession, bossDue: false });
      t.replies.push(fakeMessage([toolUse("set_learning_path", pathInput)], "tool_use"), fakeMessage([text("Part 1…")]));
      await t.send({ kind: "message", text: "start" });
      t.replies.push(fakeMessage([toolUse("milestone_reached", { label: "Rome in 133 BC", summary: "s", concepts_involved: [] }, "toolu_m1")], "tool_use"), fakeMessage([text("Now the Gracchi…")]));
      const events = await t.send({ kind: "message", text: "next" });

      expect(events).toContainEqual(expect.objectContaining({ type: "path", path: expect.objectContaining({ parts: [expect.objectContaining({ status: "done" }), expect.objectContaining({ status: "current" }), expect.objectContaining({ status: "todo" })] }) }));
      expect((await t.store.getSession(t.session.id))?.path?.parts.map((p) => p.status)).toEqual(["done", "current", "todo"]);
      const results = t.calls.at(-1)!.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_result");
      expect(JSON.parse(String((results.at(-1) as Anthropic.ToolResultBlockParam).content))).toEqual({ boss_due: false, next_part: "The Gracchi" });
    });

    it("a revised path keeps finished parts done", async () => {
      const t = await setup({ session: { ...learnSession, path: { topic: "Rome", parts: [{ title: "Rome in 133 BC", summary: "x", status: "done" }, { title: "The Gracchi", summary: "y", status: "current" }] } } });
      t.replies.push(fakeMessage([toolUse("set_learning_path", { topic: "Rome", parts: [{ title: "Rome in 133 BC", summary: "x" }, { title: "Women in Rome", summary: "z" }] })], "tool_use"), fakeMessage([text("OK.")]));
      await t.send({ kind: "message", text: "Can we cover women in Rome instead?" });
      expect((await t.store.getSession(t.session.id))?.path?.parts).toEqual([
        { title: "Rome in 133 BC", summary: "x", status: "done" },
        { title: "Women in Rome", summary: "z", status: "current" },
      ]);
    });
  });

  it("continues after a milestone when no boss is due", async () => {
    const t = await setup({ bossDue: false });
    t.replies.push(fakeMessage([toolUse("milestone_reached", { label: "Data explored", summary: "s", concepts_involved: [] })], "tool_use"), fakeMessage([text("Next.")]));
    const events = await t.send({ kind: "message", text: "go" });
    expect(events).toContainEqual(expect.objectContaining({ type: "milestone", bossDue: false }));
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "end_turn" });
  });

  it("ignores a placeholder milestone (label \"x\"): no item, no boss offer, and Claude is told why", async () => {
    const t = await setup({ bossDue: true });
    t.replies.push(fakeMessage([toolUse("milestone_reached", { label: "x", summary: "x", concepts_involved: [] }, "toolu_x")], "tool_use"), fakeMessage([text("Next.")]));
    const events = await t.send({ kind: "message", text: "go" });
    expect(events.some((e) => e.type === "milestone")).toBe(false);
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "end_turn" });
    expect((await t.store.getSession(t.session.id))!.engine.bossOfferPending).toBeFalsy();
    expect(JSON.stringify(t.calls[1].messages.at(-1))).toContain("Ignored, nothing was shown");
  });

  it("re-sends after pause_turn and caps the loop at MAX_STEPS", async () => {
    const t = await setup();
    for (let i = 0; i < MAX_STEPS; i++) t.replies.push(fakeMessage([bash(`echo ${i}`)], "pause_turn"));
    const events = await t.send({ kind: "message", text: "go" });
    expect(t.calls).toHaveLength(MAX_STEPS);
    expect(t.calls[1].messages.at(-1)!.role).toBe("assistant");
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "max_steps" });
  });

  it("resumes a paused turn on `continue` without adding a user message", async () => {
    const t = await setup();
    t.replies.push(fakeMessage([bash("echo 1")], "pause_turn"));
    for (let i = 1; i < MAX_STEPS; i++) t.replies.push(fakeMessage([bash(`echo ${i}`)], "pause_turn"));
    await t.send({ kind: "message", text: "go" });
    t.replies.push(fakeMessage([text("done")]));
    await t.send({ kind: "continue" });
    expect(t.calls.at(-1)!.messages.at(-1)!.role).toBe("assistant");
  });

  it("emits a friendly error on refusal and keeps nothing from the refused turn", async () => {
    const t = await setup();
    t.replies.push(fakeMessage([text("partial")], "refusal"));
    const events = await t.send({ kind: "message", text: "bad" });
    expect(events).toContainEqual(expect.objectContaining({ type: "error", retryable: false }));
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "refusal" });
    expect(await t.store.getApiMessages(t.session.id)).toEqual([]);
  });

  it("retries once without an expired container and tells Claude to reload data", async () => {
    const t = await setup({ session: { containerId: "cntr_old", demoFileAttached: true, intent: { goal: "g", familiarity: "new", minutes: 10, demo: true } }, demoFileId: "file_demo" });
    const expired = new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "container expired" } }, "container expired", new Headers());
    t.replies.push(failingStream(expired), fakeMessage([text("Reloaded.")], "end_turn", { container: { id: "cntr_new", expires_at: "", skills: null } }));
    const events = await t.send({ kind: "message", text: "continue please" });

    expect(t.calls[0].container).toBe("cntr_old");
    expect(t.calls[1]).not.toHaveProperty("container");
    expect(events).toContainEqual(expect.objectContaining({ type: "notice", text: "The coding environment was reset; reloading data." }));
    const user = JSON.stringify(t.calls[1].messages[0]);
    expect(user).toContain("coding environment was reset");
    expect(user).toContain("file_demo");
    expect((await t.store.getSession(t.session.id))!.containerId).toBe("cntr_new");
  });

  it("surfaces API errors and keeps committed history valid", async () => {
    const t = await setup();
    const overloaded = new Anthropic.InternalServerError(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "Overloaded", new Headers());
    t.replies.push(fakeMessage([toolUse("milestone_reached", { label: "x", summary: "s", concepts_involved: [] })], "tool_use"), failingStream(overloaded));
    const events = await t.send({ kind: "message", text: "go" });
    expect(events).toContainEqual(expect.objectContaining({ type: "error", retryable: true, code: "upstream" }));
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "error" });
    const history = await t.store.getApiMessages(t.session.id);
    expect(history.map((m) => m.role)).toEqual(["user", "system", "assistant", "user"]);
  });

  it("attaches the demo file on the first demo turn only", async () => {
    const t = await setup({ session: { intent: { goal: "Train a churn model", familiarity: "new", minutes: 10, demo: true } }, demoFileId: "file_demo" });
    t.replies.push(fakeMessage([text("Loaded.")]), fakeMessage([text("Again.")]));
    await t.send({ kind: "message", text: "Load the churn data" });
    expect(t.calls[0].messages[0].content).toContainEqual({ type: "container_upload", file_id: "file_demo" });
    expect(String(t.calls[0].messages[1].content)).toContain("uploaded to your sandbox");
    expect((await t.store.getSession(t.session.id))!.demoFileAttached).toBe(true);
    await t.send({ kind: "message", text: "next" });
    expect(JSON.stringify(t.calls[1].messages.slice(3))).not.toContain("file_demo");
  });

  it("asks for synthetic data when no demo file is configured", async () => {
    const t = await setup({ session: { intent: { goal: "Train a churn model", familiarity: "new", minutes: 10, demo: true } } });
    t.replies.push(fakeMessage([text("Generating.")]));
    await t.send({ kind: "message", text: "Load the churn data" });
    expect(String(t.calls[0].messages[1].content)).toContain("synthetic customer-churn dataset");
  });

  it("marks a pending moment skipped when the learner sends a new message", async () => {
    const t = await setup({ session: { engine: { ...makeSession().engine, pendingMomentId: "m1" } } });
    await t.store.putMoment({ id: "m1", sessionId: t.session.id, createdAt: 0, type: "decide", candidate: momentInput(), status: "awaiting_answer", mcOffered: false });
    t.replies.push(fakeMessage([text("Sure.")]));
    await t.send({ kind: "message", text: "actually, do X" });
    expect((await t.store.getMoment(t.session.id, "m1"))!.status).toBe("skipped");
    expect((await t.store.getSession(t.session.id))!.engine.pendingMomentId).toBeUndefined();
    const userText = JSON.stringify(t.calls[0].messages[0]);
    expect(userText).toContain("skipped the open learning moment m1");
    expect(userText).toContain("actually, do X");
  });

  it("stops with an error event when limits are exceeded", async () => {
    const t = await setup({ limits: { ok: false, code: "spend_cap", message: "Daily limit reached." } });
    const events = await t.send({ kind: "message", text: "go" });
    expect(events).toContainEqual({ type: "error", message: "Daily limit reached.", retryable: false, code: "spend_cap" });
    expect(t.calls).toHaveLength(0);
  });

  it("emits a notice and keeps going when limits fail open with a warning", async () => {
    const t = await setup({ limits: { ok: true, warning: "Limits are degraded." } });
    t.replies.push(fakeMessage([text("Hi")]));
    const events = await t.send({ kind: "message", text: "go" });
    expect(events.slice(0, 2)).toEqual([
      { type: "status", status: "thinking" },
      { type: "notice", itemId: `notice-limits-${t.session.createdAt + 60_000}`, text: "Limits are degraded." },
    ]);
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "end_turn" });
    expect((await t.store.getTranscript(t.session.id)).some((i) => i.kind === "notice")).toBe(false);
  });

  it("preserves session fields patched concurrently by other routes", async () => {
    const t = await setup();
    t.replies.push({
      async *[Symbol.asyncIterator]() {
        const s = (await t.store.getSession(t.session.id))!;
        await t.store.putSession({ ...s, title: "New title from sketch" });
        yield* fakeStream(final);
      },
      finalMessage: async () => final,
    });
    const final = fakeMessage([text("Hi")]);
    await t.send({ kind: "message", text: "hi" });
    const saved = (await t.store.getSession(t.session.id))!;
    expect(saved.title).toBe("New title from sketch");
    expect(saved.containerId).toBe("cntr_1");
  });
});

describe("server tool calls without results", () => {
  const viewTmp = (id: string) => ({ type: "server_tool_use", id, name: "text_editor_code_execution", input: { command: "view", path: "/tmp" } }) as Anthropic.Beta.BetaContentBlock;
  const ids = (messages: { content: unknown }[]) => JSON.stringify(messages);

  it("drops a server call issued in parallel with learning_moment (never run), from history, transcript, and the next request", async () => {
    const t = await setup({ gate: { action: "show" } });
    const reply = fakeMessage([bash("ls", "srv_a"), bashResult("srv_a", "data.csv\n"), toolUse("learning_moment", momentInput(), "toolu_m"), viewTmp("srv_orphan")], "tool_use");
    t.replies.push(reply);
    const events = await t.send({ kind: "message", text: "train it" });

    expect(events).toContainEqual({ type: "code_start", itemId: "srv_orphan", language: "file", code: "# view /tmp" });
    expect(events).toContainEqual({ type: "remove_item", itemId: "srv_orphan" });
    expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "awaiting_learner" });

    const history = await t.store.getApiMessages(t.session.id);
    expect(ids(history)).not.toContain("srv_orphan");
    expect(ids(history)).toContain("srv_a");
    expect(ids(history)).toContain("toolu_m");
    const transcript = await t.store.getTranscript(t.session.id);
    expect(transcript.filter((i) => i.kind === "code_run").map((i) => i.id)).toEqual(["srv_a"]);

    const moment = (await t.store.listMoments(t.session.id))[0];
    await t.store.putMoment({ ...moment, status: "skipped" });
    t.replies.push(fakeMessage([text("I'll pick.")]));
    await t.send({ kind: "moment_response", momentId: moment.id });
    expect(ids(t.calls[1].messages)).not.toContain("srv_orphan");
  });

  it("keeps a server call that has its result", async () => {
    const t = await setup();
    t.replies.push(fakeMessage([bash("ls", "srv_ok"), bashResult("srv_ok", "x\n"), text("Done.")]));
    const events = await t.send({ kind: "message", text: "ls" });
    expect(events.filter((e) => e.type === "code_result")).toHaveLength(1);
    const assistant = (await t.store.getApiMessages(t.session.id)).at(-1)!;
    expect(assistant.content).toEqual([bash("ls", "srv_ok"), bashResult("srv_ok", "x\n"), text("Done.")]);
  });

  it("leaves pause_turn responses untouched, including a call whose result arrives in the next message", async () => {
    const t = await setup();
    t.replies.push(fakeMessage([text("Running."), bash("sleep 1", "srv_p")], "pause_turn"), fakeMessage([bashResult("srv_p", "ok\n"), text("Done.")]));
    await t.send({ kind: "message", text: "go" });
    expect(t.calls[1].messages.at(-1)).toEqual({ role: "assistant", content: [text("Running."), bash("sleep 1", "srv_p")] });

    t.replies.push(fakeMessage([text("Next.")]));
    await t.send({ kind: "message", text: "next" });
    expect(ids(t.calls[2].messages)).toContain("srv_p");
    expect((await t.store.getTranscript(t.session.id)).find((i) => i.id === "srv_p")).toMatchObject({ returnCode: 0 });
  });

  it("after max_steps on a pause, a new message drops the dangling paused call (`continue` resumes it instead)", async () => {
    const t = await setup();
    const last = MAX_STEPS - 1;
    for (let i = 0; i < MAX_STEPS; i++) t.replies.push(fakeMessage([bash(`echo ${i}`, `srv_${i}`)], "pause_turn"));
    await t.send({ kind: "message", text: "go" });
    const stored = await t.store.getApiMessages(t.session.id);
    expect(stored.at(-1)).toEqual({ role: "assistant", content: [bash(`echo ${last}`, `srv_${last}`)] });

    t.replies.push(fakeMessage([text("Okay.")]));
    await t.send({ kind: "message", text: "actually, stop" });
    const request = t.calls.at(-1)!.messages;
    expect(ids(request)).not.toContain(`srv_${last}`);
    expect(request.at(-1)!.role).toBe("system");
    expect(request.at(-3)).toEqual({ role: "assistant", content: [{ type: "text", text: "…" }] });
    const transcript = await t.store.getTranscript(t.session.id);
    expect(transcript.some((i) => i.id === `srv_${last}`)).toBe(false);
  });

  it("repairs a stored history that already contains an orphaned call", async () => {
    const t = await setup();
    await t.store.putApiMessages(t.session.id, [
      { role: "user", content: [{ type: "text", text: "go" }] },
      { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "milestone_reached", input: {} }, { type: "server_tool_use", id: "srv_bad", name: "text_editor_code_execution", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }] },
    ] as never);
    await t.store.putTranscript(t.session.id, [{ kind: "code_run", id: "srv_bad", language: "file", code: "# view /tmp", fileIds: [] }]);
    t.replies.push(fakeMessage([text("Back on track.")]));
    await t.send({ kind: "message", text: "continue please" });
    expect(ids(t.calls[0].messages)).not.toContain("srv_bad");
    expect(ids(await t.store.getApiMessages(t.session.id))).not.toContain("srv_bad");
    expect((await t.store.getTranscript(t.session.id)).some((i) => i.id === "srv_bad")).toBe(false);
  });

  describe("history compaction", () => {
    /** A stored history big enough to compact: ordinary turns whose code printed a lot. */
    function bigHistory(): ApiMessage[] {
      return Array.from({ length: 30 }, (_, i): ApiMessage[] => [
        { role: "user", content: [{ type: "text", text: `step ${i}` }] },
        { role: "system", content: "context" },
        { role: "assistant", content: [bash("python3 run.py", `srv_h${i}`), bashResult(`srv_h${i}`, "x".repeat(6_000)), text(`Result ${i}.`)] },
      ] as ApiMessage[]).flat();
    }
    const summary = { type: "compaction", content: "Summary of earlier work.", encrypted_content: null, signature: "sig" } as Anthropic.Beta.BetaCompactionBlock;

    it("compacts a large history before the turn and sends the block first, with the compaction beta", async () => {
      const t = await setup({ session: { containerId: "cntr_1" } });
      const history = bigHistory();
      await t.store.putApiMessages(t.session.id, history);
      vi.mocked(t.deps.compact).mockResolvedValueOnce(fakeMessage([summary], "compaction"));
      t.replies.push(fakeMessage([text("Continuing.")]));
      const events = await t.send({ kind: "message", text: "next" });

      expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "end_turn" });
      expect(t.deps.compact).toHaveBeenCalledTimes(1);
      // The learner sees why this turn is slower, then the usual "thinking".
      expect(events.slice(0, 3)).toEqual([
        { type: "status", status: "thinking" },
        { type: "status", status: "summarizing" },
        { type: "status", status: "thinking" },
      ]);
      const request = t.calls[0];
      expect(request.betas).toEqual(["server-side-fallback-2026-07-01", "compact-2026-09-04"]);
      expect(request.messages[0]).toEqual({ role: "assistant", content: [summary] });
      expect(request.messages.slice(1, 13)).toEqual(history.slice(-12));
      expect(request.messages.slice(13).map((m) => m.role)).toEqual(["user", "system"]);
      const stored = await t.store.getApiMessages(t.session.id);
      expect(stored).toHaveLength(1 + 12 + 3);
      expect((await t.store.getSession(t.session.id))!.rollingSummary).toBe("Summary of earlier work.");
      // Compaction usage + the turn's own request, both on the spend-cap path.
      expect(t.deps.recordUsage).toHaveBeenCalledTimes(2);
    });

    it("continues with the full history when compaction fails", async () => {
      const t = await setup();
      const history = bigHistory();
      await t.store.putApiMessages(t.session.id, history);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      t.replies.push(fakeMessage([text("Continuing.")]));
      const events = await t.send({ kind: "message", text: "next" });
      spy.mockRestore();

      expect(t.deps.compact).toHaveBeenCalledTimes(1);
      expect(lastEvent(events)).toEqual({ type: "turn_end", reason: "end_turn" });
      expect(t.calls[0].betas).toEqual(["server-side-fallback-2026-07-01"]);
      expect(t.calls[0].messages.slice(0, history.length)).toEqual(history);
    });

    it("leaves small histories alone", async () => {
      const t = await setup();
      t.replies.push(fakeMessage([text("Hi.")]));
      const events = await t.send({ kind: "message", text: "hello" });
      expect(t.deps.compact).not.toHaveBeenCalled();
      expect(events.filter((e) => e.type === "status" && e.status === "summarizing")).toEqual([]);
      expect(t.calls[0].betas).toEqual(["server-side-fallback-2026-07-01"]);
    });
  });
});
