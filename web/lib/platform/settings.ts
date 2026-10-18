/** Validation and merge for PATCH /api/user (UpdateSettingsRequest). Pure, so it is unit-tested directly. */
import { z } from "zod";
import type { User } from "@/lib/contracts/session";
import type { AppEvent } from "@/lib/contracts/session";

export const UpdateSettingsSchema = z
  .object({
    sound: z.boolean(),
    volume: z.number().min(0).max(1),
    theme: z.string().min(1).max(64),
    soundPack: z.string().min(1).max(64),
    // The contract sends the whole guardrails object; a partial one is merged rather than rejected.
    guardrails: z.object({ enabled: z.boolean(), mode: z.enum(["light", "balanced", "strict"]) }).partial(),
  })
  .partial()
  .strict();

export type SettingsUpdateResult =
  | { ok: true; user: User; guardrailsEvent?: Pick<AppEvent, "name" | "props"> }
  | { ok: false; error: string };

export function applySettingsUpdate(user: User, body: unknown): SettingsUpdateResult {
  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "Those settings don't look right. Please try again." };
  const { guardrails, ...rest } = parsed.data;

  if (rest.theme !== undefined && !user.unlocks.themes.includes(rest.theme)) {
    return { ok: false, error: "That theme isn't unlocked yet. Keep learning to earn it!" };
  }
  if (rest.soundPack !== undefined && !user.unlocks.soundPacks.includes(rest.soundPack)) {
    return { ok: false, error: "That sound pack isn't unlocked yet. Keep learning to earn it!" };
  }

  const prev = user.settings.guardrails;
  const next = { ...prev, ...guardrails };
  const updated: User = { ...user, settings: { ...user.settings, ...rest, guardrails: next } };
  const changed = next.enabled !== prev.enabled || next.mode !== prev.mode;
  return {
    ok: true,
    user: updated,
    guardrailsEvent: changed
      ? { name: "guardrails_changed", props: { enabled: next.enabled, mode: next.mode, prevEnabled: prev.enabled, prevMode: prev.mode } }
      : undefined,
  };
}
