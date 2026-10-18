/**
 * Confetti for the two biggest moments only (level-up, boss victory). P2: one celebration per milestone,
 * so each key fires once and a cooldown stops back-to-back bursts (e.g. a boss win that also levels you up).
 * canvas-confetti skips itself when the user prefers reduced motion.
 */
export type CelebrationKind = "levelUp" | "bossVictory";

const COOLDOWN_MS = 4000;
const fired = new Set<string>();
let lastAt = -Infinity;

function themeColors(): string[] {
  const s = getComputedStyle(document.documentElement);
  const colors = ["--primary", "--accent", "--success"].map((v) => s.getPropertyValue(v).trim()).filter(Boolean);
  return colors.length ? colors : ["#2f6faf", "#7fb3e0", "#2e7d5b"];
}

/** Returns true if confetti fired. `key` identifies the milestone (e.g. "levelup:3", "boss:<id>"). */
export async function celebrate(key: string, kind: CelebrationKind = "levelUp"): Promise<boolean> {
  if (typeof window === "undefined" || fired.has(key)) return false;
  const now = Date.now();
  if (now - lastAt < COOLDOWN_MS) return false;
  fired.add(key);
  lastAt = now;
  const { default: confetti } = await import("canvas-confetti");
  await confetti({
    particleCount: kind === "bossVictory" ? 120 : 80,
    spread: kind === "bossVictory" ? 90 : 70,
    startVelocity: 35,
    ticks: 180,
    scalar: 0.9,
    origin: { y: 0.7 },
    colors: themeColors(),
    disableForReducedMotion: true,
  });
  return true;
}
