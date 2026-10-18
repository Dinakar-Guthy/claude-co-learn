# Context persistence: brainstorm (2026-10-17)

How a user's sessions, learning history, and progress survive over time, and how we keep Claude's context useful as sessions grow.

## Two separate problems
1. **App state persistence**: durably storing sessions, learning moments, mastery, and XP/level/unlocks so users can come back.
2. **Model context management**: deciding what to send Claude on each call so it "remembers" the work and the learner without resending everything.

## 1. App state: storage options
| Option | Setup | Durability | Cross-device | Notes |
|---|---|---|---|---|
| localStorage / IndexedDB | none | until browser storage is cleared | no | Fine for a demo; reviewers usually use one browser |
| **Anonymous ID cookie + Upstash Redis** | ~30 min via Vercel Marketplace | durable | with a "resume code" | **Already needed for rate limiting**, so it's nearly free to reuse; JSON document per user |
| Postgres (Neon / Supabase) | ~1–2 h | durable | with auth | Relational queries (analytics); overkill for P0 |
| Auth (magic link / Google) | 2–4 h | durable | yes | P1; adds friction for reviewers |

**Recommendation:** Upstash Redis from day 1, behind a small storage interface (so localStorage or Postgres can be
swapped in later). Anonymous ID in a cookie, no login. P1: a "resume code" for cross-device continuity; real auth later.

## What we store
| Entity | Fields |
|---|---|
| User | `anonId`, `createdAt`, XP, level, unlocked themes/sound packs, settings (sound on/off, learning dial) |
| Session | goal/intent brief, status, messages, rolling summary, `startedAt`, length target |
| LearningMoment | session, type, concept, question, rubric, user answer, grade, feedback, used MC fallback?, timestamp |
| ConceptMastery | user, concept, mastery score, attempts, last seen (drives spaced review across sessions) |
| StoryState | story bible, chapter summaries, open threads |
| Usage | per-anonId + per-IP daily token count (spend cap) |

Retention: expire anonymous data after **60 days** (Redis TTL, refreshed on each visit). Store no PII beyond what users type into the chat.

**Durability (verified, `reference/research/07-storage-durability.md`):** Upstash persists data to disk; it lasts days to weeks.
Free databases are archived only after ≥30 days of *inactivity* (restorable). Gotchas:
- Set the anon ID as a **server-set HttpOnly cookie**: Safari deletes JS-set cookies and localStorage after 7 days without interaction.
- If the demo might sit idle for a month (e.g., a slow review cycle), switch to pay-as-you-go with a $1–5 budget cap.
- Handle write failures gracefully (writes are rejected when the 250 MB free limit is hit).

## 2. Model context: what Claude sees per call
- **Stable prefix (prompt-cached):** system prompt (Co-learn rules, moment types, grading rubric format), session intent brief.
- **Learner profile:** a compact summary of mastered and weak concepts and recent misconceptions, drawn from ConceptMastery.
- **Work state:** a rolling summary of what's been done so far, plus the last N messages verbatim.
- **Compaction:** when history exceeds a threshold, summarize older turns into the rolling summary (one cheap Haiku call) and drop them from the verbatim window.
- **Cross-session memory:** starting a new session loads the learner profile and the codex of past concepts, so Claude can resurface stale concepts as spaced review and skip mastered ones.
- **P1 alternative:** Anthropic's memory tool, letting Claude read and write a learner-profile memory file backed by our store. Verify the API details before choosing it.

## Effort
| Piece | Effort |
|---|---|
| Storage interface + Redis-backed implementation | 1.5–2 h |
| Context assembly + compaction | 1–1.5 h |
| Cross-session learner profile + spaced resurfacing | 1–2 h (could be P1) |
| Resume code (cross-device) | ~1 h (P1) |

If time runs short, ship localStorage for session state (Redis is still needed for rate limiting) and add Redis-backed sessions as a follow-up.
