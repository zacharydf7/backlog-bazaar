// Pure view logic for the Community Friends directory: client-side filtering,
// sorting, and each row's presence subtitle. The list_friends RPC returns rows
// unordered and unfiltered; everything here is presentation, so it stays pure
// and unit-tested.

import { effectiveSeenAt, isPresent, lastSeenLabel, presenceActivity } from "./presence";
import type { Friend } from "../types";

export type FriendSort = "online" | "name" | "recent";

/** The directory's sort options, in display order. */
export const FRIEND_SORTS: { value: FriendSort; label: string }[] = [
  { value: "online", label: "Online first" },
  { value: "name", label: "Name" },
  { value: "recent", label: "Recently active" },
];

/** Case-insensitive substring filter on the display name. */
export function filterFriends(friends: Friend[], query: string): Friend[] {
  const q = query.trim().toLowerCase();
  if (!q) return friends;
  return friends.filter((f) => f.displayName.toLowerCase().includes(q));
}

function byName(a: Friend, b: Friend): number {
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
}

/** A sorted copy of the directory. "online" groups present friends first — on
 *  the site, or away with a stopwatch running — with a stable A–Z inside each
 *  group (the Market Square's rule — presence polls must not reshuffle rows under
 *  the reader); "recent" is most-recently-seen first with never-seen (or hidden)
 *  friends last, counting a live session as right now. */
export function sortFriends(friends: Friend[], sort: FriendSort, now: number = Date.now()): Friend[] {
  const list = [...friends];
  if (sort === "name") return list.sort(byName);
  if (sort === "recent") {
    return list.sort(
      (a, b) =>
        (effectiveSeenAt(b, now) ?? -Infinity) - (effectiveSeenAt(a, now) ?? -Infinity) ||
        byName(a, b),
    );
  }
  return list.sort(
    (a, b) => Number(isPresent(b, now)) - Number(isPresent(a, now)) || byName(a, b),
  );
}

export interface FriendSubtitle {
  /** "activity" renders in the success tint (they're online right now). */
  kind: "activity" | "idle" | "none";
  text: string;
}

/** The row's presence line: what a present friend is doing — the game their
 *  stopwatch is on, else their broadcast activity, else a plain "Online" (a
 *  hard-private friend's activity and game both arrive nulled) — otherwise when
 *  they were last seen. Appear-offline friends have no presence at all and get an
 *  empty line. */
export function friendSubtitle(f: Friend, now: number = Date.now()): FriendSubtitle {
  if (isPresent(f, now)) {
    return { kind: "activity", text: presenceActivity(f, now) || "Online" };
  }
  const seen = lastSeenLabel(f, now);
  return seen ? { kind: "idle", text: seen } : { kind: "none", text: "" };
}
