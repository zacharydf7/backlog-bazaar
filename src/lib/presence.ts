// Lightweight presence: who's active and what they're doing. The client pings
// profiles.last_seen_at on a timer + on navigation (see the heartbeat in App),
// and we treat someone as "online" if their last ping is recent. Pure helpers
// here so they can be unit-tested without React/Supabase.

import { timeAgo } from "./time";

/** How recent a heartbeat must be to count as "online". The client pings every
 *  ~45s, so this tolerates two missed pings before going offline — snappy without
 *  flickering offline during a brief gap. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

/** True if the user's last heartbeat is within the online window. */
export function isOnline(lastSeenAt: number | null | undefined, now: number = Date.now()): boolean {
  return lastSeenAt != null && now - lastSeenAt < ONLINE_WINDOW_MS;
}

/** Human label for what a user is doing, keyed by the app's View id. Kept as
 *  plain strings so this lib doesn't depend on the Sidebar's View type; callers
 *  pass the current view (or "visiting" while browsing someone's Bazaar). */
export const ACTIVITY_LABELS: Record<string, string> = {
  backlog: "In the Bazaar",
  profile: "Tending their profile",
  playing: "Browsing Now Playing",
  finished: "Browsing Finished",
  wishlist: "Browsing the Wishlist",
  market: "Browsing the Caravan",
  ledger: "Reviewing the Master Ledger",
  leaderboard: "Viewing the Leaderboard",
  requests: "Reading Requests & bugs",
  account: "In Settings",
  about: "Reading How it works",
  whatsnew: "Reading What's new",
  users: "Managing users",
  economy: "Tuning the economy",
  visiting: "Visiting a Bazaar",
};

/** The activity label for a view, falling back to a gentle default. */
export function activityLabel(view: string): string {
  return ACTIVITY_LABELS[view] ?? "Online";
}

/** The activity to broadcast: a non-empty custom override wins; otherwise the
 *  automatic, navigation-derived label. A whitespace-only override counts as
 *  unset (back to automatic). */
export function resolveActivity(override: string | null | undefined, autoLabel: string): string {
  const o = override?.trim();
  return o ? o : autoLabel;
}

/** A short "active …" label for an offline (or unknown-activity) user, or "" when
 *  there's no last-seen timestamp at all. */
export function lastSeenLabel(
  lastSeenAt: number | null | undefined,
  now: number = Date.now(),
): string {
  if (lastSeenAt == null) return "";
  if (isOnline(lastSeenAt, now)) return "active now";
  return `active ${timeAgo(lastSeenAt, now)} ago`;
}
