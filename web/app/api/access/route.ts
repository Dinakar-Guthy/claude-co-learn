import { cookies } from "next/headers";
import { ACCESS_COOKIE, ACCESS_MAX_AGE_S, accessToken, safeEqual } from "@/lib/platform/access";
import { jsonError } from "@/lib/platform/http";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const expected = process.env.SITE_PASSWORD;
  const given = typeof body?.password === "string" ? body.password : "";
  if (!expected) return jsonError(503, "Site password is not configured.", "not_configured");

  const [a, b] = await Promise.all([accessToken(given), accessToken(expected)]);
  if (!safeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return jsonError(401, "That password didn't work.", "wrong_password");
  }
  (await cookies()).set({
    name: ACCESS_COOKIE,
    value: b,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_MAX_AGE_S,
  });
  return Response.json({ ok: true });
}
