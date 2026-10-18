/**
 * Per-tab test mode: open any page with `?test=1` and this tab (only) sends `X-Colearn-Test: 1` with every API
 * request, so its telemetry is tagged as test traffic and left out of /insights. `?test=0`, or closing the tab,
 * ends it. Stored in sessionStorage, so it never sticks to the browser or the person.
 */
export const TEST_HEADER = "X-Colearn-Test";
const KEY = "cl_test_tab";

export function isTestTab(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flag = new URLSearchParams(window.location.search).get("test");
    if (flag === "1") window.sessionStorage.setItem(KEY, "1");
    if (flag === "0") window.sessionStorage.removeItem(KEY);
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Headers to add to an API request from this tab. */
export function testHeaders(): Record<string, string> {
  return isTestTab() ? { [TEST_HEADER]: "1" } : {};
}
