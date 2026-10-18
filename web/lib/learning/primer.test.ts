import { describe, expect, it } from "vitest";
import { primerLine } from "@/lib/claude/work/context";
import { toSessionView } from "@/lib/views";
import { handlePrimer } from "./primer";
import { enrichSession } from "./session";
import { ANON, makeDeps, seedSession } from "./test-helpers";

describe("novice primer", () => {
  it("is generated in the background only for 'New to this' learners", async () => {
    const deps = makeDeps();
    await seedSession(deps, { intent: { goal: "Train a churn model", familiarity: "new", minutes: 10, demo: true } });
    await enrichSession(deps, "s1");
    expect((await deps.store.getSession("s1"))?.primer?.ideas).toHaveLength(2);

    const other = makeDeps();
    await seedSession(other, { intent: { goal: "Train a churn model", familiarity: "some", minutes: 10, demo: true } });
    await enrichSession(other, "s1");
    expect((await other.store.getSession("s1"))?.primer).toBeUndefined();
    expect(other.content.generatePrimer).not.toHaveBeenCalled();
  });

  it("hides the answer key until the check is answered, then awards 5 XP once (no mastery change)", async () => {
    const deps = makeDeps();
    const session = await seedSession(deps, { intent: { goal: "g", familiarity: "new", minutes: 10, demo: true } });
    await enrichSession(deps, "s1");
    const before = toSessionView((await deps.store.getSession("s1"))!, [], [], []);
    expect(before.primer?.check.answered).toBeUndefined();
    expect(JSON.stringify(before.primer)).not.toContain("correctIndex");

    const { body } = await handlePrimer(deps, ANON, session.id, { action: "answer", choice: 0 });
    expect(body.primer.check.answered).toMatchObject({ choice: 0, correct: true, correctIndex: 0 });
    expect(body.xp?.amount).toBe(5);
    const again = await handlePrimer(deps, ANON, session.id, { action: "answer", choice: 1 });
    expect(again.body.xp).toBeUndefined();
    expect((await deps.store.getUser(ANON))?.xp).toBe(5);
    expect(await deps.store.getMastery(ANON)).toEqual({});
  });

  it("can be dismissed", async () => {
    const deps = makeDeps();
    await seedSession(deps, { intent: { goal: "g", familiarity: "new", minutes: 10, demo: true } });
    await enrichSession(deps, "s1");
    const { body } = await handlePrimer(deps, ANON, "s1", { action: "dismiss" });
    expect(body.primer.dismissed).toBe(true);
  });

  it("tells the work model which basics were covered", () => {
    expect(primerLine(["**Model**: learns patterns.", "**Test set**: held back."])).toContain("covering: Model, Test set");
  });
});
