import { describe, expect, it } from "vitest";
import type { EngineSummary } from "@/lib/contracts/engine";
import { demoDataNote, pathLines, renderContext, reviewLine, sessionEndsAt, timeLine } from "./context";
import { makeSession } from "./testing";

const MIN = 60_000;
const summary: EngineSummary = {
  guardrails: { enabled: false, mode: "balanced" },
  valueThreshold: 4,
  targetDifficulty: { firstExposure: 2, practice: 3 },
  masteredConcepts: ["train/test split"],
  dueForReview: ["data leakage", "precision vs recall"],
  conceptsSinceBoss: ["class imbalance"],
  rollingAccuracy: 0.8,
  recentOutcomes: [{ concept: "class imbalance", type: "predict", score: 1 }],
};

describe("timeLine", () => {
  const s = makeSession();
  it("reports remaining minutes", () => {
    expect(timeLine(s, s.createdAt + 3 * MIN)).toBe("Time: about 7 of 10 minutes left.");
  });
  it("steers toward a milestone at 80%", () => {
    expect(timeLine(s, s.createdAt + 8 * MIN)).toContain("~2 minutes left: steer toward a milestone");
  });
  it("notes when time is up", () => {
    expect(timeLine(s, sessionEndsAt(s) + 1)).toContain("are up");
  });
});

describe("renderContext", () => {
  it("includes intent, engine summary, and sketch", () => {
    const session = makeSession({
      sketch: {
        title: "t",
        goalSummary: "g",
        novice: false,
        milestones: ["Data explored", "First model trained"],
        conceptRadar: [{ concept: "data leakage", whyItMatters: "inflates metrics", likelyMomentType: "spot_issue" }],
      },
    });
    const out = renderContext({ session, summary, now: session.createdAt, notes: ["extra note"] });
    expect(out).toContain("Learner goal: Train a churn model");
    expect(out).toContain("Familiarity with this area: some");
    expect(out).toContain("learning value >= 4");
    expect(out).toContain("Mastered concepts (don't quiz unless due for review): train/test split");
    expect(out).toContain("Rolling accuracy: 80%");
    expect(out).toContain("class imbalance (predict) 1");
    expect(out).toContain("Data explored, First model trained");
    expect(out).toContain("data leakage (spot_issue): inflates metrics");
    expect(out).toContain("- extra note");
  });

  it("lists concepts due for review on one line, as review rather than first exposure", () => {
    const out = renderContext({ session: makeSession(), summary, now: 0 });
    const line = out.split("\n").find((l) => l.startsWith("- Due for review from earlier sessions:"));
    expect(line).toBe(`- ${reviewLine(["data leakage", "precision vs recall"])}`);
    expect(line).toContain("data leakage, precision vs recall.");
    expect(line).toContain("first_exposure to false");
  });

  it("handles an empty engine state", () => {
    const out = renderContext({ session: makeSession(), summary: { ...summary, masteredConcepts: [], dueForReview: [], rollingAccuracy: null, recentOutcomes: [] }, now: 0 });
    expect(out).toContain("no graded answers yet");
    expect(out).not.toContain("Session sketch");
    expect(out).not.toContain("Due for review");
  });
});

describe("demoDataNote", () => {
  it("points at the uploaded file or asks for synthetic data", () => {
    expect(demoDataNote(true)).toContain("uploaded to your sandbox");
    expect(demoDataNote(false)).toContain("cancellation_request_date");
  });
});

describe("pathLines (Learn mode)", () => {
  it("asks for a path sized to the session when there's none", () => {
    expect(pathLines(undefined, 20)).toEqual(["- Learning path: not set yet. Call set_learning_path first with 4 parts (for a 20-minute session), then teach part 1."]);
  });

  it("shows the parts in the learner's order and names the current one", () => {
    const lines = pathLines({ topic: "Rome", parts: [{ title: "A", summary: "a", status: "done" }, { title: "B", summary: "b", status: "current" }, { title: "C", summary: "c", status: "todo" }] }, 10);
    expect(lines).toContain("  ✓ 1. A: a");
    expect(lines).toContain("  ▶ 2. B: b");
    expect(lines.at(-1)).toContain("Current part: 2. B.");
  });

  it("says when every part is done", () => {
    expect(pathLines({ topic: "Rome", parts: [{ title: "A", summary: "a", status: "done" }] }, 10).at(-1)).toContain("Every part is done");
  });

  it("is used only in Learn mode, which also drops the work sketch", () => {
    const session = makeSession({ intent: { goal: "Rome", familiarity: "some", minutes: 10, demo: false, mode: "learn" }, sketch: { title: "t", goalSummary: "g", novice: false, milestones: ["m"], conceptRadar: [] } });
    const summary = { guardrails: { enabled: false, mode: "balanced" }, valueThreshold: 3, targetDifficulty: { firstExposure: 2, practice: 3 }, masteredConcepts: [], dueForReview: [], conceptsSinceBoss: [], rollingAccuracy: null, recentOutcomes: [] } as unknown as EngineSummary;
    const text = renderContext({ session, summary, now: session.createdAt });
    expect(text).toContain("Learn context for this turn");
    expect(text).toContain("Call set_learning_path first with 3 parts");
    expect(text).not.toContain("Session sketch");
  });
});
