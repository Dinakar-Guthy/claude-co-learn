import { cookies } from "next/headers";
import { ACCESS_COOKIE, ACCESS_MAX_AGE_S, accessToken, safeEqual } from "@/lib/platform/access";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const expected = process.env.SITE_PASSWORD;
  const given = typeof body?.password === "string" ? body.password : "";
  if (!expected) return Response.json({ error: "Site password is not configured." }, { status: 503 });

  const [a, b] = await Promise.all([accessToken(given), accessToken(expected)]);
  if (!safeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return Response.json({ error: "That password didn't work." }, { status: 401 });
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
