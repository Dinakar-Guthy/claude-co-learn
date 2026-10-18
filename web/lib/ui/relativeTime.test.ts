import { describe, expect, it } from "vitest";
import { timeAgo } from "./relativeTime";

const NOW = 1_760_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("timeAgo", () => {
  it.each([
    [0, "just now"],
    [-5 * MIN, "just now"], // clock skew: never "in the future"
    [59_000, "just now"],
    [MIN, "1 min ago"],
    [59 * MIN, "59 min ago"],
    [HOUR, "1 hour ago"],
    [5 * HOUR, "5 hours ago"],
    [DAY, "yesterday"],
    [3 * DAY, "3 days ago"],
    [13 * DAY, "13 days ago"],
    [14 * DAY, "2 weeks ago"],
    [59 * DAY, "8 weeks ago"],
    [60 * DAY, "2 months ago"],
  ])("%d ms ago → %s", (ago, text) => {
    expect(timeAgo(NOW - ago, NOW)).toBe(text);
  });
});
