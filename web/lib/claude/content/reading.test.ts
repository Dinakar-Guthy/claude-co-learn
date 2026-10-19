import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { MAX_READINGS, parseReadings, readingPrompt, searchResultUrls } from "./reading";

const allowed = new Set(["https://scikit-learn.org/stable/modules/calibration.html", "https://en.wikipedia.org/wiki/Precision_and_recall"]);

describe("parseReadings", () => {
  it("keeps well-formed lines whose URL came back from a search (ignoring a trailing slash or #fragment)", () => {
    const text = [
      "Here you go:",
      "- [Probability calibration](https://scikit-learn.org/stable/modules/calibration.html/) | How calibration makes scores usable as probabilities.",
      "- [Precision and recall](https://en.wikipedia.org/wiki/Precision_and_recall#F-measure) — Definitions behind the metric choice.",
    ].join("\n");
    expect(parseReadings(text, allowed)).toEqual([
      { title: "Probability calibration", url: "https://scikit-learn.org/stable/modules/calibration.html/", why: "How calibration makes scores usable as probabilities." },
      { title: "Precision and recall", url: "https://en.wikipedia.org/wiki/Precision_and_recall#F-measure", why: "Definitions behind the metric choice." },
    ]);
  });

  it("drops made-up URLs, non-web links, duplicates, and anything past the cap", () => {
    const ok = "https://scikit-learn.org/stable/modules/calibration.html";
    const text = [
      "- [Invented](https://made-up.example/page) | Not from a search.",
      "- [Script](javascript:alert(1)) | Never a web link.",
      `- [A](${ok}) | First.`,
      `- [A again](${ok}) | Duplicate.`,
    ].join("\n");
    expect(parseReadings(text, allowed).map((r) => r.title)).toEqual(["A"]);
    const many = new Set(Array.from({ length: 8 }, (_, i) => `https://x.org/${i}`));
    const lines = [...many].map((u, i) => `- [R${i}](${u}) | why`).join("\n");
    expect(parseReadings(lines, many)).toHaveLength(MAX_READINGS);
  });
});

describe("searchResultUrls", () => {
  it("collects result URLs and skips error results", () => {
    const content = [
      { type: "web_search_tool_result", tool_use_id: "a", content: [{ type: "web_search_result", url: "https://a.org", title: "A", encrypted_content: "e", page_age: null }] },
      { type: "web_search_tool_result", tool_use_id: "b", content: { type: "web_search_tool_result_error", error_code: "unavailable" } },
      { type: "text", text: "hi", citations: null },
    ] as unknown as Anthropic.Beta.BetaContentBlock[];
    expect(searchResultUrls(content)).toEqual(["https://a.org"]);
  });
});

describe("readingPrompt", () => {
  it("wraps the goal as data and lists concepts and cited sources", () => {
    const p = readingPrompt({ goal: "Train a churn model", familiarity: "some", minutes: 10, demo: true }, ["class imbalance"], [{ url: "https://a.org", title: "A" }]);
    expect(p).toContain("<learner_goal>\nTrain a churn model\n</learner_goal>");
    expect(p).toContain("- class imbalance");
    expect(p).toContain("- A: https://a.org");
  });
});
