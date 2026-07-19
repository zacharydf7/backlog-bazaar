// Visitor-privacy flags: what other users can and can't see when they visit your
// Bazaar. Stored as an extensible map on the profile (profiles.privacy jsonb) and
// surfaced via the view_profile RPC. Keep the flag keys + their defaults here so
// the magic strings live in one place.

import type { Privacy } from "../types";

/** The privacy flag keys. Add new ones here as more hideable data points come up. */
export const PRIVACY_KEYS = {
  hideSpend: "hide_spend",
  appearOffline: "appear_offline",
  privateProfile: "private_profile",
  hideFinancialFeed: "hide_financial_feed",
  hideCustomCovers: "hide_custom_covers",
} as const;

/** True if the user has hidden their real-world money spent from visitors.
 *  Safe default: not hidden. */
export function isSpendHidden(privacy: Privacy | null | undefined): boolean {
  return Boolean(privacy?.[PRIVACY_KEYS.hideSpend]);
}

/** True if the user has chosen to appear offline (hide presence + activity).
 *  Safe default: visible. */
export function isAppearOffline(privacy: Privacy | null | undefined): boolean {
  return Boolean(privacy?.[PRIVACY_KEYS.appearOffline]);
}

/** True if the user has made their profile private — hard-hidden from every other
 *  player: out of the Market Square and friend search, profile/library/activity/reviews
 *  unreadable even by friends (friendships and messaging keep working). Enforced
 *  server-side in the RPCs (issue e3242526). Default: false (findable), so the
 *  social graph isn't empty. */
export function isProfilePrivate(privacy: Privacy | null | undefined): boolean {
  return Boolean(privacy?.[PRIVACY_KEYS.privateProfile]);
}

/** True if the user hides their coin/financial milestones (e.g. the coins earned on
 *  a finish) from the activity feed. Default: HIDDEN — only an explicit `false`
 *  reveals them. Mirrors the server-side default in list_activity_feed. */
export function isFinancialFeedHidden(privacy: Privacy | null | undefined): boolean {
  const v = privacy?.[PRIVACY_KEYS.hideFinancialFeed];
  return v === undefined || v === null ? true : Boolean(v);
}

/** True if the user has opted out of seeing OTHER players' custom (unmoderated)
 *  cover uploads — they're always served the safe global default instead. The
 *  visitor board's friend-gate is enforced server-side in player_library (which
 *  reads this same flag); this predicate covers the remaining client surfaces
 *  (e.g. message game-embeds). Their own board is unaffected. Default: not hidden. */
export function isCustomCoversHidden(privacy: Privacy | null | undefined): boolean {
  return Boolean(privacy?.[PRIVACY_KEYS.hideCustomCovers]);
}
