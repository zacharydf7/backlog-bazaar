// Lightweight presence: who's active and what they're doing. Presence comes from
// two independent signals, and either one alone means "here":
//   1. the browser heartbeat — the client pings profiles.last_seen_at on a timer
//      and on navigation (see the heartbeat in App);
//   2. a running stopwatch — a live play_sessions row, served by the presence
//      RPCs as (playing_title, playing_since).
// The second exists because the first can't survive the commonest way to play:
// start the timer on a phone, put the phone down, go play. The heartbeat stops
// within seconds of the tab hiding, so a session-long player used to read as
// offline. Pure helpers here so they can be unit-tested without React/Supabase.

import { timeAgo } from "./time";
import { LONG_SESSION_HOURS, elapsedHours } from "./playSessions";

/** How recent a heartbeat must be to count as "online". The client pings every
 *  ~45s, so this tolerates two missed pings before going offline — snappy without
 *  flickering offline during a brief gap. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

/** How long a running stopwatch keeps its player present. Past this the app
 *  already stops trusting the timer (it's where the pill nudges "still
 *  playing?"), so a stopwatch nobody stopped stops holding anyone online.
 *  Mirrored by the interval in live_play_presence (supabase/schema.sql) — the
 *  server won't even return a session older than this; this bound also covers
 *  screens that fetch once and never re-poll. */
export const SESSION_PRESENCE_MS = LONG_SESSION_HOURS * 60 * 60 * 1000;

/** The presence fields every user-bearing row carries, whichever RPC it came
 *  from. Structural, so the helpers work on friends, stalls, profiles and admin
 *  rows alike. */
export interface PresenceFields {
  lastSeenAt: number | null;
  activity?: string | null;
  /** Title of the game their stopwatch is on — null when there's no live
   *  session, or when the game is private (presence without the title). */
  playingTitle?: string | null;
  /** When that stopwatch started; null when no session is running. */
  playingSince?: number | null;
}

/** True if the user's last heartbeat is within the online window. */
export function isOnline(lastSeenAt: number | null | undefined, now: number = Date.now()): boolean {
  return lastSeenAt != null && now - lastSeenAt < ONLINE_WINDOW_MS;
}

/** True while the user's stopwatch is running (and still inside the window we
 *  trust). Presence in its own right — it does not need a heartbeat. */
export function hasLiveSession(p: PresenceFields, now: number = Date.now()): boolean {
  return p.playingSince != null && now - p.playingSince < SESSION_PRESENCE_MS;
}

/** Is this user here at all — on the site, or away at their game? This is the
 *  question every presence surface asks; `isOnline` alone answers only the first
 *  half and would call a player with a running session offline. */
export function isPresent(p: PresenceFields, now: number = Date.now()): boolean {
  return isOnline(p.lastSeenAt, now) || hasLiveSession(p, now);
}

/** When this user was last known to be around, for recency sorting: a live
 *  stopwatch counts as right now, so a player away at their game doesn't sink
 *  below people who closed the tab an hour ago while still showing as present. */
export function effectiveSeenAt(p: PresenceFields, now: number = Date.now()): number | null {
  if (hasLiveSession(p, now)) return now;
  return p.lastSeenAt;
}

/** What to show this user as doing. A live stopwatch wins and is rendered from
 *  (title, since) at read time, so the phrase keeps escalating — "Diving into
 *  Hades" becomes "Grinding away at Hades" — even for a player whose browser has
 *  been shut for hours. Falls back to their last broadcast activity. */
export function presenceActivity(p: PresenceFields, now: number = Date.now()): string {
  if (hasLiveSession(p, now) && p.playingTitle?.trim()) {
    return sessionActivityLabel(p.playingTitle, elapsedHours(p.playingSince as number, now));
  }
  return p.activity?.trim() ?? "";
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
  "community-recs": "Hanging out in the Community",
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

/** A short "active …" label for a user with no activity line to show, or "" when
 *  there's nothing to say at all (no heartbeat ever, no session). Someone present
 *  by either signal is "active now" — a player away at their game must not be
 *  described by the hour-old heartbeat they left behind. */
export function lastSeenLabel(p: PresenceFields, now: number = Date.now()): string {
  if (isPresent(p, now)) return "active now";
  if (p.lastSeenAt == null) return "";
  return `active ${timeAgo(p.lastSeenAt, now)} ago`;
}
