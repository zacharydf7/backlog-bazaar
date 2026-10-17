// The player's timezone, read from the browser and saved at sign-in
// (set_my_time_zone) so Night Owl and "days played" count the player's own
// nights and days. Null when the browser can't say.

export function browserTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz ? tz : null;
  } catch {
    return null;
  }
}
