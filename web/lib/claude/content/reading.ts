/**
 * generateFurtherReading (Sonnet + web search): the "Learn more" list at the end of a session (decision log
 * 2026-10-18). Web search citations can't be combined with structured outputs, so the reply is a plain list we
 * parse; only URLs that came back from a search (or were cited during the session) are kept, so no link is made up.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/claude/client";
import { MODELS, WEB_SEARCH_TOOL } from "@/lib/claude/models";
import type { Intent, Reading, Source } from "@/lib/contracts/session";
import { isWebUrl } from "@/lib/sources";
import { FALLBACK_BETA } from "./call";
import { ContentRefusalError } from "./errors";
import { asData, bullets, DATA_RULE, truncate } from "./prompt";
import { reportUsage } from "./usage";

export const MAX_READINGS = 5;

export const READING_SYSTEM = `You recommend further reading for someone who just finished a short learning session with Claude. They will keep the list for their own reference.
Use web search (one to three searches) to find 3-5 freely accessible, trustworthy readings that go one step deeper than the session: official documentation, university course notes, standard references, or well-known explainers from reputable sources. Prefer one reading per key concept, and include any good source already cited in the session if it fits.
Reply with only the list, one reading per line, exactly in this form:
- [Title](URL) | One plain sentence on what they'll get from it (e.g. "Shows how to pick a threshold from the costs of each kind of mistake.").
Only use URLs that appeared in your search results or in the cited sources given to you. Never write a URL from memory.
${DATA_RULE}`;

export function readingPrompt(intent: Intent, concepts: string[], cited: Source[]): string {
  return [
    "What the session was about:",
    asData("learner_goal", truncate(intent.goal, 600)),
    "Concepts they practised:",
    bullets(concepts.slice(0, 8)),
    "Sources already cited during the session:",
    bullets(cited.slice(0, 10).map((s) => `${s.title}: ${s.url}`)),
  ].join("\n");
}

const LINE = /^\s*[-*]\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*[|—–-]+\s*(.+?)\s*$/;
const norm = (url: string) => url.replace(/#.*$/, "").replace(/\/+$/, "");

/** Parses the reply, keeping only allowed URLs (deduped, at most MAX_READINGS). */
export function parseReadings(text: string, allowed: ReadonlySet<string>): Reading[] {
  const out: Reading[] = [];
  for (const line of text.split("\n")) {
    const m = LINE.exec(line);
    if (!m) continue;
    const [, title, url, why] = m;
    if (!isWebUrl(url) || !allowed.has(norm(url)) || out.some((r) => norm(r.url) === norm(url))) continue;
    out.push({ title: title.trim(), url, why: why.trim() });
    if (out.length === MAX_READINGS) break;
  }
  return out;
}

/** URLs of every web search result in the response content. */
export function searchResultUrls(content: readonly Anthropic.Beta.BetaContentBlock[]): string[] {
  return content.flatMap((b) => (b.type === "web_search_tool_result" && Array.isArray(b.content) ? b.content.map((r) => r.url) : []));
}

export async function generateFurtherReading({ intent, concepts, cited }: { intent: Intent; concepts: string[]; cited: Source[] }): Promise<Reading[]> {
  const route = MODELS.reading;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: readingPrompt(intent, concepts, cited) }];
  const allowed = new Set(cited.map((s) => norm(s.url)));
  let text = "";
  // A long search turn can pause (pause_turn); re-send the paused message as-is to let it finish.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic().beta.messages.create(
      {
        model: route.model,
        max_tokens: route.maxTokens,
        system: READING_SYSTEM,
        messages,
        tools: [{ ...WEB_SEARCH_TOOL, max_uses: 3 }],
        output_config: { effort: route.effort },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      },
      { timeout: 90_000 },
    );
    await reportUsage(res.model, res.usage);
    if (res.stop_reason === "refusal") throw new ContentRefusalError("generateFurtherReading", res.stop_details?.category ?? null);
    for (const url of searchResultUrls(res.content)) allowed.add(norm(url));
    text += res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
  }
  return parseReadings(text, allowed);
}
