// Pure view logic for the Community Friends directory: client-side filtering,
// sorting, and each row's presence subtitle. The list_friends RPC returns rows
// unordered and unfiltered; everything here is presentation, so it stays pure
// and unit-tested.

import { isOnline, lastSeenLabel } from "./presence";
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

/** A sorted copy of the directory. "online" groups online friends first with a
 *  stable A–Z inside each group (the Market Square's rule — presence polls must
 *  not reshuffle rows under the reader); "recent" is most-recently-seen first
 *  with never-seen (or hidden) friends last. */
export function sortFriends(friends: Friend[], sort: FriendSort, now: number = Date.now()): Friend[] {
  const list = [...friends];
  if (sort === "name") return list.sort(byName);
  if (sort === "recent") {
    return list.sort(
      (a, b) => (b.lastSeenAt ?? -Infinity) - (a.lastSeenAt ?? -Infinity) || byName(a, b),
    );
  }
  return list.sort(
    (a, b) =>
      Number(isOnline(b.lastSeenAt, now)) - Number(isOnline(a.lastSeenAt, now)) || byName(a, b),
  );
}

export interface FriendSubtitle {
  /** "activity" renders in the success tint (they're online right now). */
  kind: "activity" | "idle" | "none";
  text: string;
}

/** The row's presence line: what an online friend is doing (their broadcast
 *  activity, or a plain "Online" — a hard-private friend's activity arrives
 *  nulled), else when they were last seen. Appear-offline friends have no
 *  last-seen at all and get an empty line. */
export function friendSubtitle(f: Friend, now: number = Date.now()): FriendSubtitle {
  if (isOnline(f.lastSeenAt, now)) {
    return { kind: "activity", text: f.activity?.trim() || "Online" };
  }
  const seen = lastSeenLabel(f.lastSeenAt, now);
  return seen ? { kind: "idle", text: seen } : { kind: "none", text: "" };
}
