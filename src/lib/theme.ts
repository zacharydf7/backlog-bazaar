export type Theme = "light" | "dark";

const KEY = "bb-theme";

/** Current theme, read from the <html> class set by the no-flash script. */
export function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Apply a theme to <html> and persist the choice. */
export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
}
