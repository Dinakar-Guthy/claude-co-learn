import { afterEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { redirect } from "next/navigation";
import { ContentRefusalError, ContentShapeError } from "@/lib/claude/content/errors";
import { StoreError } from "@/lib/store/errors";
import { HttpError, jsonError, limitResponse, routeErrorResponse, WARNING_HEADER, warningHeaders } from "./http";

const read = async (res: Response) => ({ status: res.status, body: await res.json() });

afterEach(() => vi.restoreAllMocks());

describe("jsonError", () => {
  it("only includes the fields it was given", async () => {
    expect(await read(jsonError(400, "Bad."))).toEqual({ status: 400, body: { error: "Bad." } });
    expect(await read(jsonError(503, "Busy.", "upstream", { retryable: true }))).toEqual({ status: 503, body: { error: "Busy.", code: "upstream", retryable: true } });
  });
});

describe("limitResponse", () => {
  it("is a retryable 429 with Retry-After for rate limits", async () => {
    const res = limitResponse({ ok: false, code: "rate_limited", message: "Slow down.", retryAfterS: 7 });
    expect(res.headers.get("Retry-After")).toBe("7");
    expect(await read(res)).toEqual({ status: 429, body: { error: "Slow down.", code: "rate_limited", retryable: true } });
  });

  it("is a non-retryable 429 without Retry-After for spend caps", async () => {
    const res = limitResponse({ ok: false, code: "spend_cap", message: "Daily limit." });
    expect(res.headers.get("Retry-After")).toBeNull();
    expect((await res.json()).retryable).toBe(false);
  });
});

describe("warningHeaders", () => {
  it("URI-encodes the warning into X-Colearn-Warning, or adds nothing", () => {
    const res = Response.json({}, { headers: warningHeaders("Heads up: limits aren't working.") });
    expect(decodeURIComponent(res.headers.get(WARNING_HEADER)!)).toBe("Heads up: limits aren't working.");
    expect(warningHeaders(undefined)).toBeUndefined();
  });
});

describe("routeErrorResponse", () => {
  it("rethrows Next.js control flow first", () => {
    let thrown: unknown;
    try {
      redirect("/elsewhere");
    } catch (e) {
      thrown = e;
    }
    expect(() => routeErrorResponse(thrown)).toThrow();
  });

  it("maps known errors to friendly statuses and codes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await read(routeErrorResponse(new HttpError(404, "Session not found", "not_found")))).toEqual({ status: 404, body: { error: "Session not found", code: "not_found" } });
    expect(await read(routeErrorResponse(new HttpError(400, "Answer is empty")))).toEqual({ status: 400, body: { error: "Answer is empty" } });
    expect(await read(routeErrorResponse(new StoreError("getUser")))).toMatchObject({ status: 503, body: { code: "store_unavailable", retryable: true } });
    expect(await read(routeErrorResponse(new ContentRefusalError("grade", null)))).toMatchObject({ status: 422, body: { code: "refusal" } });
    expect(await read(routeErrorResponse(new ContentShapeError("grade", "bad json")))).toMatchObject({ status: 502, body: { code: "upstream", retryable: true } });
    const rateLimited = new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers());
    expect(await read(routeErrorResponse(rateLimited))).toMatchObject({ status: 503, body: { code: "upstream", retryable: true } });
  });

  it("logs unknown errors redacted and returns a generic 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = routeErrorResponse(new Error(`boom with key ${"k".repeat(40)}`), "POST /api/x");
    expect(await read(res)).toEqual({ status: 500, body: { error: "Something went wrong on our side. Please try again.", code: "internal" } });
    expect(log.mock.calls[0][0]).toContain("[POST /api/x]");
    expect(log.mock.calls[0][0]).not.toContain("k".repeat(40));
  });
});
