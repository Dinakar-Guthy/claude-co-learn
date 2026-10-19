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

/**
 * Lines up a lesson's [n] markers with the sources that are shown. Claude sometimes numbers markers by search-result
 * position instead of by its sources list; dropped sources would also shift the numbers. Markers are read against
 * the sources list when they all fit it, otherwise against `resultUrls` (the latest search results, in order).
 * Kept sources are renumbered 1..k, and markers that point at nothing shown are removed.
 */
export function alignCitations(lesson: string, listed: readonly { url: string }[], keep: readonly boolean[], resultUrls: readonly string[]): string {
  const markers = [...lesson.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const byList = (n: number) => (n >= 1 && n <= listed.length ? n - 1 : -1);
  const byResult = (n: number) => (n >= 1 && n <= resultUrls.length ? listed.findIndex((s) => normUrl(s.url) === normUrl(resultUrls[n - 1])) : -1);
  const fits = (pick: (n: number) => number) => markers.filter((n) => pick(n) !== -1).length;
  const pick = markers.every((n) => byList(n) !== -1) || fits(byList) >= fits(byResult) ? byList : byResult;
  const shownNumber = (i: number) => (i !== -1 && keep[i] ? keep.slice(0, i).filter(Boolean).length + 1 : 0);
  return lesson
    .replace(/ ?\[(\d+)\]/g, (whole, n: string) => {
      const shown = shownNumber(pick(Number(n)));
      return shown ? `${whole.startsWith(" ") ? " " : ""}[${shown}]` : "";
    })
    .trim();
}
