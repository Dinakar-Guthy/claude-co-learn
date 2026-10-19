/** Shared helpers for cited web sources (server and client). */

/** "https://www.scikit-learn.org/x" → "scikit-learn.org"; the input itself if it isn't a URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Only http(s) links are ever rendered. */
export const isWebUrl = (url: string) => /^https?:\/\//i.test(url);
