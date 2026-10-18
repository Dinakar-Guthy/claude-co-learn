import { describe, expect, it } from "vitest";
import { stripLeadIn } from "./wrapup";

describe("stripLeadIn", () => {
  it("drops the heading phrase and capitalizes", () => {
    expect(stripLeadIn("Next time you could pick a threshold from real costs.")).toBe("Pick a threshold from real costs");
    expect(stripLeadIn("Try calibration")).toBe("Try calibration");
  });
});
