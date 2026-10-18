/** Route-handler plumbing shared by Track D routes: identity, limits, metering, background work, errors. */
import Anthropic from "@anthropic-ai/sdk";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import type { z } from "zod";
import { ContentRefusalError, ContentShapeError, ContentTruncatedError } from "@/lib/claude/content/errors";
import { withUsageReporter, type UsageReporter } from "@/lib/claude/content/usage";
import { clientIp, readAnonId } from "@/lib/platform/anon";
import { checkLimits, recordUsage } from "@/lib/platform/limits";
import { HttpError, type BackgroundTask, type LearningDeps } from "./deps";

export interface Caller {
  anonId: string;
  ip: string;
}

type ErrorBody = { error: string; code?: string; retryable?: boolean };
const errorJson = (status: number, body: ErrorBody) => Response.json(body, { status });

/** Identifies the caller from the anon cookie; throws 401 if it's missing. */
export async function requireCaller(request: Request): Promise<Caller> {
  const anonId = await readAnonId();
  if (!anonId) throw new HttpError(401, "Type /co-learn to start a session first.");
  return { anonId, ip: clientIp(request) };
}

export async function readBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const raw: unknown = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return parsed.data;
}

/** Rate-limit and spend-cap check before any Claude-backed work. Returns a response to send if blocked. */
export async function limitBlock(caller: Caller): Promise<Response | null> {
  const check = await checkLimits(caller.anonId, caller.ip);
  if (check.ok) return null;
  return errorJson(429, { error: check.message, code: check.code, retryable: check.code === "rate_limited" });
}

export const meter = (caller: Caller): UsageReporter => (model, usage) => recordUsage(caller.anonId, caller.ip, model, usage);

export function metered<T>(caller: Caller, fn: () => Promise<T>): Promise<T> {
  return withUsageReporter(meter(caller), fn);
}

/** Runs background tasks after the response is sent, metered, with failures logged rather than thrown. */
export function schedule(deps: LearningDeps, caller: Caller, sessionId: string, tasks: BackgroundTask[]): void {
  if (!tasks.length) return;
  after(() =>
    metered(caller, async () => {
      for (const task of tasks) {
        try {
          await task();
        } catch (err) {
          await deps.store
            .logEvent({ at: deps.now(), anonId: caller.anonId, sessionId, name: "error", props: { where: "background", message: describe(err) } })
            .catch(() => undefined);
        }
      }
    }),
  );
}

function describe(err: unknown): string {
  return (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 200);
}

/** Maps thrown errors to JSON responses, most specific first. Call from a route's catch block. */
export function errorResponse(err: unknown): Response {
  // Framework control flow (e.g. cookies() during prerender) must propagate to Next.js.
  unstable_rethrow(err);
  if (err instanceof HttpError) return errorJson(err.status, { error: err.message });
  if (err instanceof ContentRefusalError) return errorJson(422, { error: "Claude couldn't help with that one. Try rephrasing or skip it.", code: "refusal" });
  if (err instanceof ContentTruncatedError || err instanceof ContentShapeError) return errorJson(502, { error: "That didn't come out right. Please try again.", code: "upstream", retryable: true });
  if (err instanceof Anthropic.RateLimitError) return errorJson(503, { error: "Claude is busy right now. Please try again in a moment.", code: "upstream", retryable: true });
  if (err instanceof Anthropic.BadRequestError) {
    console.error("[colearn] Claude bad request:", describe(err));
    return errorJson(502, { error: "Something went wrong talking to Claude.", code: "bad_request" });
  }
  if (err instanceof Anthropic.APIError) return errorJson(502, { error: "Claude is unavailable right now. Please try again.", code: "upstream", retryable: true });
  console.error("[colearn] unexpected error:", describe(err));
  return errorJson(500, { error: "Something went wrong." });
}
