// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MomentView } from "@/lib/contracts/moment";
import { SoundManager } from "@/lib/sound";
import { MomentCard, type MomentHandlers } from "./MomentCard";
import { SoundProvider } from "./SoundProvider";
import { momentPhase } from "./momentPhase";

afterEach(cleanup);

const base: MomentView = {
  id: "m1",
  sessionId: "s1",
  type: "decide",
  concept: "class imbalance",
  conceptCard: "Only ~15% of customers churn.",
  question: "Which metric should we optimize?",
  status: "awaiting_answer",
};

const OPTIONS = ["Accuracy", "Recall", "Precision", "F1"];

function handlers(): MomentHandlers & Record<string, ReturnType<typeof vi.fn>> {
  return {
    onSubmit: vi.fn(),
    onShowOptions: vi.fn(),
    onChooseOption: vi.fn(),
    onSkip: vi.fn(),
    onDefer: vi.fn(),
    onReport: vi.fn(),
  };
}

describe("momentPhase", () => {
  it("derives every state from the view", () => {
    expect(momentPhase(base)).toBe("question");
    expect(momentPhase(base, true)).toBe("grading");
    expect(momentPhase({ ...base, mcOptions: OPTIONS })).toBe("choosing");
    expect(momentPhase({ ...base, verdict: "incorrect", why: "x", mcOptions: OPTIONS })).toBe("choosing");
    expect(momentPhase({ ...base, status: "answered", verdict: "correct", mcOptions: OPTIONS, mcChoice: 1, correctIndex: 1 })).toBe("mc_answered");
    expect(momentPhase({ ...base, status: "answered", verdict: "partial" })).toBe("answered");
    expect(momentPhase({ ...base, status: "awaiting_prediction_result", answer: "85%" })).toBe("locked_in");
    expect(momentPhase({ ...base, status: "skipped" }, true)).toBe("skipped");
    expect(momentPhase({ ...base, status: "deferred" })).toBe("deferred");
    expect(momentPhase({ ...base, status: "reported" })).toBe("reported");
  });
});

describe("MomentCard", () => {
  it("shows the question with type label, concept, and concept card", () => {
    render(<MomentCard moment={base} {...handlers()} />);
    screen.getByText("Decide");
    screen.getByText("class imbalance");
    screen.getByText("Only ~15% of customers churn.");
    screen.getByText("Which metric should we optimize?");
  });

  it("submits a trimmed answer with Enter and keeps Submit disabled when empty", () => {
    const h = handlers();
    render(<MomentCard moment={base} {...h} />);
    const submit = screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const box = screen.getByLabelText("Your answer");
    fireEvent.change(box, { target: { value: "  recall, missing churners is costly  " } });
    expect(submit.disabled).toBe(false);
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(h.onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(h.onSubmit).toHaveBeenCalledWith("recall, missing churners is costly");
  });

  it("wires Show options, Skip, Quiz me later, and Report", () => {
    const h = handlers();
    render(<MomentCard moment={base} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "Show options" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Quiz me later" }));
    fireEvent.click(screen.getByRole("button", { name: /Report question/ }));
    expect(h.onShowOptions).toHaveBeenCalledOnce();
    expect(h.onSkip).toHaveBeenCalledOnce();
    expect(h.onDefer).toHaveBeenCalledOnce();
    expect(h.onReport).toHaveBeenCalledOnce();
  });

  it("hides Quiz me later when deferring isn't allowed", () => {
    render(<MomentCard moment={base} canDefer={false} {...handlers()} />);
    expect(screen.queryByRole("button", { name: "Quiz me later" })).toBeNull();
  });

  it("shows a thinking state while grading", () => {
    render(<MomentCard moment={base} grading {...handlers()} />);
    expect(screen.getAllByText(/Checking your answer/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Your answer")).toBeNull();
  });

  it("after a miss, says Not quite with the why and offers options", () => {
    const h = handlers();
    const m: MomentView = { ...base, answer: "accuracy", verdict: "incorrect", why: "Accuracy rewards the majority class.", mcOptions: OPTIONS };
    render(<MomentCard moment={m} {...h} />);
    expect(screen.getAllByText("Not quite").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Accuracy rewards the majority class.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Recall/ }));
    expect(h.onChooseOption).toHaveBeenCalledWith(1);
  });

  it("highlights the chosen and best options after an MC answer", () => {
    const m: MomentView = { ...base, status: "answered", mcOptions: OPTIONS, mcChoice: 0, correctIndex: 1, verdict: "incorrect", why: "Recall catches churners." };
    render(<MomentCard moment={m} {...handlers()} />);
    screen.getByText("Your pick");
    screen.getByText("Best answer");
  });

  it("shows verdict, why, and XP when answered", () => {
    const m: MomentView = { ...base, status: "answered", answer: "recall", verdict: "correct", why: "Missing churners is costly.", xp: 10 };
    render(<MomentCard moment={m} {...handlers()} />);
    screen.getByText("Nice!");
    screen.getByText("+10 XP");
    screen.getByText("recall");
  });

  it("prefers the XP award from the grade response", () => {
    const m: MomentView = { ...base, status: "answered", verdict: "partial", why: "Close." };
    render(<MomentCard moment={m} xp={{ amount: 5, reason: "partial", level: { level: 1, xp: 5, levelStartXp: 0, nextLevelXp: 100 } }} {...handlers()} />);
    screen.getByText("Partly");
    screen.getByText("+5 XP");
  });

  it("locks in a prediction while waiting for the real result", () => {
    render(<MomentCard moment={{ ...base, type: "predict", status: "awaiting_prediction_result", answer: "about 85%" }} {...handlers()} />);
    screen.getByText("Predict");
    screen.getByText("about 85%");
    expect(screen.getAllByText(/Locked in!/).length).toBeGreaterThan(0);
  });

  it.each([
    ["skipped", /Skipped a question on class imbalance/],
    ["deferred", /Saved a question on class imbalance for your wrap-up quiz/],
    ["reported", /Thanks for flagging/],
  ] as const)("collapses to a compact line when %s", (status, text) => {
    render(<MomentCard moment={{ ...base, status }} {...handlers()} />);
    screen.getByText(text);
    expect(screen.queryByText("Which metric should we optimize?")).toBeNull();
  });

  it("plays the verdict sound only when new feedback arrives", () => {
    const manager = new SoundManager({ createContext: () => null });
    const spy = vi.spyOn(manager, "playVerdict");
    const answered: MomentView = { ...base, status: "answered", verdict: "correct", why: "Yes." };

    const restored = render(<SoundProvider manager={manager}><MomentCard moment={answered} {...handlers()} /></SoundProvider>);
    expect(spy).not.toHaveBeenCalled();
    restored.unmount();

    const h = handlers();
    const { rerender } = render(<SoundProvider manager={manager}><MomentCard moment={base} {...h} /></SoundProvider>);
    rerender(<SoundProvider manager={manager}><MomentCard moment={base} grading {...h} /></SoundProvider>);
    rerender(<SoundProvider manager={manager}><MomentCard moment={answered} {...h} /></SoundProvider>);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("correct");
  });
});
