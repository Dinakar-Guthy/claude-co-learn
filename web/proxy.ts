import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessToken, decideAccess } from "@/lib/platform/access";

/** Reviewer password gate in front of every page and API route (see lib/platform/access.ts). */
export async function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  const decision = decideAccess({
    pathname: request.nextUrl.pathname,
    cookie: request.cookies.get(ACCESS_COOKIE)?.value,
    expectedToken: password ? await accessToken(password) : null,
    production: process.env.NODE_ENV === "production",
  });

  switch (decision) {
    case "allow":
      return NextResponse.next();
    case "unauthorized":
      return NextResponse.json({ error: "Access password required." }, { status: 401 });
    case "misconfigured":
      return new NextResponse("Co-learn is not configured yet (missing site password).", { status: 503 });
    case "redirect": {
      const url = new URL("/access", request.url);
      const next = request.nextUrl.pathname + request.nextUrl.search;
      if (next !== "/") url.searchParams.set("next", next);
      return NextResponse.redirect(url);
    }
  }
}

export const config = {
  // Everything except Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sounds/).*)"],
};
