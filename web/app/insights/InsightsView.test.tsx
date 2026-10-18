// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { computeInsights, type InsightEvent } from "@/lib/platform/insights";

const apiGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client/api", async (orig) => ({ ...(await orig<typeof import("@/lib/client/api")>()), apiGet }));

const { InsightsView } = await import("./InsightsView");

afterEach(() => {
  cleanup();
  apiGet.mockReset();
});

const DAY = "2026-10-18";
const e = (name: string, props?: InsightEvent["props"]): InsightEvent => ({ at: Date.parse(`${DAY}T10:00:00Z`), anonId: "u1", sessionId: "s1", name, props });

describe("InsightsView", () => {
  it("shows an empty state when there are no events", async () => {
    apiGet.mockResolvedValue(computeInsights([{ day: DAY, events: [] }]));
    render(<InsightsView />);
    expect(await screen.findByText(/No activity in the last 7 days/)).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/api/insights?days=7", expect.any(AbortSignal));
  });

  it("renders metrics and refetches when the window changes", async () => {
    apiGet.mockResolvedValue(
      computeInsights([
        {
          day: DAY,
          events: [
            e("session_created"),
            e("moment_shown", { momentId: "m1" }),
            e("moment_answered", { momentId: "m1", score: 0.8 }),
            e("learned_feedback", { helpful: true }),
          ],
        },
      ]),
    );
    render(<InsightsView />);
    expect(await screen.findByText("Accuracy vs. challenge targets")).toBeTruthy();
    expect(screen.getByText("Delayed retention")).toBeTruthy();
    expect(screen.getAllByText(/In band/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: "30 days" }));
    expect(apiGet).toHaveBeenLastCalledWith("/api/insights?days=30", expect.any(AbortSignal));
  });

  it("shows the server's error message with a retry", async () => {
    apiGet.mockRejectedValueOnce(new Error("Storage is down."));
    render(<InsightsView />);
    expect((await screen.findByRole("alert")).textContent).toBe("Storage is down.");
    apiGet.mockResolvedValue(computeInsights([{ day: DAY, events: [] }]));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No activity/)).toBeTruthy();
  });
});
