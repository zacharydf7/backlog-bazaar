export interface ThemeDef {
  id: string;
  name: string;
  blurb: string;
  /** Preview swatches: [canvas, surface, brand, accent]. */
  swatches: [string, string, string, string];
}

// Gaming-themed palettes. The token values live in index.css keyed by `id`.
export const THEMES: ThemeDef[] = [
  { id: "treasure", name: "Treasure", blurb: "Dark & gold", swatches: ["#0c0a09", "#1a1715", "#f59e0b", "#fcd34d"] },
  { id: "parchment", name: "Parchment", blurb: "Light & warm", swatches: ["#f6f3ec", "#ffffff", "#f59e0b", "#b45309"] },
  { id: "mana", name: "Mana", blurb: "Deep blue", swatches: ["#0c1026", "#182052", "#4274d9", "#95ccdd"] },
  { id: "frost", name: "Frost", blurb: "Icy & light", swatches: ["#eaf3f5", "#ffffff", "#4274d9", "#2f57b5"] },
  { id: "poison", name: "Poison", blurb: "Toxic green", swatches: ["#0a1410", "#12241b", "#22c55e", "#86efac"] },
  { id: "inferno", name: "Inferno", blurb: "Molten red", swatches: ["#160a07", "#28130e", "#f97316", "#fb923c"] },
  { id: "arcade", name: "Arcade", blurb: "Neon purple", swatches: ["#130a1f", "#221038", "#a855f7", "#f0abfc"] },
  { id: "bloodmoon", name: "Bloodmoon", blurb: "Crimson & navy", swatches: ["#04122b", "#0a2247", "#ff204e", "#ff5e7d"] },
  { id: "phoenix", name: "Phoenix", blurb: "Ember & coral", swatches: ["#09122c", "#131d3b", "#be3144", "#e8826f"] },
  { id: "crimson", name: "Crimson", blurb: "Deep red & black", swatches: ["#0c0708", "#170a0c", "#be123c", "#db4456"] },
];

const KEY = "bb-theme";

/** Active theme id, read from the <html data-theme> set by the no-flash script. */
export function getThemeId(): string {
  return document.documentElement.dataset.theme || "treasure";
}

/** Apply a theme to <html> WITHOUT persisting it — used to preview another
 *  user's theme while visiting their Bazaar, so the visitor's own saved choice
 *  isn't clobbered. Restore with applyThemeId(yourOwnTheme) on leave. */
export function applyThemeId(id: string): void {
  document.documentElement.dataset.theme = id || "treasure";
}

/** Apply a theme to <html> and persist the choice. */
export function setThemeId(id: string): void {
  applyThemeId(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}
