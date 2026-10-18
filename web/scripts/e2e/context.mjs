// node --env-file=web/.env.local context.mjs <sessionId>: prints the per-turn Co-learn context lines about review.
const [sid] = process.argv.slice(2);
const r = await fetch(`${process.env.KV_REST_API_URL}/get/session:${sid}:messages`, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
const msgs = JSON.parse((await r.json()).result ?? "[]");
for (const m of msgs) {
  if (m.role !== "system") continue;
  const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
  for (const line of text.split(/\\n|\n/)) if (/review|Mastered/i.test(line)) console.log(line.slice(0, 300));
}
