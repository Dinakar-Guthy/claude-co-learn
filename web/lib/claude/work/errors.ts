/** Maps failures to friendly stream errors. */
import Anthropic from "@anthropic-ai/sdk";
import type { ChatStreamEvent } from "@/lib/contracts/stream";

type ErrorEvent = Extract<ChatStreamEvent, { type: "error" }>;

/** A 400/404 about the container (expired or unknown id): retry once without it. */
export function isContainerError(err: unknown): boolean {
  return (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) && /container/i.test(err.message);
}

export function isAbort(err: unknown): boolean {
  return err instanceof Anthropic.APIUserAbortError || (err instanceof Error && err.name === "AbortError");
}

export function toErrorEvent(err: unknown): ErrorEvent {
  if (err instanceof Anthropic.RateLimitError) {
    return { type: "error", message: "Claude is getting a lot of requests right now. Try again in a few seconds.", retryable: true, code: "upstream" };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { type: "error", message: "That request couldn't be processed. Try rephrasing, or start a new session.", retryable: false, code: "bad_request" };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { type: "error", message: "Couldn't reach Claude. Check your connection and try again.", retryable: true, code: "upstream" };
  }
  if (err instanceof Anthropic.APIError) {
    return { type: "error", message: "Claude ran into a problem. Try again in a moment.", retryable: true, code: "upstream" };
  }
  return { type: "error", message: "Something went wrong on our side. Try again.", retryable: true };
}

export const REFUSAL_ERROR: ErrorEvent = {
  type: "error",
  message: "Claude can't help with that request. Try rephrasing it or taking the work in a different direction.",
  retryable: false,
};

/** Loggable summary of an error, without request bodies or headers. */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.name} ${err.status ?? ""} ${err.message}`.trim();
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
