import { handleGrade } from "./grade";
import { describe, expect, it, vi } from "vitest";
import { initialEngineState } from "@/lib/contracts/engine";
import { newUser } from "@/lib/store/defaults";
import { candidate, ANON, makeDeps, mockContent, seedMoment, seedSession } from "./test-helpers";
import { fallbackWrapUp, handleWrapUp, outcomesFrom } from "./wrapup";
import { recentMisconceptions, workSummary } from "./workSummary";

describe("handleWrapUp", () => {
  it("wraps once, awards completion XP idempotently, and returns codex, chapter, deferred moments", async () => {
    const deps = makeDeps();
    await seedSession(deps, { engine: { ...initialEngineState(), bosses: [{ id: "b1", startedAt: 1, concepts: [], outcome: "victory" }] } });
    await deps.store.putUser({ ...newUser(ANON), xp: 80 });
    await seedMoment(deps, { id: "m1", status: "answered", verdict: "correct", xp: 10 });
    await seedMoment(deps, { id: "m2", status: "answered", verdict: "correct", mcChoice: 0, xp: 5, candidate: candidate({ concept: "data leakage" }) });
    await seedMoment(deps, { id: "m3", status: "deferred", candidate: candidate({ concept: "overfitting" }) });

    const { body } = await handleWrapUp(deps, ANON, "s1");
    expect((await deps.store.getSession("s1"))?.status).toBe("wrapped");
    expect(body.deferred.map((m) => m.id)).toEqual(["m3"]);
    expect(body.codex.map((c) => c.concept)).toEqual(["class imbalance", "data leakage"]);
    expect(body.sessionXp).toBe(10 + 5 + 50 + 30);
    expect(body.user.xp).toBe(110);
    expect(body.levelUps).toEqual([{ from: 1, to: 2, rewards: [expect.objectContaining({ id: "sunset" })] }]);
    expect(body.chapter?.trigger).toBe("wrapup");
    expect(body.suggestions).toHaveLength(1);
    expect(deps.store.events.filter((e) => e.name === "session_wrapped")).toHaveLength(1);

    const again = await handleWrapUp(deps, ANON, "s1");
    expect(again.body.user.xp).toBe(110);
    expect(again.body.levelUps).toEqual([]);
    expect(again.body.chapter?.id).toBe(body.chapter?.id);
    expect(vi.mocked(deps.content.generateChapter)).toHaveBeenCalledTimes(1);
    expect(deps.store.events.filter((e) => e.name === "session_wrapped")).toHaveLength(1);
  });

  it("falls back to a deterministic codex and no chapter when generation fails", async () => {
    const deps = makeDeps(
      mockContent({
        generateWrapUp: vi.fn(async () => Promise.reject(new Error("down"))),
        generateStoryBible: vi.fn(async () => Promise.reject(new Error("down"))),
      }),
    );
    await seedSession(deps);
    await seedMoment(deps, { status: "answered", verdict: "incorrect" });
    const { body } = await handleWrapUp(deps, ANON, "s1");
    expect(body.codex).toEqual([expect.objectContaining({ concept: "class imbalance", result: "review" })]);
    expect(body.chapter).toBeUndefined();
    expect(body.suggestions.length).toBeGreaterThan(0);
  });
});

describe("outcomes and summaries", () => {
  it("derives scores from verdicts and MC use, ignoring unresolved moments", async () => {
    const deps = makeDeps();
    await seedSession(deps);
    const moments = [
      await seedMoment(deps, { id: "a", status: "answered", verdict: "correct" }),
      await seedMoment(deps, { id: "b", status: "answered", verdict: "correct", mcChoice: 1 }),
      await seedMoment(deps, { id: "c", status: "answered", verdict: "partial" }),
      await seedMoment(deps, { id: "d", status: "skipped" }),
    ];
    expect(outcomesFrom(moments).map((o) => o.score)).toEqual([1, 0.6, 0.5]);
    expect(fallbackWrapUp(outcomesFrom(moments)).codex[0].result).toBe("growing");
  });

  it("builds a work summary from assistant text, code output and milestones within the budget", () => {
    const summary = workSummary(
      [
        { kind: "user", id: "u", text: "ignore me", at: 1 },
        { kind: "assistant_text", id: "a", text: "Loaded 5,000 rows." },
        { kind: "code_run", id: "c", language: "python", code: "x", stdout: "churn rate 0.15", fileIds: [] },
        { kind: "milestone", id: "m", label: "First model trained" },
        { kind: "assistant_text", id: "b", text: "x".repeat(5000) },
      ],
      2000,
    );
    expect(summary.length).toBeLessThanOrEqual(2100);
    expect(summary).not.toContain("ignore me");
    expect(summary).toContain("Milestone: First model trained");
    expect(summary.indexOf("churn rate")).toBeLessThan(summary.indexOf("Milestone"));
  });

  it("collects misconceptions and missing points from missed moments", async () => {
    const deps = makeDeps();
    const missed = await seedMoment(deps, { status: "answered", verdict: "partial", missingPoints: ["majority class"] });
    const fine = await seedMoment(deps, { id: "m2", status: "answered", verdict: "correct" });
    expect(recentMisconceptions([missed, fine])).toEqual(["majority class", "accuracy is always fine"]);
  });
});

describe("saved predict questions at wrap-up", () => {
  it("become 'what actually happened, and why?' questions graded against the session log", async () => {
    const deps = makeDeps();
    await seedSession(deps);
    await deps.store.putTranscript("s1", [{ kind: "code_run", id: "c1", language: "python", code: "print(acc)", stdout: "baseline accuracy 0.849", fileIds: [] }]);
    await seedMoment(deps, { type: "predict", status: "deferred", candidate: candidate({ type: "predict", question: "What accuracy will the baseline get?" }) });

    const { body } = await handleWrapUp(deps, ANON, "s1");
    expect(body.deferred[0]).toMatchObject({ type: "explain_back", explainAtWrapUp: true });
    expect(body.deferred[0].question).toContain("what actually happened");

    await handleGrade(deps, ANON, { sessionId: "s1", momentId: "m1", action: "submit", answer: "About 85%" });
    const call = vi.mocked(deps.content.gradeAnswer).mock.calls[0][0];
    expect(call.sessionLog).toContain("baseline accuracy 0.849");
  });
});
