// node --env-file=web/.env.local keys.mjs [--delete <prefix,prefix>]: lists Redis keys grouped by prefix; deletes only with --delete.
const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
const call = async (...parts) => (await (await fetch(`${url}/${parts.map(encodeURIComponent).join("/")}`, { headers: { Authorization: `Bearer ${token}` } })).json()).result;
let cursor = "0"; const keys = [];
do { const [next, batch] = await call("scan", cursor, "count", "1000"); cursor = next; keys.push(...batch); } while (cursor !== "0");
const group = (k) => k.startsWith("ratelimit:") ? "ratelimit:*" : k.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|\d{4}-\d{2}-\d{2}|file_\w+/g, "<id>").replace(/:boss:[^:]+$/, ":boss:<id>");
const counts = {}; for (const k of keys) counts[group(k)] = (counts[group(k)] ?? 0) + 1;
console.log(`total keys: ${keys.length}`); for (const [g, n] of Object.entries(counts).sort()) console.log(String(n).padStart(5), g);
const i = process.argv.indexOf("--delete");
if (i > 0) {
  const prefixes = process.argv[i + 1].split(",");
  const doomed = keys.filter((k) => prefixes.some((p) => k.startsWith(p)));
  for (let j = 0; j < doomed.length; j += 100) await call("del", ...doomed.slice(j, j + 100));
  console.log(`deleted ${doomed.length} keys with prefixes ${prefixes.join(", ")}`);
}
