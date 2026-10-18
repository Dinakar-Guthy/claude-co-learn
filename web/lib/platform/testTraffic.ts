/**
 * Test-traffic tagging: a browser that visits /api/test-mode?on=1 gets a `cl_test` cookie, and every Co-learn
 * identity it uses is recorded as a test user. /insights excludes test users by default, so the owner's and
 * automated testing never pollutes the numbers reviewers see.
 */
import { cookies } from "next/headers";
import { getStore } from "@/lib/store";

export const TEST_COOKIE = "cl_test";
const ONE_YEAR_S = 365 * 24 * 60 * 60;

export async function isTestBrowser(): Promise<boolean> {
  return (await cookies()).get(TEST_COOKIE)?.value === "1";
}

/** Records `anonId` as a test user if this browser is in test mode. Never throws (tagging is best-effort). */
export async function tagIfTest(anonId: string): Promise<void> {
  try {
    if (await isTestBrowser()) await getStore().markTestUser(anonId);
  } catch {
    // Tagging must never break a real request.
  }
}

export async function setTestMode(on: boolean): Promise<void> {
  const jar = await cookies();
  if (on) jar.set({ name: TEST_COOKIE, value: "1", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: ONE_YEAR_S });
  else jar.delete(TEST_COOKIE);
}
