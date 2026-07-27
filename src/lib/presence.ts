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
  // The Community sections share one deliberately vague label — presence must
  // never broadcast who someone is messaging or looking up.
  community: "Hanging out in the Community",
  "community-activity": "Hanging out in the Community",
  "community-messages": "Hanging out in the Community",
  "community-discover": "Browsing the Market Square",
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

/** Flavor verbs for the "in a live stopwatch session" presence label, grouped by
 *  how long the timer has been running. Buckets escalate from a fresh boot-up to
 *  an all-out marathon; within a bucket the game title deterministically picks the
 *  phrasing, so it's stable for a given game but varied across a whole library. */
const SESSION_PHRASES: { belowHours: number; verbs: string[] }[] = [
  { belowHours: 0.5, verbs: ["Booting up", "Firing up", "Diving into"] },
  { belowHours: 2, verbs: ["Playing", "Deep in", "In a session of"] },
  { belowHours: 4, verbs: ["Grinding away at", "Hours into", "Locked into"] },
  { belowHours: 8, verbs: ["On a marathon in", "Can't put down", "Sinking hours into"] },
  { belowHours: Infinity, verbs: ["Lost in", "Still going in", "Living in"] },
];

/** A small, stable non-negative hash of a string — used to pick a phrase per game
 *  so the same title always reads the same way (no jitter between pings). */
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Presence label while a live stopwatch is running: reflects the game and how
 *  long they've been at it, e.g. "Diving into Hades", "Grinding away at Hades",
 *  "Lost in Hades". The length bucket escalates as the session runs; the exact
 *  verb is chosen from the game title so a library reads with variety while any
 *  one game stays consistent. Pure so the UI can broadcast it from the heartbeat. */
export function sessionActivityLabel(gameTitle: string, elapsedHours: number): string {
  const title = gameTitle.trim() || "a game";
  const bucket =
    SESSION_PHRASES.find((b) => elapsedHours < b.belowHours) ??
    SESSION_PHRASES[SESSION_PHRASES.length - 1];
  const verb = bucket.verbs[stableHash(title) % bucket.verbs.length];
  return `${verb} ${title}`;
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
