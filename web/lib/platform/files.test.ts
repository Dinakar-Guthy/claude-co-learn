import { describe, expect, it } from "vitest";
import { makeSession } from "@/lib/store/fixtures";
import { contentDisposition, isValidFileId, ownsFile, servableContentType } from "./files";

describe("file proxy rules", () => {
  it("requires the session owner and a file produced in that session", () => {
    const s = makeSession("s1", "u1", 1, { fileIds: ["file_abc"] });
    expect(ownsFile(s, "u1", "file_abc")).toBe(true);
    expect(ownsFile(s, "u2", "file_abc")).toBe(false);
    expect(ownsFile(s, "u1", "file_other")).toBe(false);
    expect(ownsFile(null, "u1", "file_abc")).toBe(false);
  });

  it("validates file ids", () => {
    expect(isValidFileId("file_011CNha8iCJcU1wXNR6q4V8w")).toBe(true);
    for (const bad of ["", "../etc", "a/b", "x".repeat(129), "id?x=1"]) expect(isValidFileId(bad)).toBe(false);
  });

  it("serves images and CSV only, never SVG", () => {
    expect(servableContentType("image/png")).toBe("image/png");
    expect(servableContentType("IMAGE/JPEG")).toBe("image/jpeg");
    expect(servableContentType("text/csv; charset=latin1")).toBe("text/csv; charset=utf-8");
    for (const bad of ["image/svg+xml", "text/html", "application/pdf", "text/plain", "", null, undefined]) {
      expect(servableContentType(bad)).toBeNull();
    }
  });

  it("builds a safe Content-Disposition", () => {
    expect(contentDisposition("image/png", "chart 1.png")).toBe('inline; filename="chart_1.png"');
    expect(contentDisposition("text/csv; charset=utf-8", 'a"b.csv')).toBe('attachment; filename="a_b.csv"');
  });
});
