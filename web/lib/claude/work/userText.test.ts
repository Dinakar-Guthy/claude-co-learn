import { describe, expect, it } from "vitest";
import type { BossState, MomentRecord } from "@/lib/contracts/session";
import { bossResultText, momentResponseText } from "./userText";
import { momentInput } from "./testing";

const moment = (over: Partial<MomentRecord>): MomentRecord => ({
  id: "m1",
  sessionId: "s1",
  createdAt: 0,
  type: "decide",
  candidate: momentInput({ type: "decide", concept: "metric choice" }),
  status: "answered",
  mcOffered: false,
  ...over,
});

describe("momentResponseText", () => {
  it("answered: includes answer, verdict, why, and the continue instruction", () => {
    const t = momentResponseText(moment({ answer: "recall", verdict: "correct", why: "Missing churners is costly." }))!;
    expect(t).toContain('"recall"');
    expect(t).toContain("Grade: correct.");
    expect(t).toContain("Why: Missing churners is costly.");
    expect(t).toContain("decide · metric choice");
    expect(t).toContain("Continue the work, building on their choice.");
    expect(t).toContain("decide moment");
  });

  it("uses the MC option text for multiple-choice answers", () => {
    expect(momentResponseText(moment({ mcChoice: 1, verdict: "correct" }))).toContain('"85%" (picked from multiple-choice options)');
  });

  it("predict awaiting result: asks for the run and resolve_prediction", () => {
    const t = momentResponseText(moment({ type: "predict", status: "awaiting_prediction_result", answer: "about 85%" }))!;
    expect(t).toContain("The learner predicted: \"about 85%\"");
    expect(t).toContain('call resolve_prediction with moment_id="m1"');
  });

  it("skipped / deferred / reported: make the call yourself", () => {
    for (const status of ["skipped", "deferred", "reported"] as const) {
      const t = momentResponseText(moment({ status }))!;
      expect(t).toContain("Make the call yourself and briefly say why.");
      expect(t).toContain("Continue the work");
    }
  });

  it("returns null while still awaiting an answer", () => {
    expect(momentResponseText(moment({ status: "awaiting_answer" }))).toBeNull();
  });
});

describe("bossResultText", () => {
  const boss: BossState = { id: "b1", sessionId: "s1", name: "The Overfit Bug", ascii: "bug", intro: "", maxHp: 3, hp: 0, momentIds: [], createdAt: 0 };
  it("describes the outcome and concepts", () => {
    const t = bossResultText({ ...boss, outcome: "victory" }, ["overfitting", "recall"])!;
    expect(t).toContain('"The Overfit Bug" finished: a victory');
    expect(t).toContain("overfitting, recall");
  });
  it("returns null before the boss is finished", () => {
    expect(bossResultText(boss, [])).toBeNull();
  });
});
