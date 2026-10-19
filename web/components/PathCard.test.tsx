// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PathCard } from "./PathCard";

afterEach(cleanup);

const path = {
  topic: "The fall of the Roman Republic",
  parts: [
    { title: "The Gracchi", summary: "Reform and violence", status: "done" as const },
    { title: "Warlords", summary: "Sulla and Pompey", status: "current" as const },
    { title: "Caesar", summary: "The Rubicon", status: "todo" as const },
    { title: "Augustus", summary: "The principate", status: "todo" as const },
  ],
};

describe("PathCard", () => {
  it("shows the current part in one line, and the full path when opened", () => {
    render(<PathCard path={path} />);
    screen.getByText("Part 2 of 4: Warlords");
    expect(screen.queryByText("Reform and violence")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Part 2 of 4/ }));
    screen.getByText("Reform and violence");
    screen.getByText("now");
  });

  it("lets the learner reorder only the parts still to come", () => {
    const onMove = vi.fn();
    render(<PathCard path={path} onMove={onMove} />);
    fireEvent.click(screen.getByRole("button", { name: /Part 2 of 4/ }));
    expect(screen.queryByRole("button", { name: /Move “Warlords”/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Do “Augustus” next" }));
    expect(onMove).toHaveBeenCalledWith(3, 2);
    fireEvent.click(screen.getByRole("button", { name: "Move “Caesar” down" }));
    expect(onMove).toHaveBeenCalledWith(2, 3);
  });

  it("says when every part is done", () => {
    render(<PathCard path={{ ...path, parts: path.parts.map((p) => ({ ...p, status: "done" as const })) }} />);
    screen.getByText("All 4 parts done");
  });
});
