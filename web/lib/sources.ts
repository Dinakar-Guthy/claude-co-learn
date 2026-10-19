/** Shared helpers for cited web sources (server and client). */

/** "https://www.scikit-learn.org/x" → "scikit-learn.org"; the input itself if it isn't a URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** For matching a cited URL against search results: ignores a #fragment and trailing slashes. */
export const normUrl = (url: string) => url.trim().replace(/#.*$/, "").replace(/\/+$/, "");

/** URLs of every web search result in a list of content blocks (responses or stored history). */
export function searchResultUrls(content: readonly unknown[]): string[] {
  return content.flatMap((b) => {
    const block = b as { type?: string; content?: unknown };
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) return [];
    return block.content.flatMap((r: { url?: unknown }) => (typeof r.url === "string" ? [r.url] : []));
  });
}

/** Only http(s) links are ever rendered. */
export const isWebUrl = (url: string) => /^https?:\/\//i.test(url);
