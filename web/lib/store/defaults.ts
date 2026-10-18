import type { User } from "@/lib/contracts/session";
import type { UserSettings } from "@/lib/contracts/engine";

export const DEFAULT_SETTINGS: UserSettings = {
  sound: true,
  volume: 0.4,
  theme: "frost",
  soundPack: "soft-chimes",
  guardrails: { enabled: false, mode: "balanced" },
};

export function newUser(anonId: string, now = Date.now()): User {
  return {
    anonId,
    createdAt: now,
    xp: 0,
    level: 1,
    unlocks: { themes: ["frost"], soundPacks: ["soft-chimes"] },
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}
