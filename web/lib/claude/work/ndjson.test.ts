import { describe, expect, it } from "vitest";
import { ndjsonResponse } from "./ndjson";

describe("ndjsonResponse", () => {
  it("streams one JSON event per line with the NDJSON content type", async () => {
    const res = ndjsonResponse(async (emit) => {
      emit({ type: "status", status: "thinking" });
      emit({ type: "turn_end", reason: "end_turn" });
    });
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toEqual([{ type: "status", status: "thinking" }, { type: "turn_end", reason: "end_turn" }]);
  });

  it("turns an unexpected failure into error + turn_end", async () => {
    const res = ndjsonResponse(async () => {
      throw new Error("boom");
    });
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(["error", "turn_end"]);
  });

  it("aborts the work when the client cancels", async () => {
    let aborted = false;
    const res = ndjsonResponse(
      (_emit, signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
        }),
    );
    await res.body!.cancel();
    expect(aborted).toBe(true);
  });
});
