import { describe, expect, it, vi } from "vitest";
import type { Intent } from "@/lib/contracts/session";
import { CreateSessionRequestSchema, createSession, enrichSession, titleFromGoal } from "./session";
import { getChapter, getSessionView } from "./view";
import { ANON, OTHER, makeDeps, mockContent, seedMoment, seedSession } from "./test-helpers";

const intent: Intent = { goal: "Help me train a model to predict customer churn from this CSV", familiarity: "new", minutes: 10, demo: true };

describe("createSession", () => {
  it("creates an active session with fresh state, an empty transcript, and an event", async () => {
    const deps = makeDeps();
    const { body, background } = await createSession(deps, ANON, intent);
    const session = await deps.store.getSession(body.sessionId);
    expect(session).toMatchObject({
      anonId: ANON,
      status: "active",
      fileIds: [],
      demoFileAttached: false,
      story: { chapters: [] },
      engine: { momentsShownAt: [], conceptsSinceBoss: [], bosses: [], recentOutcomes: [], turnsSinceMoment: 0 },
    });
    expect(session?.title.length).toBeLessThanOrEqual(40);
    expect(await deps.store.getTranscript(body.sessionId)).toEqual([]);
    expect(deps.store.events[0]).toMatchObject({ name: "session_created", sessionId: body.sessionId });
    expect(background).toHaveLength(1);
  });

  it("validates the intent and applies defaults", () => {
    expect(CreateSessionRequestSchema.safeParse({ intent: { goal: "  ", familiarity: "new" } }).success).toBe(false);
    expect(CreateSessionRequestSchema.safeParse({ intent: { goal: "x", familiarity: "expert" } }).success).toBe(false);
    const ok = CreateSessionRequestSchema.parse({ intent: { goal: " SQL report ", familiarity: "some" } });
    expect(ok.intent).toEqual({ goal: "SQL report", familiarity: "some", minutes: 10, demo: false });
  });

  it("derives a short title at a word boundary", () => {
    expect(titleFromGoal("Short goal")).toBe("Short goal");
    const t = titleFromGoal(intent.goal);
    expect(t.length).toBeLessThanOrEqual(40);
    expect(t.endsWith("…")).toBe(true);
    expect(t).toBe("Help me train a model to predict…");
  });
});

describe("enrichSession", () => {
  it("patches sketch, title and bible without clobbering concurrent engine/container writes", async () => {
    const deps = makeDeps();
    const content = mockContent({
      // Simulates Track A writing while the sketch is being generated.
      generateSketch: vi.fn(async () => {
        const latest = (await deps.store.getSession("s1"))!;
        await deps.store.putSession({ ...latest, containerId: "cont_1", fileIds: ["f1"], engine: { ...latest.engine, turnsSinceMoment: 3 } });
        return { title: "Churn model", goalSummary: "g", novice: true, milestones: ["a"], conceptRadar: [] };
      }),
    });
    deps.content = content;
    await seedSession(deps);
    await enrichSession(deps, "s1");
    const s = await deps.store.getSession("s1");
    expect(s).toMatchObject({ title: "Churn model", containerId: "cont_1", fileIds: ["f1"], engine: { turnsSinceMoment: 3 } });
    expect(s?.sketch?.title).toBe("Churn model");
    expect(s?.story.bible?.genre).toBe("sky-pirate romp");
  });

  it("keeps whatever succeeded and logs the failure", async () => {
    const deps = makeDeps(mockContent({ generateSketch: vi.fn(async () => Promise.reject(new Error("boom"))) }));
    await seedSession(deps);
    await enrichSession(deps, "s1");
    const s = await deps.store.getSession("s1");
    expect(s?.sketch).toBeUndefined();
    expect(s?.title).toBe("Churn");
    expect(s?.story.bible).toBeDefined();
    expect(deps.store.events.find((e) => e.name === "error")?.props).toMatchObject({ where: "enrichSession" });
  });
});

describe("session views", () => {
  it("maps moments, bosses, chapters and endsAt, without answer keys", async () => {
    const deps = makeDeps();
    await seedSession(deps, {
      story: { chapters: [{ id: "c1", trigger: "boss:b1", title: "T", text: "x", summary: "y", createdAt: 1 }] },
    });
    await seedMoment(deps);
    const view = await getSessionView(deps, ANON, "s1");
    expect(view.endsAt).toBe(view.createdAt + 10 * 60_000);
    expect(view.moments.m1.question).toBe("Why is accuracy misleading here?");
    expect(JSON.stringify(view)).not.toContain("ideal_answer");
    expect(view.chapters.c1.title).toBe("T");
    expect(await getChapter(deps, ANON, "s1", "boss:b1")).toMatchObject({ id: "c1" });
    expect(await getChapter(deps, ANON, "s1", "wrapup")).toBeNull();
    await expect(getSessionView(deps, OTHER, "s1")).rejects.toMatchObject({ status: 404 });
  });
});
