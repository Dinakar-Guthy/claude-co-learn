import { describe, expect, it } from "vitest";
import type { EngineSummary } from "@/lib/contracts/engine";
import { demoDataNote, renderContext, reviewLine, sessionEndsAt, timeLine } from "./context";
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
