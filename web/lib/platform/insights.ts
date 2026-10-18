/**
 * Insights: aggregates telemetry events (Store.listEvents) into "is Co-learn working?" metrics for /insights.
 * Pure and deterministic. Measures from docs/design-plan.md §15; accuracy bands from design principle P5.
 *
 * Privacy: the output never contains anonIds, session ids, concepts, or any other free text. Users are only
 * counted, and the few enum-like strings that do pass through (gate reasons, boss outcomes) are sanitized.
 *
 * Robustness: events come from several code paths and versions, so every prop is optional and type-checked.
 * Moment events are de-duplicated by momentId (e.g. a prediction logs `moment_answered` once when submitted and
 * again when the real run resolves it).
 */
import type { Verdict } from "@/lib/contracts/moment";
import { scoreFor } from "@/lib/engine/mastery";

/** Structural event shape. `name` is a plain string so newer event names are handled before the contract lists them. */
export interface InsightEvent {
  at: number;
  anonId: string;
  sessionId?: string;
  name: string;
  props?: Record<string, string | number | boolean | null>;
}

export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 30;
/** Below this many answers a band comparison is shown but flagged as too small to judge. */
export const MIN_SAMPLE = 10;

/** P5 challenge targets, as mean score (0–1). */
export const TARGETS = {
  firstExposure: [0.85, 0.9],
  practice: [0.75, 0.85],
  boss: [0.65, 0.8],
} as const satisfies Record<string, readonly [number, number]>;

export interface Rate {
  num: number;
  den: number;
  /** num / den, or null when den is 0. */
  rate: number | null;
}

export interface BandCheck {
  n: number;
  mean: number | null;
  target: readonly [number, number];
  status: "below" | "in" | "above" | "no_data";
  lowSample: boolean;
}

export interface DayRow {
  day: string;
  events: number;
  users: number;
  sessionsCreated: number;
  sessionsWrapped: number;
  shown: number;
  answered: number;
  meanScore: number | null;
}

export interface Insights {
  window: { days: number; from: string; to: string; events: number };
  /** Test traffic (owner and automated testing) is excluded unless the request asks to include it. */
  testTraffic?: { included: boolean; eventsExcluded: number };
  volume: { users: number; sessionsCreated: number; sessionsWrapped: number; completion: Rate; errors: number };
  moments: {
    proposed: number;
    shown: number;
    answered: number;
    skipped: number;
    deferred: number;
    reported: number;
    revealed: number;
    answerRate: Rate;
    skipRate: Rate;
    deferRate: Rate;
    revealRate: Rate;
    mcOffered: number;
    mcFallback: Rate;
    help: { any: Rate; hint: Rate; teach: Rate; ask: Rate; scoreWithHelp: number | null; scoreWithoutHelp: number | null };
  };
  accuracy: { practice: BandCheck; boss: BandCheck; firstExposure: BandCheck };
  bosses: {
    offered: number;
    declined: number;
    started: number;
    skipped: number;
    finished: number;
    outcomes: { outcome: string; count: number }[];
    meanHitRate: number | null;
    questions: { answered: number; skipped: number; reported: number; helped: number };
  };
  gate: { decisions: number; show: number; skip: number; defer: number; reasons: { reason: string; count: number }[] };
  feedback: { responses: number; helpful: number; rate: Rate };
  retention: { pairs: number; users: number; meanFirst: number | null; meanLater: number | null; delta: number | null };
  daily: DayRow[];
}

// ---------------------------------------------------------------------------------------------------------------
// Window helpers

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Parses `?days=`: missing → 7, above 30 → 30. Returns null for anything that isn't a positive integer. */
export function parseDays(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return DEFAULT_DAYS;
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  if (n < 1) return null;
  return Math.min(n, MAX_DAYS);
}

/** The last `days` UTC days ending today, oldest first. */
export function windowDays(now: number, days: number): string[] {
  const DAY_MS = 86_400_000;
  const end = Math.floor(now / DAY_MS) * DAY_MS;
  return Array.from({ length: days }, (_, i) => utcDay(end - (days - 1 - i) * DAY_MS));
}

// ---------------------------------------------------------------------------------------------------------------
// Small pure helpers

export function rate(num: number, den: number): Rate {
  return { num, den, rate: den > 0 ? num / den : null };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function band(scores: number[], target: readonly [number, number]): BandCheck {
  const m = mean(scores);
  const status = m === null ? "no_data" : m < target[0] ? "below" : m > target[1] ? "above" : "in";
  return { n: scores.length, mean: m, target, status, lowSample: scores.length < MIN_SAMPLE };
}

const str = (e: InsightEvent, k: string) => (typeof e.props?.[k] === "string" ? (e.props[k] as string) : undefined);
const num = (e: InsightEvent, k: string) => (typeof e.props?.[k] === "number" && Number.isFinite(e.props[k]) ? (e.props[k] as number) : undefined);
const isBoss = (e: InsightEvent) => e.props?.boss === true;

/** Only short snake_case identifiers leave this module; anything else is bucketed as "other". */
const safeLabel = (v: unknown) => (typeof v === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(v) ? v : "other");

const VERDICTS: readonly string[] = ["correct", "partial", "incorrect"] satisfies Verdict[];

/** Score of a `moment_answered` event: the logged score, else derived from verdict + afterMC, else null (pending). */
export function answerScore(e: InsightEvent): number | null {
  const s = num(e, "score");
  if (s !== undefined) return s;
  const v = str(e, "verdict");
  return v && VERDICTS.includes(v) ? scoreFor(v as Verdict, e.props?.afterMC === true) : null;
}

/** Moment identity for de-duplication; events without a momentId count individually. */
const momentKey = (e: InsightEvent, i: number) => str(e, "momentId") ?? `#${i}`;

const normConcept = (c: string) => c.trim().toLowerCase().replace(/\s+/g, " ");

interface Answer {
  key: string;
  at: number;
  anonId: string;
  sessionId?: string;
  concept?: string;
  boss: boolean;
  score: number | null;
  afterMC: boolean;
  help: string | null;
}

/**
 * One record per answered moment. The latest scored event wins (a resolved prediction supersedes its
 * pending submission); props missing from the winner are filled from earlier events for the same moment.
 */
function collectAnswers(events: InsightEvent[]): Map<string, Answer> {
  const out = new Map<string, Answer>();
  events.forEach((e, i) => {
    if (e.name !== "moment_answered") return;
    const key = momentKey(e, i);
    const prev = out.get(key);
    const score = answerScore(e);
    const helpProp = str(e, "help");
    const next: Answer = {
      key,
      at: prev?.at ?? e.at,
      anonId: e.anonId,
      sessionId: e.sessionId ?? prev?.sessionId,
      concept: str(e, "concept") ?? prev?.concept,
      boss: isBoss(e) || (prev?.boss ?? false),
      score: score ?? prev?.score ?? null,
      afterMC: score !== null ? e.props?.afterMC === true : (prev?.afterMC ?? false),
      help: helpProp === "hint" || helpProp === "teach" ? helpProp : (prev?.help ?? null),
    };
    out.set(key, next);
  });
  return out;
}

function distinctKeys(events: InsightEvent[], name: string, filter: (e: InsightEvent) => boolean = () => true): Set<string> {
  const s = new Set<string>();
  events.forEach((e, i) => {
    if (e.name === name && filter(e)) s.add(momentKey(e, i));
  });
  return s;
}

const intersect = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length;

function distinctSessions(events: InsightEvent[], name: string): Set<string> {
  const s = new Set<string>();
  events.forEach((e, i) => {
    if (e.name === name) s.add(e.sessionId ?? `#${i}`);
  });
  return s;
}

function countBy(values: string[]): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Delayed retention: for each (user, concept) answered in 2+ sessions, the mean score in the first session
 * vs the mean score across all later sessions. Means are per pair, then averaged over pairs.
 */
export function retention(answers: Answer[]): Insights["retention"] {
  const pairs = new Map<string, Map<string, { first: number; scores: number[] }>>();
  for (const a of answers) {
    if (a.score === null || !a.concept || !a.sessionId) continue;
    const pk = `${a.anonId}\u0000${normConcept(a.concept)}`;
    const sessions = pairs.get(pk) ?? new Map<string, { first: number; scores: number[] }>();
    const s = sessions.get(a.sessionId) ?? { first: a.at, scores: [] };
    s.first = Math.min(s.first, a.at);
    s.scores.push(a.score);
    sessions.set(a.sessionId, s);
    pairs.set(pk, sessions);
  }
  const firsts: number[] = [];
  const laters: number[] = [];
  const users = new Set<string>();
  for (const [pk, sessions] of pairs) {
    if (sessions.size < 2) continue;
    const ordered = [...sessions.values()].sort((a, b) => a.first - b.first);
    firsts.push(mean(ordered[0].scores)!);
    laters.push(mean(ordered.slice(1).flatMap((s) => s.scores))!);
    users.add(pk.split("\u0000")[0]);
  }
  const meanFirst = mean(firsts);
  const meanLater = mean(laters);
  return {
    pairs: firsts.length,
    users: users.size,
    meanFirst,
    meanLater,
    delta: meanFirst !== null && meanLater !== null ? meanLater - meanFirst : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Main aggregation

export function computeInsights(days: { day: string; events: InsightEvent[] }[]): Insights {
  const events = days.flatMap((d) => d.events).sort((a, b) => a.at - b.at);
  const work = (e: InsightEvent) => !isBoss(e);
  const boss = (e: InsightEvent) => isBoss(e);

  // Volume
  const created = distinctSessions(events, "session_created");
  const wrapped = distinctSessions(events, "session_wrapped");
  const volume: Insights["volume"] = {
    users: new Set(events.map((e) => e.anonId)).size,
    sessionsCreated: created.size,
    sessionsWrapped: wrapped.size,
    completion: rate(intersect(created, wrapped), created.size),
    errors: events.filter((e) => e.name === "error").length,
  };

  // Moments (work moments; boss questions are reported under bosses)
  const answers = collectAnswers(events);
  const answerList = [...answers.values()];
  const workAnswers = answerList.filter((a) => !a.boss);
  const bossAnswers = answerList.filter((a) => a.boss);

  const shown = distinctKeys(events, "moment_shown", work);
  const answeredWork = new Set(workAnswers.map((a) => a.key));
  const skipped = distinctKeys(events, "moment_skipped", work);
  const reported = distinctKeys(events, "moment_reported", work);
  const revealed = distinctKeys(events, "moment_revealed", work);
  const gateDeferred = distinctKeys(events, "moment_gated", (e) => str(e, "action") === "defer");
  const deferred = new Set([...distinctKeys(events, "moment_deferred", work)].filter((k) => !gateDeferred.has(k)));
  const helpBy = {
    hint: distinctKeys(events, "help_hint", work),
    teach: distinctKeys(events, "help_teach", work),
    ask: distinctKeys(events, "help_ask", work),
  };
  const helpAny = new Set([...helpBy.hint, ...helpBy.teach, ...helpBy.ask]);
  const scored = answerList.filter((a) => a.score !== null);
  const scoredWork = workAnswers.filter((a) => a.score !== null);
  const withHelp = scoredWork.filter((a) => a.help !== null || helpAny.has(a.key));
  const withoutHelp = scoredWork.filter((a) => !(a.help !== null || helpAny.has(a.key)));
  const ofShown = (s: Set<string>) => rate(intersect(s, shown), shown.size);

  const moments: Insights["moments"] = {
    proposed: distinctKeys(events, "moment_proposed").size,
    shown: shown.size,
    answered: answeredWork.size,
    skipped: skipped.size,
    deferred: deferred.size,
    reported: reported.size,
    revealed: revealed.size,
    answerRate: ofShown(answeredWork),
    skipRate: ofShown(skipped),
    deferRate: ofShown(deferred),
    revealRate: ofShown(revealed),
    mcOffered: distinctKeys(events, "mc_offered").size,
    mcFallback: rate(scored.filter((a) => a.afterMC).length, scored.length),
    help: {
      any: ofShown(helpAny),
      hint: ofShown(helpBy.hint),
      teach: ofShown(helpBy.teach),
      ask: ofShown(helpBy.ask),
      scoreWithHelp: mean(withHelp.map((a) => a.score!)),
      scoreWithoutHelp: mean(withoutHelp.map((a) => a.score!)),
    },
  };

  // Accuracy vs P5 bands. First exposure = the first scored work answer for a (user, concept) in this window.
  const seen = new Set<string>();
  const firstExposure: number[] = [];
  for (const a of [...scoredWork].sort((x, y) => x.at - y.at)) {
    if (!a.concept) continue;
    const k = `${a.anonId}\u0000${normConcept(a.concept)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    firstExposure.push(a.score!);
  }
  const accuracy: Insights["accuracy"] = {
    practice: band(scoredWork.map((a) => a.score!), TARGETS.practice),
    boss: band(bossAnswers.filter((a) => a.score !== null).map((a) => a.score!), TARGETS.boss),
    firstExposure: band(firstExposure, TARGETS.firstExposure),
  };

  // Bosses
  const finished = events.filter((e) => e.name === "boss_finished");
  const hitRates = finished
    .map((e) => ({ hits: num(e, "hits"), maxHp: num(e, "maxHp") }))
    .filter((h): h is { hits: number; maxHp: number } => h.hits !== undefined && h.maxHp !== undefined && h.maxHp > 0)
    .map((h) => Math.min(1, h.hits / h.maxHp));
  const count = (name: string) => events.filter((e) => e.name === name).length;
  const bosses: Insights["bosses"] = {
    offered: count("boss_offered"),
    declined: count("boss_declined"),
    started: count("boss_started"),
    skipped: count("boss_skipped"),
    finished: finished.length,
    outcomes: countBy(finished.map((e) => safeLabel(e.props?.outcome))).map(({ key, count }) => ({ outcome: key, count })),
    meanHitRate: mean(hitRates),
    questions: {
      answered: bossAnswers.length,
      skipped: distinctKeys(events, "moment_skipped", boss).size,
      reported: distinctKeys(events, "moment_reported", boss).size,
      helped: new Set([
        ...distinctKeys(events, "help_hint", boss),
        ...distinctKeys(events, "help_teach", boss),
        ...distinctKeys(events, "help_ask", boss),
      ]).size,
    },
  };

  // Gate
  const gated = events.filter((e) => e.name === "moment_gated");
  const action = (e: InsightEvent) => str(e, "action");
  const gate: Insights["gate"] = {
    decisions: gated.length,
    show: gated.filter((e) => action(e) === "show").length,
    skip: gated.filter((e) => action(e) === "skip").length,
    defer: gated.filter((e) => action(e) === "defer").length,
    reasons: countBy(gated.filter((e) => action(e) !== "show").map((e) => safeLabel(e.props?.reason))).map(({ key, count }) => ({
      reason: key,
      count,
    })),
  };

  // Wrap-up feedback: the last vote per session counts.
  const votes = new Map<string, boolean>();
  events.forEach((e, i) => {
    if (e.name === "learned_feedback" && typeof e.props?.helpful === "boolean") votes.set(e.sessionId ?? `#${i}`, e.props.helpful);
  });
  const helpful = [...votes.values()].filter(Boolean).length;
  const feedback: Insights["feedback"] = { responses: votes.size, helpful, rate: rate(helpful, votes.size) };

  // Daily
  const daily: DayRow[] = days.map(({ day, events: dayEvents }) => {
    const dayAnswers = [...collectAnswers(dayEvents).values()].filter((a) => !a.boss);
    return {
      day,
      events: dayEvents.length,
      users: new Set(dayEvents.map((e) => e.anonId)).size,
      sessionsCreated: distinctSessions(dayEvents, "session_created").size,
      sessionsWrapped: distinctSessions(dayEvents, "session_wrapped").size,
      shown: distinctKeys(dayEvents, "moment_shown", work).size,
      answered: dayAnswers.length,
      meanScore: mean(dayAnswers.filter((a) => a.score !== null).map((a) => a.score!)),
    };
  });

  return {
    window: { days: days.length, from: days[0]?.day ?? "", to: days[days.length - 1]?.day ?? "", events: events.length },
    volume,
    moments,
    accuracy,
    bosses,
    gate,
    feedback,
    retention: retention(answerList),
    daily,
  };
}

/** Drops events tagged as test traffic (props.test, see lib/store/testTraffic.ts) unless `include` is set. */
export function withoutTestTraffic<E extends { props?: Record<string, unknown> | null }>(
  days: { day: string; events: E[] }[],
  include: boolean,
): { days: { day: string; events: E[] }[]; excluded: number } {
  if (include) return { days, excluded: 0 };
  let excluded = 0;
  const kept = days.map(({ day, events }) => {
    const real = events.filter((e) => e.props?.test !== true);
    excluded += events.length - real.length;
    return { day, events: real };
  });
  return { days: kept, excluded };
}
