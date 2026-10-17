# Research: hosting, stack, persistence, API key safety, model cost

_Subagent research report, 2026-10-17. Unverified items flagged._

## Recommendation
Next.js (App Router) + TypeScript on **Vercel Hobby**, deployed from GitHub. Claude via **Vercel AI SDK + `@ai-sdk/anthropic`** (makes P1 model-agnosticism a provider swap). Persistence: **localStorage first**, then anonymous UUID + **Upstash Redis** (also gives rate limiting). Key server-side only; Console spend limit.

## Hosting
- **Vercel Hobby** — free, GitHub import, zero-config Next.js. Fluid compute: Node functions 300s default/max on Hobby, covers streaming. Hobby is "non-commercial, personal use" — interview prototype likely fine (unverified). https://vercel.com/docs/functions/limitations · https://vercel.com/docs/plans/hobby
- **Netlify** — 10s default timeout (26s on Pro+) per forum; risky for LLM responses. https://answers.netlify.com/t/function-timeout-increase-to-26s-personal-plan-anthropic-streaming/161949
- **Render free** — sleeps after 15 min idle, ~1 min cold start; bad for reviewers. https://render.com/docs/free
- Cloudflare / Railway / Fly — not verified this session.
- Streamlit / HF Spaces — OK for Python, apps sleep, less UI control.

## Stack
- `@ai-sdk/anthropic` reads `ANTHROPIC_API_KEY`, supports Claude 5 IDs; `streamText` + `useChat` speed up chat UI. https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- `@anthropic-ai/sdk` — first-class access to new params (effort, fallbacks, caching), more glue code. Middle path: AI SDK for chat, provider options/native SDK where needed.

## Persistence
- localStorage/IndexedDB: zero setup; device-bound.
- Anonymous UUID cookie + Upstash Redis or Neon Postgres (Vercel Marketplace): survives cache clears, enables "resume code". ~1 extra hour.
- Plan: storage interface; localStorage day 1, Redis day 2 if time.

## API key safety
- Vercel env var `ANTHROPIC_API_KEY`; never `NEXT_PUBLIC_`; call Claude only from route handlers.
- `@upstash/ratelimit` (e.g. 20 req/min) + per-session daily token cap. https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
- Cap `max_tokens`, history length, input size.
- Optional shared access passcode (cookie) given to reviewers in README.
- Anthropic Console: monthly spend limit, dedicated workspace.
- Optional "bring your own key" fallback.

## Models & cost ($/MTok in/out, per claude-api skill cache 2026-10-06)
| Task | Model | Price |
|---|---|---|
| Curriculum planning (once/topic) | Opus 5.5 `claude-opus-5-5`, effort medium | $4 / $20 |
| Question generation + stories | Sonnet 5.5 `claude-sonnet-5-5` | $2 / $10 |
| Grading | Haiku 5.5 `claude-haiku-5-5`, structured output | $0.10 / $0.50 |

Estimated 30-min session: **~$0.50–1.20** (lower with prompt caching).

API gotchas: Opus 5.5 thinking can't be disabled (effort only); Sonnet 5.5 `thinking:{type:"disabled"}` → 400, use `{type:"between_tools"}`; no assistant prefill (use structured outputs); handle `stop_reason: "refusal"`; consider `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).

## Deploy checklist
1. `npx create-next-app@latest`; `npm i ai @ai-sdk/anthropic`
2. `app/api/chat/route.ts` with `streamText`, `export const maxDuration = 300`; key in `.env.local`
3. Push to GitHub
4. vercel.com → Add New Project → import repo → env vars → deploy
5. Optional Upstash via Vercel Marketplace
6. Console spend limit
7. Test in private window
8. Every push to main auto-deploys; PRs get preview URLs

## Effort estimate (added 2026-10-17 after review)
Engineering effort, building with Claude Code:

| Piece | Effort | Notes |
|---|---|---|
| Server route + key in env + streaming via AI SDK | 0.5–1 h | Key never leaves the server |
| Per-task model routing (Opus / Sonnet / Haiku) | ~0.5 h | One config map |
| Upstash Redis via Vercel Marketplace | ~0.5 h | Env vars auto-provisioned |
| Rate limit + daily spend cap per browser/IP | 1–1.5 h | `@upstash/ratelimit` + token counter keyed by anon ID and IP |
| Anthropic Console spend limit / dedicated workspace | ~10 min | Manual step for Dinakar |
| **P0 total** | **~3–3.5 h** | |
| P1: bring-your-own-key fallback | ~1 h | |
| P1: second provider (model-agnostic proof) | ~1 h | Mostly a provider swap if the AI SDK is used from day 1 |

Model-side "effort" (Claude's `effort` setting, which trades thinking depth for speed/cost): start with medium for
curriculum/planning calls and low for per-turn generation and grading; tune by testing latency and quality.
Exact parameter support per model to be verified against the docs during the build.

## Alternatives to Vercel (added 2026-10-17)
| Host | Fit | Caveat |
|---|---|---|
| **Vercel** (recommended) | Built for Next.js; deploy on git push; 300s streaming on the free plan | Free plan is "personal/non-commercial" (an interview demo likely fits) |
| Netlify | Similar git-push flow | ~10s default function timeout on free; risky for streaming LLM responses |
| Cloudflare Pages/Workers | Fast, generous free tier | Next.js needs an adapter (OpenNext); more setup friction |
| Render | Simple, supports long-running servers | Free tier sleeps after 15 min idle (~1 min cold start for reviewers) |
| Railway / Fly.io | Run any server/container | Little to no free tier now (unverified); more ops |
| Streamlit Cloud / Hugging Face Spaces | Easiest if writing Python | Apps sleep; limited UI control (hurts the cozy/game UX) |
