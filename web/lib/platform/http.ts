/**
 * Response helpers shared by every route handler.
 * Error bodies are always `{ error: string, code?: string, retryable?: boolean }`; `error` is safe to show the user.
 */
import Anthropic from "@anthropic-ai/sdk";
import { unstable_rethrow } from "next/navigation";
import { ContentRefusalError, ContentShapeError, ContentTruncatedError } from "@/lib/claude/content/errors";
import { isStoreError, redactError, STORE_ERROR_MESSAGE } from "@/lib/store/errors";
import type { LimitCheck } from "./limits";

export interface ErrorBody {
  error: string;
  code?: string;
  retryable?: boolean;
}

/** A failure with a user-facing message and HTTP status; throw it from route logic and let `routeErrorResponse` map it. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function jsonError(status: number, error: string, code?: string, init: { retryable?: boolean; headers?: HeadersInit } = {}): Response {
  const body: ErrorBody = { error };
  if (code) body.code = code;
  if (init.retryable !== undefined) body.retryable = init.retryable;
  return Response.json(body, { status, headers: init.headers });
}

export const unauthorized = (message = "Type /co-learn to switch on Co-learn mode.") => jsonError(401, message, "no_session");
export const notFound = () => jsonError(404, "Not found.", "not_found");

/** 429 for a failed `checkLimits`, with Retry-After when known. */
export function limitResponse(check: Extract<LimitCheck, { ok: false }>): Response {
  const headers = check.retryAfterS ? { "Retry-After": String(check.retryAfterS) } : undefined;
  return jsonError(429, check.message, check.code, { retryable: check.code === "rate_limited", headers });
}

/**
 * Response header carrying a non-blocking limits warning (`checkLimits` → `{ ok: true, warning }`, fail-open).
 * The value is URI-encoded; read it with `decodeURIComponent(res.headers.get(WARNING_HEADER))`.
 */
export const WARNING_HEADER = "X-Colearn-Warning";

export function warningHeaders(warning: string | undefined): HeadersInit | undefined {
  return warning ? { [WARNING_HEADER]: encodeURIComponent(warning) } : undefined;
}

/** Maps a thrown error to a JSON response, most specific first. Call from every route's catch block. */
export function routeErrorResponse(err: unknown, route = "api"): Response {
  // Framework control flow (e.g. cookies() during prerender, redirect, notFound) must propagate to Next.js.
  unstable_rethrow(err);
  if (err instanceof HttpError) return jsonError(err.status, err.message, err.code);
  if (isStoreError(err)) return jsonError(503, STORE_ERROR_MESSAGE, "store_unavailable", { retryable: true });
  if (err instanceof ContentRefusalError) return jsonError(422, "Claude couldn't help with that one. Try rephrasing or skip it.", "refusal");
  if (err instanceof ContentTruncatedError || err instanceof ContentShapeError) {
    return jsonError(502, "That didn't come out right. Please try again.", "upstream", { retryable: true });
  }
  if (err instanceof Anthropic.RateLimitError) return jsonError(503, "Claude is busy right now. Please try again in a moment.", "upstream", { retryable: true });
  if (err instanceof Anthropic.BadRequestError) {
    console.error(`[${route}] Claude bad request (${redactError(err)})`);
    return jsonError(502, "Something went wrong talking to Claude.", "bad_request");
  }
  if (err instanceof Anthropic.APIError) return jsonError(502, "Claude is unavailable right now. Please try again.", "upstream", { retryable: true });
  console.error(`[${route}] unexpected error (${redactError(err)})`);
  return jsonError(500, "Something went wrong on our side. Please try again.", "internal");
}
