/** Route-level tests for /api/user, /api/sessions, /api/files/[id] and /api/health (cookies and Anthropic mocked). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { MemoryStore } from "@/lib/store/memory";
import { newUser } from "@/lib/store/defaults";
import { makeSession } from "@/lib/store/fixtures";
import { getStore } from "@/lib/store";
import { StoreError } from "@/lib/store/errors";

const ANON = "11111111-2222-3333-4444-555555555555";
const cookie = vi.hoisted(() => ({ value: undefined as string | undefined, set: vi.fn() }));
const files = vi.hoisted(() => ({ retrieveMetadata: vi.fn(), download: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookie.value ? { value: cookie.value } : undefined), set: cookie.set }),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/claude/client", () => ({ anthropic: () => ({ files }) }));

const user = await import("./user/route");
const sessions = await import("./sessions/route");
const file = await import("./files/[id]/route");
const health = await import("./health/route");
const reset = await import("./user/reset/route");

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  (globalThis as { __colearnStore?: unknown }).__colearnStore = store;
  cookie.value = ANON;
  cookie.set.mockReset();
  files.retrieveMetadata.mockReset();
  files.download.mockReset();
});

const patch = (body: unknown) =>
  user.PATCH(new Request("http://x/api/user", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe("GET /api/user", () => {
  it("401s without a valid cookie", async () => {
    cookie.value = undefined;
    expect((await user.GET()).status).toBe(401);
    cookie.value = "not-a-uuid";
    expect((await user.GET()).status).toBe(401);
  });

  it("creates a missing user and returns a UserView", async () => {
    const res = await user.GET();
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view).toMatchObject({ xp: 0, level: { level: 1 }, unlocks: { themes: ["frost"] }, settings: { theme: "frost" } });
    expect(view.anonId).toBeUndefined();
    expect(await store.getUser(ANON)).not.toBeNull();
    expect(cookie.set).toHaveBeenCalledOnce(); // sliding cookie refresh
  });

  it("maps store failures to a friendly 503", async () => {
    store.getUser = () => Promise.reject(new StoreError("getUser"));
    const res = await user.GET();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("store_unavailable");
  });
});

describe("PATCH /api/user", () => {
  it("merges valid settings, saves them and logs guardrail changes", async () => {
    await store.putUser(newUser(ANON));
    const res = await patch({ volume: 0.9, guardrails: { enabled: true, mode: "light" } });
    expect(res.status).toBe(200);
    expect((await res.json()).settings).toMatchObject({ volume: 0.9, guardrails: { enabled: true, mode: "light" } });
    expect((await store.getUser(ANON))?.settings.volume).toBe(0.9);
    expect(store.events.map((e) => e.name)).toEqual(["guardrails_changed"]);
  });

  it("400s on invalid or locked settings without saving", async () => {
    await store.putUser(newUser(ANON));
    expect((await patch({ volume: 3 })).status).toBe(400);
    expect((await patch({ theme: "neon" })).status).toBe(400);
    expect((await store.getUser(ANON))?.settings.volume).toBe(0.4);
    expect(store.events).toHaveLength(0);
  });

  it("401s without a cookie", async () => {
    cookie.value = undefined;
    expect((await patch({ volume: 0.5 })).status).toBe(401);
  });
});

describe("GET /api/sessions", () => {
  it("lists only the caller's sessions, newest first", async () => {
    await store.putSession(makeSession("s1", ANON, 1));
    await store.putSession(makeSession("s2", ANON, 2));
    await store.putSession(makeSession("x", "someone-else", 3));
    const res = await sessions.GET();
    expect((await res.json()).map((s: { id: string }) => s.id)).toEqual(["s2", "s1"]);
  });
});

describe("GET /api/files/[id]", () => {
  const get = (id: string, sessionId = "s1") =>
    file.GET(new Request(`http://x/api/files/${id}?sessionId=${sessionId}`), { params: Promise.resolve({ id }) });

  beforeEach(async () => {
    await store.putSession(makeSession("s1", ANON, 1, { fileIds: ["file_chart", "file_html"] }));
    await store.putSession(makeSession("s2", "someone-else", 1, { fileIds: ["file_theirs"] }));
  });

  const meta = (mime_type: string, extra: object = {}) => ({ id: "f", filename: "chart.png", mime_type, size_bytes: 3, type: "file", created_at: "", ...extra });

  it("streams an owned image with caching headers", async () => {
    files.retrieveMetadata.mockResolvedValue(meta("image/png"));
    files.download.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    const res = await get("file_chart");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("404s for files outside the caller's session, without calling Anthropic", async () => {
    expect((await get("file_unknown")).status).toBe(404);
    expect((await get("file_theirs", "s2")).status).toBe(404);
    expect((await get("file_chart", "missing")).status).toBe(404);
    expect((await get("../../etc")).status).toBe(404);
    expect(files.retrieveMetadata).not.toHaveBeenCalled();
  });

  it("415s for content types other than images and CSV", async () => {
    files.retrieveMetadata.mockResolvedValue(meta("text/html"));
    expect((await get("file_html")).status).toBe(415);
    expect(files.download).not.toHaveBeenCalled();
  });

  it("404s when Anthropic no longer has the file", async () => {
    files.retrieveMetadata.mockRejectedValue(new Anthropic.NotFoundError(404, undefined, "gone", new Headers()));
    expect((await get("file_chart")).status).toBe(404);
  });
});

describe("GET /api/health", () => {
  it("reports booleans and the store kind only", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-secret");
    vi.stubEnv("DEMO_FILE_ID", "");
    const res = await health.GET();
    const body = await res.json();
    expect(body).toEqual({ ok: true, store: "memory", hasAnthropicKey: true, hasDemoFile: false, limitsDegraded: false });
    expect(JSON.stringify(body)).not.toContain("sk-test");
    vi.unstubAllEnvs();
  });
});

it("getStore returns the injected singleton", () => {
  expect(getStore()).toBe(store);
});

describe("POST /api/user/reset", () => {
  it("401s without a cookie", async () => {
    cookie.value = undefined;
    expect((await reset.POST()).status).toBe(401);
  });

  it("deletes the old identity's data and gives the browser a fresh level-1 identity", async () => {
    await store.putUser({ ...newUser(ANON), xp: 300 });
    const res = await reset.POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ xp: 0, level: { level: 1 } });
    const newId = cookie.set.mock.calls[0][0].value as string;
    expect(newId).not.toBe(ANON);
    expect(await store.getUser(newId)).toMatchObject({ xp: 0 });
    expect(await store.getUser(ANON)).toBeNull();
  });
});
