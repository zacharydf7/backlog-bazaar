// Display name normalization + validation. Kept pure so it's unit-tested; the
// store action and Account UI both lean on it. The name is how a player appears
// on the leaderboard, in other players' Bazaars, and in their own header.

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 32;

/** Trim and collapse runs of whitespace to single spaces — what we persist. */
export function cleanDisplayName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** An error message for the cleaned value, or null when it's acceptable. */
export function validateDisplayName(raw: string): string | null {
  const v = cleanDisplayName(raw);
  if (v.length < DISPLAY_NAME_MIN) return `Use at least ${DISPLAY_NAME_MIN} characters.`;
  if (v.length > DISPLAY_NAME_MAX) return `Keep it to ${DISPLAY_NAME_MAX} characters or fewer.`;
  return null;
}
