import { describe, expect, it, vi } from "vitest";
import { MemoryStore } from "./memory";

const header = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (name: string) => (name === "x-colearn-test" ? header.value : null) }) }));

const { tagTestEvents } = await import("./testTraffic");

describe("tagTestEvents", () => {
  it("tags events only for requests that carry the test header", async () => {
    const base = new MemoryStore();
    const store = tagTestEvents(base);
    header.value = null;
    await store.logEvent({ at: 1, anonId: "a", name: "unlock" });
    header.value = "1";
    await store.logEvent({ at: 2, anonId: "a", name: "unlock", props: { x: 1 } });
    expect(base.events.map((e) => e.props?.test ?? false)).toEqual([false, true]);
    expect(base.events[1].props).toMatchObject({ x: 1, test: true });
    // Other methods pass straight through.
    expect(await store.getUser("nobody")).toBeNull();
  });
});
