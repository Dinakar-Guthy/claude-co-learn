/**
 * Uploads data/churn.csv to the Anthropic Files API and prints only the file ID (set it as DEMO_FILE_ID).
 * Run from web/:  node --env-file=.env.local scripts/upload-demo-file.ts
 * Node 24+ strips the types natively, so this file uses erasable TypeScript syntax only.
 */
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";

const csvPath = new URL("../data/churn.csv", import.meta.url);

async function main(): Promise<void> {
  const bytes = await readFile(csvPath);
  const client = new Anthropic();
  const uploaded = await client.files.upload({
    file: await toFile(bytes, "churn.csv", { type: "text/csv" }),
  });
  console.log(uploaded.id);
}

main().catch((err: unknown) => {
  // Never echo request details: they can include credentials.
  const message = err instanceof Anthropic.APIError ? `${err.name} (${err.status ?? "no status"})` : err instanceof Error ? err.message : "unknown error";
  console.error(`Upload failed: ${message}`);
  process.exitCode = 1;
});
