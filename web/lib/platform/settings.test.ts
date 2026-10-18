import { describe, expect, it } from "vitest";
import { newUser } from "@/lib/store/defaults";
import { applySettingsUpdate } from "./settings";

const user = () => {
  const u = newUser("u1", 1);
  u.unlocks.themes.push("ember");
  return u;
};

describe("applySettingsUpdate", () => {
  it("merges partial settings without touching the rest", () => {
    const r = applySettingsUpdate(user(), { volume: 0.8, sound: false });
    expect(r.ok && r.user.settings).toEqual({ ...user().settings, volume: 0.8, sound: false });
    expect(r.ok && r.guardrailsEvent).toBeUndefined();
  });

  it("rejects out-of-range volume, unknown keys, bad modes and non-objects", () => {
    for (const body of [{ volume: 1.5 }, { volume: -0.1 }, { xp: 9999 }, { guardrails: { enabled: true, mode: "max" } }, null, "x", []]) {
      expect(applySettingsUpdate(user(), body).ok).toBe(false);
    }
  });

  it("only allows unlocked themes and sound packs", () => {
    expect(applySettingsUpdate(user(), { theme: "ember" }).ok).toBe(true);
    const locked = applySettingsUpdate(user(), { theme: "neon" });
    expect(locked).toEqual({ ok: false, error: expect.stringMatching(/theme isn't unlocked/) });
    expect(applySettingsUpdate(user(), { soundPack: "retro" }).ok).toBe(false);
    expect(applySettingsUpdate(user(), { soundPack: "soft-chimes" }).ok).toBe(true);
  });

  it("emits guardrails_changed only when guardrails actually change", () => {
    const same = applySettingsUpdate(user(), { guardrails: { enabled: false, mode: "balanced" } });
    expect(same.ok && same.guardrailsEvent).toBeUndefined();

    const changed = applySettingsUpdate(user(), { guardrails: { enabled: true, mode: "strict" } });
    expect(changed.ok && changed.user.settings.guardrails).toEqual({ enabled: true, mode: "strict" });
    expect(changed.ok && changed.guardrailsEvent).toEqual({
      name: "guardrails_changed",
      props: { enabled: true, mode: "strict", prevEnabled: false, prevMode: "balanced" },
    });
  });

  it("merges a partial guardrails object", () => {
    const r = applySettingsUpdate(user(), { guardrails: { enabled: true } });
    expect(r.ok && r.user.settings.guardrails).toEqual({ enabled: true, mode: "balanced" });
  });
});
