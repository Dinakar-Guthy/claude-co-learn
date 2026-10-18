# Research: can Claude actually run code in the prototype?

_Subagent research report, 2026-10-17 (claude-api skill + live docs; live docs win on conflicts)._

## Bottom line
**Feasible.** Use Anthropic's **server-side code execution tool** via the Vercel AI SDK: real Python + scikit-learn in an
isolated sandbox, generally available on all Claude 5.5 models, needing only the API key. Hosting a real Claude Code
instance isn't worth it for a 2-day prototype; a local bridge is a good future improvement.

## 1. Code execution tool
Docs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool
- Versions `code_execution_20250825`, `_20260120`, `_20260521` (latest). No beta header needed.
- Models: Opus 5.5, Sonnet 5.5, Haiku 5.5.
- Sandbox: Python 3.11; pandas, numpy, scipy, scikit-learn, statsmodels, matplotlib, seaborn, joblib, pyarrow, openpyxl. **No internet** (no pip install). 1 CPU, 5 GiB RAM, 5 GiB disk.
- **Container reuse:** send back `container.id` → files persist across turns (rely on files, not Python variables). Idle containers are checkpointed after ~5 min and expire 30 days after creation; on an expired ID, retry without it.
- **Pricing:** 1,550 free container-hours/month/org, then $0.05/hour (5-min minimum).
- Container data retained up to 30 days (not zero-data-retention eligible).
- Files API: upload a CSV → `{type:"container_upload", file_id}`; generated files (charts) come back with a `file_id` → `files.download`.
- Streaming: code streams as it's generated; results arrive whole. Long turns stop at 10 internal steps with `stop_reason: "pause_turn"` → re-send to continue.
- Latency (unverified): a few seconds per execution; ~15–45s for a model-training turn.

## 2. Vercel AI SDK
- `@ai-sdk/anthropic` 4.0.82 exposes `anthropic.tools.codeExecution_20260120()`.
- Container ID via `providerMetadata.anthropic.container.id`, passed back in `providerOptions.anthropic.container.id`. Store it per session.
- CSV upload: `file` part with `providerOptions.anthropic.containerUpload: true`.
- **Pitfall:** the SDK maps `pause_turn` to `"stop"`, so a long turn can end silently truncated. Detect it and re-call.
- Chart download: use `@anthropic-ai/sdk` `files.download` in a route handler. Fallback: the native SDK `messages.stream` with SSE, similar effort.

## 3. Real Claude Code (Agent SDK) / local mode
- The Agent SDK spawns a `claude` CLI process; it **can't run on Vercel functions** and needs a container (~1 GiB RAM, 5 GiB disk): Docker/Modal/K8s/Vercel Sandbox/E2B. https://code.claude.com/docs/en/agent-sdk/hosting
- Effort ~8–12 extra hours, high risk for 2 days. Middle ground: Managed Agents (beta).
- **Connecting to a user's local Claude Code:** a hosted server can't reach a laptop (NAT, no listening port). It would need a local companion that dials out (e.g., `npx co-learn-bridge` over WebSocket, or an MCP/plugin bridge) plus pairing/auth. Good **future "local mode"**; reviewers wouldn't install it.

## 4. Demo dataset
- sklearn built-ins (e.g., breast cancer): no upload needed, but not a work scenario.
- IBM Telco Churn: realistic, **license unclear**.
- **Recommended: our own seeded synthetic churn CSV.** ~5,000 rows (tenure, plan, monthly_charges, support_tickets, contract), ~15% churn, some noise. No license issues; the imbalance sets up the "accuracy is misleading" moment (always predicting "stays" scores ~85%).

## 5. Recommendation
- Route: `streamText` + `codeExecution_20260120`; upload the CSV on the first turn; store the container ID per session; stream text/code/stdout; `/api/files/[id]` proxy for charts; handle `pause_turn`.
- **Effort ~6–10 h.** Cost ~$0.50–1.50 per 10-turn Opus session (about half on Sonnet); container time within the free hours.
- Risks: latency (streaming + "running code…" states), container expiry (recreate), silent `pause_turn` truncation, key abuse (rate limits). Prompt-injected code is low risk: it runs in Anthropic's isolated, offline sandbox.
- **Fallback:** a pre-recorded real run, replayed and labeled "replayed".
- Unverified: latency, per-run time limit, Telco license, the raw `pause_turn` signal in the AI SDK.
