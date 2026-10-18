/** Pip the robot — ASCII guide. Faces from reference/ascii-characters.md. */
export type PipMood = "neutral" | "happy" | "thinking" | "celebrating" | "encouraging";

const FACES: Record<PipMood, string> = {
  neutral: "  .-----.\n  | o o |\n  |  -  |\n  '-----'",
  happy: "  .-----.\n  | ^ ^ |\n  | \\_/ |\n  '-----'",
  thinking: "  .-----.  ?\n  | o O |\n  |  ~  |\n  '-----'",
  celebrating: " \\.-----./\n  | ^ ^ |\n  | \\O/ |\n  '-----'",
  encouraging: "  .-----.\n  | o o |\n  |  u  |\n  '-----'",
};

export function Pip({ mood = "neutral", className = "" }: { mood?: PipMood; className?: string }) {
  return (
    <pre aria-hidden="true" className={`ascii text-primary text-sm ${className}`}>
      {FACES[mood]}
    </pre>
  );
}
