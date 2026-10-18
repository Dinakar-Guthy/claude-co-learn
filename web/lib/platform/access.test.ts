import { describe, expect, it } from "vitest";
import { accessToken, decideAccess, safeEqual } from "./access";

describe("accessToken", () => {
  it("is deterministic and password-specific", async () => {
    expect(await accessToken("hunter2")).toBe(await accessToken("hunter2"));
    expect(await accessToken("hunter2")).not.toBe(await accessToken("hunter3"));
    expect(await accessToken("hunter2")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("safeEqual", () => {
  it("compares exactly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("decideAccess", () => {
  const base = { cookie: undefined, expectedToken: "tok", production: true };
  it("always allows the access page, access API, and health check", () => {
    for (const pathname of ["/access", "/api/access", "/api/health"]) expect(decideAccess({ ...base, pathname })).toBe("allow");
  });
  it("redirects pages and rejects APIs without a valid cookie", () => {
    expect(decideAccess({ ...base, pathname: "/" })).toBe("redirect");
    expect(decideAccess({ ...base, pathname: "/dev" })).toBe("redirect");
    expect(decideAccess({ ...base, pathname: "/api/chat" })).toBe("unauthorized");
    expect(decideAccess({ ...base, pathname: "/api/chat", cookie: "wrong" })).toBe("unauthorized");
  });
  it("allows with the right cookie", () => {
    expect(decideAccess({ ...base, pathname: "/api/chat", cookie: "tok" })).toBe("allow");
  });
  it("fails closed in production when no password is configured, open in development", () => {
    expect(decideAccess({ ...base, pathname: "/", expectedToken: null })).toBe("misconfigured");
    expect(decideAccess({ ...base, pathname: "/", expectedToken: null, production: false })).toBe("allow");
  });
});
