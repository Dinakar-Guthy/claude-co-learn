/**
 * Avoids a Frost flash before the user's theme loads: the chosen theme is remembered in localStorage and an
 * inline <head> script (THEME_BOOT_SCRIPT, rendered by the root layout) applies it before first paint.
 */
import { THEMES } from "@/lib/themes";

export const THEME_STORAGE_KEY = "cl_theme";

const DARK = THEMES.filter((t) => t.dark).map((t) => t.id);
const KNOWN = THEMES.map((t) => t.id);

export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t&&${JSON.stringify(KNOWN)}.indexOf(t)>=0){var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=${JSON.stringify(DARK)}.indexOf(t)>=0?"dark":"light";}}catch(e){}})();`;

export function rememberTheme(themeId: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies after load.
  }
}
