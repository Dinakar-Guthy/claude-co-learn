/**
 * Route-handler plumbing shared by the learning routes: identity, limits, metering, background work.
 * Errors are mapped by `routeErrorResponse` (lib/platform/http.ts).
 */
import { after } from "next/server";
import type { z } from "zod";
import { withUsageReporter, type UsageReporter } from "@/lib/claude/content/usage";
import { clientIp, readAnonId } from "@/lib/platform/anon";
import { HttpError, limitResponse, warningHeaders } from "@/lib/platform/http";
import { checkLimits, recordUsage } from "@/lib/platform/limits";
import type { BackgroundTask, LearningDeps } from "./deps";

export interface Caller {
  anonId: string;
  ip: string;
}

/** Identifies the caller from the anon cookie; throws 401 if it's missing. */
export async function requireCaller(request: Request): Promise<Caller> {
  const anonId = await readAnonId();
  if (!anonId) throw new HttpError(401, "Type /co-learn to start a session first.", "no_session");
  return { anonId, ip: clientIp(request) };
}

export async function readBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const raw: unknown = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return parsed.data;
}

export type LimitGate = { blocked: Response } | { blocked?: undefined; headers?: HeadersInit };

/**
 * Rate-limit and spend-cap check before any Claude-backed work: a 429 to send if blocked, otherwise
 * `headers` for the success response (carrying the fail-open warning header, if any).
 */
export async function checkCallerLimits(caller: Caller): Promise<LimitGate> {
  const check = await checkLimits(caller.anonId, caller.ip);
  if (!check.ok) return { blocked: limitResponse(check) };
  return { headers: warningHeaders(check.warning) };
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
