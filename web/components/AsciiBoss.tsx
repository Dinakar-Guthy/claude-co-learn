/**
 * ASCII bosses (reference/ascii-characters.md). Bug frames are from the sheet; slime and ghost hit/defeated
 * frames follow the same style. Every frame is 6 lines so swapping frames never shifts the layout.
 */
export type BossKind = "bug" | "slime" | "ghost";
export type BossFrame = "full" | "hit" | "defeated";

const frame = (...lines: string[]) => {
  const padded = [...lines];
  while (padded.length < 6) padded.unshift("");
  return padded.join("\n");
};

export const BOSS_ART: Record<BossKind, Record<BossFrame, string>> = {
  bug: {
    full: frame("   \\    /", "  (o)  (o)", " /|------|\\", "  |      |", " /|------|\\", "   \\____/"),
    hit: frame("   \\    /", "  (>)  (<)", " /|------|\\", "  |  !!  |", " /|------|\\", "   \\____/"),
    defeated: frame("   x    x", "  (-)  (-)", " _|______|_", "  zzz"),
  },
  slime: {
    full: frame("    ______", "  /        \\", " |  O    O  |", " |    __    |", "  \\________/"),
    hit: frame("    ______  !", "  /        \\", " |  >    <  |", " |    ~~    |", "  \\________/"),
    defeated: frame("    ______", "  /  x  x  \\", " '~~~~~~~~~~'", "  zzz"),
  },
  ghost: {
    full: frame("    .-.", "   (o o)", "   | O |", "   |   |", "   '~~~'"),
    hit: frame("    .-.  !", "   (> <)", "   | o |", "   |   |", "   '~~~'"),
    defeated: frame("    .-.", "   (- -)", "   | _ |", "    '~'", "   zzz"),
  },
};

export function AsciiBoss({ kind, frame: f = "full", className = "" }: { kind: BossKind; frame?: BossFrame; className?: string }) {
  return (
    <pre aria-hidden="true" className={`ascii text-base text-text ${className}`}>
      {BOSS_ART[kind][f]}
    </pre>
  );
}
