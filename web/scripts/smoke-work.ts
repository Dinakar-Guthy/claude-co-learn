/**
 * Live smoke test for the work loop (real Claude API, in-process MemoryStore).
 *
 *   cd web && node --env-file=.env.local scripts/smoke-work.ts [--upload]
 *
 * Runs two turns of the churn demo, answering any learning moment in between, and prints the stream
 * events. Checks code execution, container reuse across turns, and whether moments get proposed.
 * --upload: upload a small generated churn CSV via the Files API (otherwise uses DEMO_FILE_ID if set,
 * or asks Claude to synthesize the data). Uses only erasable TypeScript so Node can run it directly.
 */
import * as nodeModule from "node:module";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Resolve = (specifier: string, context: { parentURL?: string }, next: (s: string, c: unknown) => unknown) => unknown;
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isFile = (p: string) => existsSync(p) && statSync(p).isFile();

// Resolve the app's `@/` alias and extensionless relative imports to .ts files (what the bundler does for Next).
(nodeModule as unknown as { registerHooks(hooks: { resolve: Resolve }): void }).registerHooks({
  resolve(specifier, context, next) {
    let base: string | undefined;
    if (specifier.startsWith("@/")) base = path.join(webRoot, specifier.slice(2));
    else if (/^\.\.?\//.test(specifier) && context.parentURL?.endsWith(".ts") && !path.extname(specifier)) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    const file = base && [`${base}.ts`, path.join(base, "index.ts"), base].find(isFile);
    return next(file ? pathToFileURL(file).href : specifier, context);
  },
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Run: node --env-file=.env.local scripts/smoke-work.ts");
  process.exit(1);
}

const { MemoryStore } = await import("@/lib/store/memory");
const { newUser } = await import("@/lib/store/defaults");
const { initialEngineState } = await import("@/lib/contracts/engine");
const { defaultDeps } = await import("@/lib/claude/work/deps");
const { prepareTurn } = await import("@/lib/claude/work/prepare");
const { runTurn } = await import("@/lib/claude/work/loop");
const { anthropic } = await import("@/lib/claude/client");
const { toFile } = await import("@anthropic-ai/sdk");

type Event = import("@/lib/contracts/stream").ChatStreamEvent;
type Session = import("@/lib/contracts/session").Session;

function churnCsv(rows: number): string {
  const lines = ["customer_id,tenure_months,contract_type,monthly_charges,total_charges,support_tickets_90d,cancellation_request_date,churned"];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 1; i <= rows; i++) {
    const tenure = Math.floor(rand() * 72) + 1;
    const contract = ["month-to-month", "one-year", "two-year"][Math.floor(rand() * 3)];
    const monthly = Math.round((20 + rand() * 90) * 100) / 100;
    const tickets = Math.floor(rand() * 5);
    const churned = rand() < (contract === "month-to-month" ? 0.25 : 0.06) + tickets * 0.02 ? 1 : 0;
    const total = rand() < 0.02 ? "" : (tenure * monthly).toFixed(2);
    const cancel = churned && rand() < 0.9 ? `2026-0${1 + Math.floor(rand() * 9)}-15` : "";
    lines.push([`C${i}`, tenure, contract, monthly, total, tickets, cancel, churned].join(","));
  }
  return lines.join("\n") + "\n";
}

const store = new MemoryStore();
const deps = { ...defaultDeps(), store };
if (process.argv.includes("--upload")) {
  const file = await anthropic().files.upload({ file: await toFile(Buffer.from(churnCsv(400)), "churn.csv", { type: "text/csv" }) });
  deps.demoFileId = file.id;
  console.log(`uploaded churn.csv as ${file.id}`);
}
console.log(`demo data: ${deps.demoFileId ? `file ${deps.demoFileId}` : "synthesized by Claude"}`);

const anonId = crypto.randomUUID();
const session: Session = {
  id: crypto.randomUUID(),
  anonId,
  createdAt: Date.now(),
  title: "Smoke test",
  intent: { goal: "Train a model to predict customer churn from a CSV", familiarity: "some", minutes: 10, demo: true },
  fileIds: [],
  demoFileAttached: false,
  status: "active",
  engine: initialEngineState(),
  story: { chapters: [] },
};
await store.putSession(session);
await store.putUser(newUser(anonId));

const counts = new Map<string, number>();

async function turn(body: Record<string, unknown>): Promise<Event[]> {
  console.log(`\n=== ${JSON.stringify(body)}`);
  const prepared = await prepareTurn(store, anonId, "127.0.0.1", { sessionId: session.id, ...body });
  if (!prepared.ok) throw new Error(`prepare failed: ${prepared.status} ${prepared.error}`);
  const events: Event[] = [];
  await runTurn(deps, prepared.plan, (e) => {
    events.push(e);
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    if (e.type === "text_delta") process.stdout.write(e.text);
    else if (e.type === "code_start") console.log(`\n[code_start ${e.language}] ${e.code.split("\n")[0].slice(0, 100)}`);
    else if (e.type === "code_result") console.log(`[code_result rc=${e.returnCode}] ${e.stdout.trim().split("\n").slice(0, 3).join(" | ").slice(0, 160)}${e.fileIds.length ? ` files=${e.fileIds.join(",")}` : ""}`);
    else if (e.type === "moment") console.log(`\n[moment ${e.moment.type} · ${e.moment.concept}] ${e.moment.question}`);
    else console.log(`\n[${e.type}] ${JSON.stringify(e).slice(0, 200)}`);
  }, new AbortController().signal);
  const saved = await store.getSession(session.id);
  console.log(`\ncontainer: ${saved?.containerId ?? "none"}`);
  return events;
}

/** Answers a shown moment the way the grade route would (predict → awaiting result; others → skipped). */
async function answerMoment(events: Event[]): Promise<void> {
  const shown = events.find((e) => e.type === "moment");
  if (!shown || shown.type !== "moment") return;
  const record = await store.getMoment(session.id, shown.moment.id);
  if (!record) return;
  const predict = record.type === "predict";
  await store.putMoment({ ...record, status: predict ? "awaiting_prediction_result" : "skipped", answer: predict ? "about 85%" : undefined });
  await turn({ kind: "moment_response", momentId: record.id });
}

const first = await turn({ kind: "message", text: "Load the churn data and tell me the churn rate" });
const containerAfterFirst = (await store.getSession(session.id))?.containerId;
if (first.some((e) => e.type === "error")) {
  console.error("\nFirst turn failed; stopping.");
  process.exit(1);
}
await answerMoment(first);
const second = await turn({ kind: "message", text: "Now train a quick baseline model and show precision and recall on a held-out test set." });
await answerMoment(second);

const finalSession = await store.getSession(session.id);
console.log("\n=== summary");
console.log("event counts:", Object.fromEntries(counts));
console.log("container reused:", containerAfterFirst !== undefined && containerAfterFirst === finalSession?.containerId);
console.log("files:", finalSession?.fileIds);
console.log("moments:", (await store.listMoments(session.id)).map((m) => `${m.type}:${m.status}:${m.candidate.concept}`));
console.log("app events:", store.events.map((e) => e.name).join(", "));
