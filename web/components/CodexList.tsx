import Link from "next/link";
import { CODEX_STATUS_ORDER, type CodexEntry, type CodexStatus } from "@/lib/codex";
import { timeAgo } from "@/lib/ui/relativeTime";
import { Card, focusRing } from "./ui";

/** Section copy per status. Encouraging throughout (P2): "review next time", never "weak". */
export const CODEX_SECTION: Record<CodexStatus, { title: string; blurb: string }> = {
  mastered: { title: "Mastered", blurb: "Solid. They'll pop up for a quick check now and then, so they stay that way." },
  growing: { title: "Growing", blurb: "Getting stronger with each practice." },
  review: { title: "Review next time", blurb: "Worth another look. Co-learn brings these back when your work touches them." },
};

const attempts = (n: number) => `${n} ${n === 1 ? "attempt" : "attempts"}`;

/** The cross-session Codex, grouped by status. `now` is fixed by the caller so times don't drift between renders. */
export function CodexList({ concepts, now }: { concepts: CodexEntry[]; now: number }) {
  if (concepts.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-muted">Your Codex fills up as you learn. Start a session to add your first concept.</p>
        <Link
          href="/"
          className={`mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-soft hover:brightness-110 ${focusRing}`}
        >
          Start a session
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {CODEX_STATUS_ORDER.map((status) => {
        const group = concepts.filter((c) => c.status === status);
        if (group.length === 0) return null;
        const { title, blurb } = CODEX_SECTION[status];
        const headingId = `codex-${status}`;
        return (
          <section key={status} aria-labelledby={headingId}>
            <div className="mb-2 px-1">
              <h2 id={headingId} className="text-lg font-extrabold">
                {title} <span className="text-sm font-semibold text-muted">· {group.length}</span>
              </h2>
              <p className="text-sm text-muted">{blurb}</p>
            </div>
            <ul className="divide-y divide-border rounded-card border border-border bg-surface shadow-soft">
              {group.map((c) => (
                <CodexRow key={c.concept} entry={c} now={now} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function CodexRow({ entry, now }: { entry: CodexEntry; now: number }) {
  const pct = Math.round(entry.strength * 100);
  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-bold break-words">{entry.concept}</p>
        <p className="shrink-0 text-xs text-muted">
          {attempts(entry.n)} · last practised {timeAgo(entry.lastSeen, now)}
        </p>
      </div>
      <div
        role="meter"
        aria-label={`Strength: ${entry.concept}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
    </li>
  );
}
