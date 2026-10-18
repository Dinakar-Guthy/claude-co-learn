/** Short, friendly "how long ago" text for the Codex ("just now", "5 min ago", "yesterday", "3 weeks ago"). */
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

export function timeAgo(then: number, now: number): string {
  const ms = Math.max(0, now - then);
  if (ms < MIN) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / MIN)} min ago`;
  if (ms < DAY) return plural(Math.floor(ms / HOUR), "hour");
  const days = Math.floor(ms / DAY);
  if (days === 1) return "yesterday";
  if (days < 14) return plural(days, "day");
  if (days < 60) return plural(Math.floor(days / 7), "week");
  return plural(Math.floor(days / 30), "month");
}
