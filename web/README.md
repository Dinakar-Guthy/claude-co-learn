# Co-learn web app

Next.js 16 (App Router) + TypeScript + Tailwind v4. Claude via the native `@anthropic-ai/sdk`.
Blueprint: [`../docs/design-plan.md`](../docs/design-plan.md).

## Commands
```bash
npm run dev        # local dev (http://localhost:3000)
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run lint
npm run build
```
Env: copy `.env.example` → `.env.local` (gitignored), or `vercel env pull .env.local` after linking.
Without Upstash env vars the app falls back to an in-memory store (`lib/store/memory.ts`).

## Layout and ownership (parallel build tracks)
| Path | Owner | Purpose |
|---|---|---|
| `lib/contracts/*` | **P0 (frozen)** | Shared types every track builds against. Don't change silently; note any needed change in your report |
| `lib/claude/models.ts`, `lib/claude/client.ts` | P0 | Model routing + server-only client |
| `app/api/chat/`, `lib/claude/work/` | Track A | Work loop: streaming, code execution, tools, context assembly |
| `lib/engine/` | Track B | Pacing engine (pure TS, unit-tested) implementing `EngineApi` |
| `components/`, `app/dev/`, `app/themes.css`, `lib/themes.ts`, `lib/sound.ts`, `public/sounds/` | Track C | UI kit, themes, sounds |
| `lib/claude/content/`, `app/api/{moment,boss,story,wrapup,session}/`, `scripts/` | Track D | Content generation (`ContentApi`) + routes + demo dataset |
| `lib/store/redis.ts`, `lib/store/index.ts`, `lib/platform/`, `app/api/{user,sessions,files}/` | Track E | Persistence, rate limits, spend caps, platform routes |

## Conventions
- Server-only code never runs in the browser; the API key is read only via `lib/claude/client.ts`.
- The browser only sees `MomentView` (never answer keys, rubrics, or `correct_index`).
- Model calls: `output_config.effort` from `lib/claude/models.ts`; structured outputs via `messages.parse` + `zodOutputFormat`; always check `stop_reason` (`refusal`, `max_tokens`, `pause_turn`).
- Tests live next to code as `*.test.ts`.
- This is Next.js 16: read `node_modules/next/dist/docs/` before using framework APIs (e.g. `cookies()` is async; middleware is now `proxy.ts`).
