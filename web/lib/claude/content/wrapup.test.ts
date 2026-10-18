import { describe, expect, it } from "vitest";
import { stripLeadIn } from "./wrapup";

describe("stripLeadIn", () => {
  it("drops the heading phrase and capitalizes", () => {
    expect(stripLeadIn("Next time you could pick a threshold from real costs.")).toBe("Pick a threshold from real costs");
    expect(stripLeadIn("Try calibration")).toBe("Try calibration");
  });
});

describe("tidy (help replies)", () => {
  it("drops a stray trailing brace but keeps balanced ones", async () => {
    const { tidy } = await import("./help");
    expect(tidy("ask again and I'll tell you.}")).toBe("ask again and I'll tell you.");
    expect(tidy("Use {threshold} here")).toBe("Use {threshold} here");
  });
});
