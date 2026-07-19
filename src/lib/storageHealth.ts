/** Storage-health probe (issue cebb6b74 — "refresh kicks me back to login").
 *
 *  Sessions persist across refreshes only if localStorage actually works. Some
 *  environments silently break it — Safari with "Block all cookies", certain
 *  in-app browsers, privacy extensions that wipe site data — and supabase-js
 *  then falls back to an IN-MEMORY session: signing in works fine, but every
 *  refresh forgets it. This probe makes that failure visible so the sign-in
 *  page can explain it instead of looking like a bug. */
export function persistentStorageAvailable(storage?: Pick<Storage, "setItem" | "getItem" | "removeItem">): boolean {
  try {
    // Accessing window.localStorage itself can throw (SecurityError) when the
    // browser blocks site data, so even the lookup stays inside the try.
    const s = storage ?? window.localStorage;
    const probe = "bb-storage-probe";
    s.setItem(probe, "1");
    const ok = s.getItem(probe) === "1";
    s.removeItem(probe);
    return ok;
  } catch {
    return false;
  }
}
