"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { BandCheck, Insights, Rate } from "@/lib/platform/insights";
import { Card, Chip, Spinner } from "@/components/ui";
import { apiGet, errorMessage } from "@/lib/client/api";

const DAY_OPTIONS = [1, 7, 30] as const;

type Result = { days: number; data?: Insights; error?: string };

const pct = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(digits)}%`);
const frac = (r: Rate) => (r.den > 0 ? `${r.num} of ${r.den}` : "no data yet");

export function InsightsView() {
  const [days, setDays] = useState<number>(7);
  const [result, setResult] = useState<Result | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    apiGet<Insights>(`/api/insights?days=${days}`, ctrl.signal)
      .then((data) => setResult({ days, data }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setResult({ days, error: errorMessage(err) });
      });
    return () => ctrl.abort();
  }, [days, reload]);

  const current = result?.days === days ? result : null;
  const data = current?.data;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">Insights</h1>
          <p className="mt-1 max-w-xl text-muted">
            Is Co-learn helping people learn while they work? Aggregated from anonymous telemetry: counts and rates only, no
            user ids or answers.
          </p>
        </div>
        <div role="radiogroup" aria-label="Time window" className="flex gap-2">
          {DAY_OPTIONS.map((d) => (
            <Chip key={d} role="radio" selected={days === d} onClick={() => setDays(d)}>
              {d === 1 ? "Today" : `${d} days`}
            </Chip>
          ))}
        </div>
      </header>

      {!current && (
        <div className="flex justify-center py-16">
          <Spinner label="Loading insights" />
        </div>
      )}
      {current?.error && (
        <Card className="text-center">
          <p role="alert" className="text-muted">{current.error}</p>
          <Chip className="mt-3" onClick={() => setReload((n) => n + 1)}>Try again</Chip>
        </Card>
      )}
      {data && data.window.events === 0 && <EmptyState days={days} />}
      {data && data.window.events > 0 && <Report data={data} />}
    </main>
  );
}

function EmptyState({ days }: { days: number }) {
  return (
    <Card className="text-center">
      <p className="text-lg font-bold">No activity {days === 1 ? "today" : `in the last ${days} days`}.</p>
      <p className="mt-1 text-muted">Start a session and answer a learning moment; the numbers show up here right away.</p>
    </Card>
  );
}

function Report({ data }: { data: Insights }) {
  const { volume, moments, accuracy, bosses, gate, feedback, retention, daily } = data;
  return (
    <>
      <p className="text-sm text-muted">
        {data.window.from === data.window.to ? data.window.from : `${data.window.from} to ${data.window.to}`} (UTC) ·{" "}
        {data.window.events.toLocaleString()} events
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="People" value={volume.users} caption="Distinct anonymous users with any activity." />
        <Stat label="Sessions" value={volume.sessionsCreated} caption={`${volume.sessionsWrapped} reached wrap-up.`} />
        <Stat
          label="Completion"
          value={pct(volume.completion.rate)}
          caption={`Sessions started in this window that reached wrap-up (${frac(volume.completion)}).`}
        />
        <Stat
          label="Answer rate"
          value={pct(moments.answerRate.rate)}
          caption={`Shown moments the learner answered (${frac(moments.answerRate)}). Engagement without forcing it (P7).`}
        />
        <Stat
          label="Learned something"
          value={pct(feedback.rate.rate)}
          caption={`Thumbs up on “Did you learn something?” at wrap-up (${frac(feedback.rate)}).`}
        />
        <Stat label="Errors" value={volume.errors} caption="Logged server errors (background jobs, enrichment)." />
      </div>

      <Section
        title="Accuracy vs. challenge targets"
        caption="Mean score per answer (correct 100%, correct after multiple choice 60%, partial 50%, miss 0%). P5 aims for ~80%: hard enough to stretch, easy enough to stay motivated. Below the band means questions are too hard; above means too easy."
      >
        <div className="flex flex-col gap-5">
          <BandRow label="Work moments" sub="Practice and review during the task" check={accuracy.practice} />
          <BandRow label="Boss questions" sub="Cumulative review" check={accuracy.boss} />
          <BandRow
            label="First exposure"
            sub="First answer on a concept for that person in this window (approximate: earlier history is outside the window)"
            check={accuracy.firstExposure}
          />
        </div>
      </Section>

      <Section
        title="Learning moments"
        caption="Rates are out of moments shown in this window. Skip and defer are healthy signs of user control (P7); a high report rate flags content problems (P9)."
      >
        <Table
          head={["", "Count", "Rate (of shown)"]}
          rows={[
            ["Proposed by Claude", moments.proposed, ""],
            ["Shown (passed the gate)", moments.shown, ""],
            ["Answered", moments.answered, <RateBar key="a" r={moments.answerRate} />],
            ["Skipped", moments.skipped, <RateBar key="s" r={moments.skipRate} />],
            ["Deferred by the learner", moments.deferred, <RateBar key="d" r={moments.deferRate} />],
            ["Answer revealed", moments.revealed, <RateBar key="r" r={moments.revealRate} />],
            ["Reported as a bad question", moments.reported, ""],
          ]}
        />
        <p className="mt-4 text-sm text-muted">
          Multiple-choice fallback: {pct(moments.mcFallback.rate)} of graded answers were correct only after switching to multiple
          choice ({frac(moments.mcFallback)}); offered on {moments.mcOffered} moment{moments.mcOffered === 1 ? "" : "s"}. Free
          recall first is the stronger retrieval practice, so lower is better.
        </p>
      </Section>

      <Section
        title="Help usage"
        caption="Share of shown moments where the learner asked for a hint, a mini-lesson, or asked Claude a question. Help that arrives before an answer is scaffolding, not giving up (P3)."
      >
        <Table
          head={["", "Rate (of shown)"]}
          rows={[
            ["Any help", <RateBar key="any" r={moments.help.any} />],
            ["Hint", <RateBar key="h" r={moments.help.hint} />],
            ["Teach me", <RateBar key="t" r={moments.help.teach} />],
            ["Ask", <RateBar key="q" r={moments.help.ask} />],
          ]}
        />
        <p className="mt-4 text-sm text-muted">
          Mean score with help {pct(moments.help.scoreWithHelp)} vs without {pct(moments.help.scoreWithoutHelp)}.
        </p>
      </Section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section title="Bosses" caption="Bosses are optional cumulative reviews. Declines and skips show the learner stays in charge.">
          <Table
            head={["", "Count"]}
            rows={[
              ["Offered", bosses.offered],
              ["Declined", bosses.declined],
              ["Started", bosses.started],
              ["Skipped", bosses.skipped],
              ["Finished", bosses.finished],
              ...bosses.outcomes.map((o): Row => [`  Outcome: ${o.outcome}`, o.count]),
              ["Questions answered", bosses.questions.answered],
              ["Questions skipped", bosses.questions.skipped],
            ]}
          />
          <p className="mt-3 text-sm text-muted">Mean hit rate: {pct(bosses.meanHitRate)} of boss HP.</p>
        </Section>

        <Section
          title="Pacing gate"
          caption="The deterministic engine decides which proposed moments interrupt the work (P8). Reasons show why it held back."
        >
          <Table
            head={["", "Count"]}
            rows={[
              ["Decisions", gate.decisions],
              ["Shown", gate.show],
              ["Skipped", gate.skip],
              ["Deferred", gate.defer],
              ...gate.reasons.map((r): Row => [`  Reason: ${r.reason.replace(/_/g, " ")}`, r.count]),
            ]}
          />
        </Section>
      </div>

      <Section
        title="Delayed retention"
        badge="Small sample"
        caption="For each person and concept answered in two or more sessions: mean score in the first session vs mean score in later sessions. Long-term retention, not the in-session score, is the real goal (P5). Read with care: few pairs, and concept names written by Claude can vary between sessions."
      >
        {retention.pairs === 0 ? (
          <p className="text-muted">No concept has come up again in a later session yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Pairs" value={retention.pairs} caption={`${retention.users} ${retention.users === 1 ? "person" : "people"}`} />
            <Stat label="First session" value={pct(retention.meanFirst)} caption="Mean score" />
            <Stat
              label="Later sessions"
              value={pct(retention.meanLater)}
              caption={retention.delta === null ? "" : `${retention.delta >= 0 ? "+" : "−"}${pct(Math.abs(retention.delta))} vs first`}
            />
          </div>
        )}
      </Section>

      <Section title="By day" caption="UTC days. Mean score covers work moments.">
        <Table
          head={["Day", "People", "Sessions", "Wrapped", "Shown", "Answered", "Mean score"]}
          rows={[...daily].reverse().map((d): Row => [d.day, d.users, d.sessionsCreated, d.sessionsWrapped, d.shown, d.answered, pct(d.meanScore)])}
        />
      </Section>
    </>
  );
}

function Section({ title, caption, badge, children }: { title: string; caption: string; badge?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-extrabold">{title}</h2>
        {badge && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold text-muted">{badge}</span>}
      </div>
      <p className="mb-4 mt-1 text-sm text-muted">{caption}</p>
      {children}
    </Card>
  );
}

function Stat({ label, value, caption }: { label: string; value: ReactNode; caption: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-soft">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
      {caption && <p className="mt-1 text-xs text-muted">{caption}</p>}
    </div>
  );
}

type Row = ReactNode[];

function Table({ head, rows }: { head: string[]; rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className={`py-2 pr-3 font-semibold ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-border/60 last:border-0">
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="whitespace-pre py-2 pr-3 font-normal">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="py-2 pr-3 text-right tabular-nums">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A rate as text plus a thin single-hue bar; the bar is decorative (the number carries the value). */
function RateBar({ r }: { r: Rate }) {
  const width = r.rate === null ? 0 : Math.min(1, r.rate) * 100;
  return (
    <span className="inline-flex items-center justify-end gap-2" title={frac(r)}>
      <span aria-hidden="true" className="hidden h-2 w-24 overflow-hidden rounded-full bg-surface-2 sm:inline-block">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </span>
      <span className="w-12">{pct(r.rate)}</span>
    </span>
  );
}

const STATUS_TEXT: Record<BandCheck["status"], string> = {
  in: "In band",
  below: "Below band (too hard)",
  above: "Above band (too easy)",
  no_data: "No answers yet",
};

/** 0–100% track with the target band shaded and a marker at the mean. */
function BandRow({ label, sub, check }: { label: string; sub: string; check: BandCheck }) {
  const [lo, hi] = check.target;
  const status = check.status === "in" ? "text-success" : "text-text";
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-bold">
          {label} <span className="font-normal text-muted">· target {pct(lo)}–{pct(hi)}</span>
        </p>
        <p className="text-sm">
          <span className="text-lg font-extrabold tabular-nums">{pct(check.mean)}</span>{" "}
          <span className={`font-semibold ${status}`}>
            {check.status === "in" ? "✓ " : ""}
            {STATUS_TEXT[check.status]}
          </span>{" "}
          <span className="text-muted">
            · n={check.n}
            {check.lowSample && check.n > 0 ? ", too few to judge" : ""}
          </span>
        </p>
      </div>
      <div aria-hidden="true" className="relative mt-2 h-3 rounded-full bg-surface-2">
        <div className="absolute inset-y-0 rounded-full bg-primary-soft ring-1 ring-primary/40" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
        {check.mean !== null && (
          <div
            className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-surface"
            style={{ left: `${Math.min(1, Math.max(0, check.mean)) * 100}%` }}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}
