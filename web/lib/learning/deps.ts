/** Injected dependencies so learning logic is testable with a MemoryStore and a mocked ContentApi. */
import type { ContentApi } from "@/lib/contracts/content";
import type { EngineApi } from "@/lib/contracts/engine";
import type { Store } from "@/lib/contracts/store";
import { content } from "@/lib/claude/content";
import { engine } from "@/lib/engine";
import { getStore } from "@/lib/store";

export interface LearningDeps {
  store: Store;
  content: ContentApi;
  engine: EngineApi;
  now: () => number;
  newId: () => string;
}

export function defaultDeps(): LearningDeps {
  return { store: getStore(), content, engine, now: Date.now, newId: () => crypto.randomUUID() };
}

/** Work to run after the response is sent (routes hand these to `after()`). */
export type BackgroundTask = () => Promise<void>;

export interface HandlerResult<T> {
  body: T;
  background: BackgroundTask[];
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
