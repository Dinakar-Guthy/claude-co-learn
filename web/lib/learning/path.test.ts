import { describe, expect, it } from "vitest";
import type { LearningPath } from "@/lib/contracts/session";
import { ANON, makeDeps, seedSession } from "./test-helpers";
import { handleMovePart, movePart } from "./path";

const path: LearningPath = {
  topic: "Rome",
  parts: [
    { title: "A", summary: "a", status: "done" },
    { title: "B", summary: "b", status: "current" },
    { title: "C", summary: "c", status: "todo" },
    { title: "D", summary: "d", status: "todo" },
    { title: "E", summary: "e", status: "todo" },
  ],
};
const titles = (p: LearningPath) => p.parts.map((x) => x.title).join("");

describe("movePart", () => {
  it("reorders the parts still to come, never before the current one", () => {
    expect(titles(movePart(path, 4, 2))).toBe("ABECD");
    expect(titles(movePart(path, 2, 3))).toBe("ABDCE");
    expect(titles(movePart(path, 4, 0))).toBe("ABECD"); // clamped to the first open slot
  });

  it("refuses to move a done or current part", () => {
    expect(() => movePart(path, 1, 3)).toThrow(/haven't started/);
    expect(() => movePart(path, 0, 3)).toThrow(/haven't started/);
  });
});

describe("handleMovePart", () => {
  it("saves the new order", async () => {
    const deps = makeDeps();
    await seedSession(deps, { path });
    const { body } = await handleMovePart(deps, ANON, "s1", { from: 4, to: 2 });
    expect(titles(body.path)).toBe("ABECD");
    expect(titles((await deps.store.getSession("s1"))!.path!)).toBe("ABECD");
  });

  it("409s without a path", async () => {
    const deps = makeDeps();
    await seedSession(deps);
    await expect(handleMovePart(deps, ANON, "s1", { from: 1, to: 0 })).rejects.toMatchObject({ status: 409 });
  });
});
