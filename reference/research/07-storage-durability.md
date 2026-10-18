# Research: how long does stored data last?

_Subagent research report, 2026-10-17._

## Direct answer
**Yes, Upstash Redis free tier keeps data for days and weeks.** Writes go to memory and block storage (durable across
restarts); keys without a TTL never expire. One time-based risk: free databases are **archived after ≥30 days of
inactivity** (restorable from the console after warning emails; a third-party page claims 14 days, unverified).
Reviewer activity over days or weeks keeps it active.

## Upstash free tier (upstash.com, Oct 2026)
- 250 MB data · 500K commands/month · 10 GB bandwidth/month · 10 MB max request.
- Eviction **off by default**: writes are rejected at the limit, reads still work.
- Pay-as-you-go: $0.20/100K commands, 1 GB free storage, budget cap; archival is documented only for free tier (not explicitly confirmed).
- Via Vercel Marketplace: same Upstash product (Vercel KV migrated Dec 2024); no documented differences.

## TTLs
Keys persist until deleted. For anonymous data set an expiry, e.g. `{ ex: 60*60*24*60 }` (60 days), refreshed on each visit (sliding window).

## Alternatives
- **Neon Free:** 1 GB, compute sleeps after 5 min idle (cold start), no inactivity deletion.
- **Supabase Free:** paused after 1 week of inactivity, manual resume. Riskiest for reviewers.
- **Turso Free:** archived after 10 days of inactivity per CLI docs (possibly outdated).
- **localStorage / IndexedDB:** Safari ITP wipes script-writable storage after 7 days without interaction on the site; a JS-set cookie is capped at 7 days too. → **Set the anon ID as a server-set HttpOnly cookie.**

## Gotchas
1. If the app might sit idle ~30 days: switch to pay-as-you-go with a $1–5 cap, or add a daily Vercel Cron keep-alive (whether that counts as activity is unconfirmed).
2. Handle write errors (writes are rejected when storage is full).
3. Watch the 500K/month command budget with rate-limit counters.
4. TTL 30–90 days on per-user keys.

## Sources
https://upstash.com/pricing/redis · https://upstash.com/docs/redis/overall/pricing · https://upstash.com/docs/redis/help/faq · https://upstash.com/docs/redis/features/durability · https://upstash.com/docs/redis/features/eviction · https://vercel.com/docs/redis · https://neon.com/pricing · https://supabase.com/pricing · https://docs.turso.tech/cli/group/unarchive · https://webkit.org/tracking-prevention/
