/**
 * Anonymous identity via a server-set HttpOnly cookie (survives Safari's 7-day script-storage purge).
 * Track E may extend (e.g. IP extraction helpers live in lib/platform/).
 */
import { cookies } from "next/headers";
import { ANON_COOKIE } from "@/lib/contracts/api";

const SIXTY_DAYS_S = 60 * 24 * 60 * 60;

export async function readAnonId(): Promise<string | null> {
  const value = (await cookies()).get(ANON_COOKIE)?.value;
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

/** Returns the existing anon ID or creates one and sets the cookie (Route Handlers / Server Functions only). */
export async function ensureAnonId(): Promise<string> {
  const id = (await readAnonId()) ?? crypto.randomUUID();
  await setAnonCookie(id);
  return id;
}

/** "Start over as a new user": this browser gets a fresh identity; the old data simply ages out (60-day TTL). */
export async function rotateAnonId(): Promise<string> {
  const id = crypto.randomUUID();
  await setAnonCookie(id);
  return id;
}

async function setAnonCookie(id: string): Promise<void> {
  (await cookies()).set({
    name: ANON_COOKIE,
    value: id,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SIXTY_DAYS_S, // refreshed on each unlock (sliding)
  });
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim();
}
