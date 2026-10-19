import { describe, expect, it } from "vitest";
import { modeForPhrase, modeOf, partsFor } from "./modes";

describe("modes", () => {
  it("maps the typed phrase to a mode", () => {
    expect(modeForPhrase(" /CO-LEARN ")).toBe("co-learn");
    expect(modeForPhrase("/learn")).toBe("learn");
    expect(modeForPhrase("/lear")).toBeNull();
  });

  it("treats sessions without a mode as Co-learn", () => {
    expect(modeOf({})).toBe("co-learn");
    expect(modeOf({ mode: "learn" })).toBe("learn");
  });

  it("sizes the path by session time", () => {
    expect([10, 20, 30, 45].map(partsFor)).toEqual([3, 4, 5, 6]);
  });
});
