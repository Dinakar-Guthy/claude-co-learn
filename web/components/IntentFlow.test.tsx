// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DEMO_GOAL, IntentFlow, LEARN_SAMPLE_GOAL } from "./IntentFlow";

afterEach(cleanup);

const letsGo = () => screen.getByRole("button", { name: "Let's go" }) as HTMLButtonElement;

describe("IntentFlow", () => {
  it("demo chip fills the churn goal and sets demo: true with a 10 minute default", () => {
    const onComplete = vi.fn();
    render(<IntentFlow onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Try the demo: train a churn model/ }));
    screen.getByText(DEMO_GOAL);
    expect(letsGo().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Some experience" }));
    fireEvent.click(letsGo());
    expect(onComplete).toHaveBeenCalledWith({ goal: DEMO_GOAL, familiarity: "some", minutes: 10, demo: true, mode: "co-learn" });
  });

  it("uses a typed goal, familiarity, and chosen time", () => {
    const onComplete = vi.fn();
    render(<IntentFlow onComplete={onComplete} />);
    const box = screen.getByLabelText("What are you working on?");
    fireEvent.change(box, { target: { value: "  Write a SQL report on signups  " } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "New to this" }));
    fireEvent.click(screen.getByRole("button", { name: "20 min" }));
    expect(screen.getByRole("button", { name: "20 min" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(letsGo());
    expect(onComplete).toHaveBeenCalledWith({ goal: "Write a SQL report on signups", familiarity: "new", minutes: 20, demo: false, mode: "co-learn" });
  });

  it("does not advance without a goal", () => {
    render(<IntentFlow onComplete={vi.fn()} />);
    const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText("What are you working on?"), { key: "Enter" });
    expect(screen.queryByRole("button", { name: "Let's go" })).toBeNull();
  });

  it("editing the demo goal turns demo mode off", () => {
    const onComplete = vi.fn();
    render(<IntentFlow onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Try the demo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText("What are you working on?"), { target: { value: `${DEMO_GOAL} Use my own data.` } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Comfortable" }));
    fireEvent.click(letsGo());
    expect(onComplete.mock.calls[0][0]).toMatchObject({ demo: false, familiarity: "comfortable" });
  });

  it("Learn mode: preselected by /learn, its own wording and sample, never the churn demo", () => {
    const onComplete = vi.fn();
    render(<IntentFlow onComplete={onComplete} initialMode="learn" />);
    expect(screen.getByRole("button", { name: "Learn a topic" }).getAttribute("aria-pressed")).toBe("true");
    screen.getByLabelText("What do you want to learn?");
    fireEvent.click(screen.getByRole("button", { name: /Try a sample: the fall of the Roman Republic/ }));
    screen.getByText(LEARN_SAMPLE_GOAL);
    fireEvent.click(screen.getByRole("button", { name: "Comfortable" }));
    fireEvent.click(letsGo());
    expect(onComplete).toHaveBeenCalledWith({ goal: LEARN_SAMPLE_GOAL, familiarity: "comfortable", minutes: 10, demo: false, mode: "learn" });
  });

  it("switching mode changes the question", () => {
    render(<IntentFlow onComplete={vi.fn()} />);
    screen.getByLabelText("What are you working on?");
    fireEvent.click(screen.getByRole("button", { name: "Learn a topic" }));
    screen.getByLabelText("What do you want to learn?");
  });
});
