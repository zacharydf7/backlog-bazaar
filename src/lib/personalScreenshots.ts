// A bundled game's own screenshots (issue 86fc0b4b). A game inside a
// compilation is a personal entry with no catalog link, so it can't show the
// catalog's shared screenshots; the player uploads their own instead. Stored
// as public URLs in the covers bucket under the player's folder (the same
// place and rules as a custom cover). Pure helpers, unit-tested.

/** At most this many per game (mirrored by games_personal_screenshots_check). */
export const MAX_PERSONAL_SCREENSHOTS = 12;

/** Where a new screenshot is stored in the covers bucket: the player's folder
 *  (the bucket's write rule), named after the game and the upload time so
 *  several can sit side by side. */
export function personalShotPath(userId: string, gameId: string, now: number): string {
  return `${userId}/${gameId}-shot-${now}.jpg`;
}

/** The covers-bucket path behind one of its public URLs (any cache-busting
 *  query dropped), or null for a URL that isn't in the covers bucket. */
export function coversPathFromUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/covers/";
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const path = url.slice(at + marker.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

/** Coerce a stored value into a list of URLs; anything else is no screenshots. */
export function coercePersonalScreenshots(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((u): u is string => typeof u === "string" && u !== "") : [];
}
