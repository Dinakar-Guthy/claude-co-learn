/**
 * Test traffic is tagged per request, never per person: a request carrying `X-Colearn-Test: 1` (sent by a browser
 * tab opened with `?test=1`, or by automated checks) has its telemetry events marked `props.test = true`, and
 * /insights leaves those out by default. Ordinary browsing is never tagged.
 */
import type { AppEvent } from "@/lib/contracts/session";
import type { Store } from "@/lib/contracts/store";

export const TEST_HEADER = "x-colearn-test";

/** True inside a request that carries the test header (false outside a request, e.g. in unit tests). */
export async function isTestRequest(): Promise<boolean> {
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get(TEST_HEADER) === "1";
  } catch {
    return false;
  }
}

/** Wraps a store so every event logged during a test request is tagged. */
export function tagTestEvents(store: Store): Store {
  const logEvent = async (event: AppEvent) =>
    store.logEvent((await isTestRequest()) ? { ...event, props: { ...event.props, test: true } } : event);
  return new Proxy(store, {
    get(target, prop, receiver) {
      if (prop === "logEvent") return logEvent;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
