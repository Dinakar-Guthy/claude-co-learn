/** Builds a compact "what was built so far" summary from the transcript, newest material first in priority. */
import type { MomentRecord, TranscriptItem } from "@/lib/contracts/session";

const PIECE_MAX = 700;

function piece(item: TranscriptItem): string | null {
  switch (item.kind) {
    case "assistant_text":
      return item.text.trim() ? `Claude: ${item.text.trim()}` : null;
    case "code_run":
      return item.stdout?.trim() ? `Code output:\n${item.stdout.trim()}` : null;
    case "milestone":
      return `Milestone: ${item.label}`;
    default:
      return null;
  }
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** Walks the transcript backwards collecting assistant text, code stdout, and milestones until ~maxChars. */
export function workSummary(transcript: TranscriptItem[], maxChars = 2000): string {
  const picked: string[] = [];
  let used = 0;
  for (let i = transcript.length - 1; i >= 0 && used < maxChars; i--) {
    const p = piece(transcript[i]);
    if (!p) continue;
    const text = clip(p, Math.min(PIECE_MAX, maxChars - used));
    picked.push(text);
    used += text.length + 2;
  }
  return picked.reverse().join("\n\n");
}

/** Misconceptions and gaps from recent moments the learner didn't fully get. */
export function recentMisconceptions(moments: MomentRecord[], limit = 6): string[] {
  const out: string[] = [];
  const missed = moments.filter((m) => m.status === "answered" && m.verdict !== "correct").slice(-5);
  for (const m of missed.reverse()) {
    for (const s of [...(m.missingPoints ?? []), ...(m.candidate.rubric.misconceptions ?? [])]) {
      if (out.length < limit && !out.includes(s)) out.push(s);
    }
  }
  return out;
}
