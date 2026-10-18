/**
 * Theme registry (Track C). Token overrides live in app/themes.css as [data-theme="<id>"] blocks.
 * Palettes and contrast notes: reference/research/04-ui-themes.md.
 */

export type ThemeId = "frost" | "sunset" | "forest" | "night" | "sakura" | "parchment" | "matcha";

export interface ThemeDef {
  id: ThemeId;
  label: string;
  unlockLevel: number;
  /** [background, primary, accent] for the picker swatch. */
  swatch: [string, string, string];
  dark?: boolean;
}

export const DEFAULT_THEME: ThemeId = "frost";

export const THEMES: readonly ThemeDef[] = [
  { id: "frost", label: "Frost", unlockLevel: 1, swatch: ["#f4f8fb", "#2f6faf", "#7fb3e0"] },
  { id: "sunset", label: "Sunset", unlockLevel: 2, swatch: ["#fff4ec", "#a8432c", "#f4a261"] },
  { id: "forest", label: "Forest", unlockLevel: 4, swatch: ["#f1f5ee", "#3f6b4a", "#a3c49a"] },
  { id: "night", label: "Night Sky", unlockLevel: 5, swatch: ["#141b2d", "#8fb8ff", "#f2d27a"], dark: true },
  { id: "sakura", label: "Sakura", unlockLevel: 7, swatch: ["#fdf3f5", "#a8445f", "#f5b8c8"] },
  { id: "parchment", label: "Parchment", unlockLevel: 8, swatch: ["#f5ecd7", "#7a4e2d", "#c9a227"] },
  { id: "matcha", label: "Matcha", unlockLevel: 10, swatch: ["#f3f5ec", "#55703b", "#c5d6a0"] },
];

export function getTheme(id: string): ThemeDef | undefined {
  return THEMES.find((t) => t.id === id);
}

/**
 * A theme is usable if it's a level-1 theme, the server lists it in the user's unlocks,
 * or (optionally) the user's level already reaches its unlock level.
 */
export function isUnlocked(themeId: string, unlockedIds: readonly string[], level?: number): boolean {
  const theme = getTheme(themeId);
  if (!theme) return false;
  if (theme.unlockLevel <= 1) return true;
  if (unlockedIds.includes(themeId)) return true;
  return level !== undefined && level >= theme.unlockLevel;
}

/** Sets <html data-theme>. Unknown ids fall back to the default theme. Returns the applied id. */
export function applyTheme(id: string): ThemeId {
  const theme = getTheme(id)?.id ?? DEFAULT_THEME;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = getTheme(theme)?.dark ? "dark" : "light";
  }
  return theme;
}
