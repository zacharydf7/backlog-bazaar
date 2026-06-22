// Visitor-privacy flags: what other users can and can't see when they visit your
// Bazaar. Stored as an extensible map on the profile (profiles.privacy jsonb) and
// surfaced via the view_profile RPC. Keep the flag keys + their defaults here so
// the magic strings live in one place.

import type { Privacy } from "../types";

/** The privacy flag keys. Add new ones here as more hideable data points come up. */
export const PRIVACY_KEYS = {
  hideSpend: "hide_spend",
} as const;

/** True if the user has hidden their real-world money spent from visitors.
 *  Safe default: not hidden. */
export function isSpendHidden(privacy: Privacy | null | undefined): boolean {
  return Boolean(privacy?.[PRIVACY_KEYS.hideSpend]);
}
