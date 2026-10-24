// A page's open tab, kept on its own browser history entry (issue 88e8ed1c):
// open a game from a compilation's Games tab, press Back, and the compilation
// reopens on Games instead of its first tab. It lives in the entry's state, not
// the URL, so opening the page from elsewhere still starts on the first tab
// (a reload keeps it, like Back).

/** The tab saved on the current history entry, if any. */
export function entryTab(): string | null {
  const tab = (window.history.state as { tab?: unknown } | null)?.tab;
  return typeof tab === "string" ? tab : null;
}

/** Save `tab` on the current history entry, keeping its URL and other state. */
export function rememberEntryTab(tab: string): void {
  window.history.replaceState({ ...(window.history.state ?? {}), tab }, "");
}
