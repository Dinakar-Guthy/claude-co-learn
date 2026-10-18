// node --env-file=web/.env.local events.mjs <sessionId>: prints today's app events for one session (props only, no secrets).
const [sid] = process.argv.slice(2);
const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
const day = new Date().toISOString().slice(0, 10);
const r = await fetch(`${url}/lrange/events:${day}/0/-1`, { headers: { Authorization: `Bearer ${token}` } });
const { result } = await r.json();
for (const raw of result) { const e = JSON.parse(raw); if (!sid || e.sessionId === sid) console.log(new Date(e.at).toISOString().slice(11, 19), e.name, JSON.stringify(e.props ?? {}).slice(0, 300)); }
