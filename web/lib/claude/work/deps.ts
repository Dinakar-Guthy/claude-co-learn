/** Injected dependencies for the work loop (real implementations by default; fakes in tests). */
import type Anthropic from "@anthropic-ai/sdk";
import type { ContentApi } from "@/lib/contracts/content";
import type { EngineApi } from "@/lib/contracts/engine";
import type { Store } from "@/lib/contracts/store";
import { anthropic } from "@/lib/claude/client";
import { content } from "@/lib/claude/content";
import { engine } from "@/lib/engine";
import { checkLimits, recordUsage, type LimitCheck } from "@/lib/platform/limits";
import { getStore } from "@/lib/store";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ModelStream } from "./stream";

export type ModelParams = BetaMessageStreamParams;

export interface WorkDeps {
  store: Store;
  engine: EngineApi;
  content: Pick<ContentApi, "verifyMoment">;
  startStream(params: ModelParams, signal: AbortSignal): ModelStream;
  checkLimits(anonId: string, ip: string): Promise<LimitCheck>;
  recordUsage(anonId: string, ip: string, model: string, usage: Anthropic.Beta.BetaUsage): Promise<void>;
  now(): number;
  newId(): string;
  /** Files API id of the demo churn CSV (env DEMO_FILE_ID). */
  demoFileId?: string;
}

export function defaultDeps(): WorkDeps {
  return {
    store: getStore(),
    engine,
    content,
    startStream: (params, signal) => anthropic().beta.messages.stream(params, { signal }),
    checkLimits,
    recordUsage,
    now: Date.now,
    newId: () => crypto.randomUUID(),
    demoFileId: process.env.DEMO_FILE_ID || undefined,
  };
}
