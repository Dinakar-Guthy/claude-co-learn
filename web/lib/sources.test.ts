import { describe, expect, it } from "vitest";
import { alignCitations } from "./sources";

const u = (s: string) => `https://ex.org/${s}`;

describe("alignCitations", () => {
  it("leaves markers that already follow the sources list alone", () => {
    expect(alignCitations("A [1]. B [2][1].", [{ url: u("a") }, { url: u("b") }], [true, true], [u("b"), u("a")])).toBe("A [1]. B [2][1].");
  });

  it("remaps markers numbered by search-result position (live case, 2026-10-19)", () => {
    const results = ["w", "brit", "rg", "aud", "agr", "tg", "ls", "oct", "lr"].map(u);
    const listed = ["brit", "aud", "agr", "oct"].map((s) => ({ url: u(s) }));
    expect(alignCitations("Land [5][4]. Army [2]. Custom [8].", listed, [true, true, true, true], results)).toBe("Land [3][2]. Army [1]. Custom [4].");
  });

  it("renumbers after a dropped source and removes markers to it", () => {
    const listed = [{ url: u("made-up") }, { url: u("a") }, { url: u("b") }];
    expect(alignCitations("X [1]. Y [2]. Z [3].", listed, [false, true, true], [u("a"), u("b")])).toBe("X. Y [1]. Z [2].");
  });

  it("removes markers that point at nothing", () => {
    expect(alignCitations("Only [1] and [7].", [{ url: u("a") }], [true], [u("a")])).toBe("Only [1] and.");
  });

  it("matches URLs ignoring trailing slashes and fragments", () => {
    expect(alignCitations("See [3].", [{ url: u("c/") }], [true], [u("a"), u("b"), u("c#top")])).toBe("See [1].");
  });
});
