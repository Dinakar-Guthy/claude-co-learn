/**
 * Spend metering without widening ContentApi's signatures: routes run content calls inside
 * `withUsageReporter(reporter, fn)` and every Claude response inside reports its usage there.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type Anthropic from "@anthropic-ai/sdk";

export type ApiUsage = Anthropic.Usage | Anthropic.Beta.BetaUsage;
export type UsageReporter = (model: string, usage: ApiUsage) => Promise<void>;

const storage = new AsyncLocalStorage<UsageReporter>();

export function withUsageReporter<T>(reporter: UsageReporter, fn: () => Promise<T>): Promise<T> {
  return storage.run(reporter, fn);
}

export async function reportUsage(model: string, usage: ApiUsage): Promise<void> {
  const reporter = storage.getStore();
  if (!reporter) return;
  try {
    await reporter(model, usage);
  } catch {
    // Metering must never break the user-facing call.
  }
}
