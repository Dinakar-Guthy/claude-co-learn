import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStore } from "@/lib/store";
import { makeSession } from "@/lib/claude/work/testing";

const anon = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/lib/platform/anon", () => ({ readAnonId: async () => anon.id, clientIp: () => "1.2.3.4" }));

const { POST } = await import("./route");

const post = (body: unknown) => POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/chat", () => {
  beforeEach(async () => {
    anon.id = makeSession().anonId;
    await getStore().putSession(makeSession());
  });

  it("401s without the anon cookie", async () => {
    anon.id = null;
    expect((await post({ sessionId: "s1", kind: "continue" })).status).toBe(401);
  });

  it("404s for someone else's session", async () => {
    anon.id = "00000000-0000-4000-8000-0000000000ff";
    expect((await post({ sessionId: "s1", kind: "continue" })).status).toBe(404);
  });

  it("400s for an over-long message", async () => {
    const res = await post({ sessionId: "s1", kind: "message", text: "x".repeat(4001) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Messages are limited to 4000 characters." });
  });
});
