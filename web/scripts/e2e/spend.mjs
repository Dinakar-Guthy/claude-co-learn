const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
for (const day of [new Date(Date.now() - 864e5), new Date()].map((d) => d.toISOString().slice(0, 10))) {
  const r = await fetch(`${url}/get/usage:global:all:${day}`, { headers: { Authorization: `Bearer ${token}` } });
  const { result } = await r.json();
  console.log(day, "global spend $", ((Number(result) || 0) / 1e6).toFixed(3));
}
