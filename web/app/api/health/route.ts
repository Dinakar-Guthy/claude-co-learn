import { connection } from "next/server";
import { storeKind } from "@/lib/store";

/** Deployment smoke check. Booleans only; never echoes configuration values. */
export async function GET() {
  await connection(); // read env at request time, not at build-time prerender
  return Response.json(
    {
      ok: true,
      store: storeKind(),
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      hasDemoFile: Boolean(process.env.DEMO_FILE_ID),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
