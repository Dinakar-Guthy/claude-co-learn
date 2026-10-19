import { describe, expect, it, vi } from "vitest";
import { ANON, makeDeps, mockContent, seedMoment, seedSession } from "./test-helpers";
import { citedSources, handleReading } from "./reading";

const cited = { kind: "assistant_text" as const, id: "a1", text: "Balanced weights [1].", sources: [{ url: "https://scikit-learn.org/lr", title: "LogisticRegression" }] };

describe("citedSources", () => {
  it("collects sources from assistant messages, deduped, in order", () => {
    const again = { ...cited, id: "a2", sources: [cited.sources[0], { url: "https://b.org", title: "B" }] };
    expect(citedSources([{ kind: "user", id: "u", text: "hi", at: 1 }, cited, again])).toEqual([cited.sources[0], { url: "https://b.org", title: "B" }]);
  });
});

describe("handleReading", () => {
  it("generates once from the session's concepts and cited sources, then serves the saved list", async () => {
    const deps = makeDeps();
    await seedSession(deps);
    await seedMoment(deps, { status: "answered", verdict: "correct" });
    await deps.store.putTranscript("s1", [cited]);

    const first = await handleReading(deps, ANON, "s1");
    expect(first.body.reading).toEqual([{ title: "Class imbalance", url: "https://example.org/imbalance", why: "Goes deeper on metrics for rare classes." }]);
    expect(deps.content.generateFurtherReading).toHaveBeenCalledWith(expect.objectContaining({ concepts: ["class imbalance"], cited: cited.sources }));
    expect((await deps.store.getSession("s1"))?.furtherReading).toEqual(first.body.reading);

    const again = await handleReading(deps, ANON, "s1");
    expect(again.body.reading).toEqual(first.body.reading);
    expect(deps.content.generateFurtherReading).toHaveBeenCalledTimes(1);
  });

  it("falls back to the sources cited in the session when the search fails, without saving", async () => {
    const deps = makeDeps(mockContent({ generateFurtherReading: vi.fn(async () => Promise.reject(new Error("down"))) }));
    await seedSession(deps);
    await deps.store.putTranscript("s1", [cited]);
    const { body } = await handleReading(deps, ANON, "s1");
    expect(body.reading).toEqual([{ ...cited.sources[0], why: "Cited during this session." }]);
    expect((await deps.store.getSession("s1"))?.furtherReading).toBeUndefined();
    expect(deps.store.events.find((e) => e.name === "error")?.props).toMatchObject({ where: "generateFurtherReading" });
  });

  it("404s for someone else's session", async () => {
    const deps = makeDeps();
    await seedSession(deps);
    await expect(handleReading(deps, "33333333-3333-4333-8333-333333333333", "s1")).rejects.toMatchObject({ status: 404 });
  });
});
