// Pure helpers for the social features (friends + activity feed). Kept free of
// React/Supabase so the friendship-status → button mapping and the activity-event
// → headline strings are unit-tested without the cloud. The privacy predicates for
// the feed live in src/lib/privacy.ts; the data shapes live in src/types.ts.

import type { ActivityEvent, FriendshipStatus } from "../types";

/** What a friend-search row's primary button does, given our relationship to that
 *  user. `action` maps to a store call; `none` is the inert "already friends" state. */
export interface FriendActionConfig {
  label: string;
  action: "send" | "cancel" | "accept" | "none";
  disabled: boolean;
}

/** The button to show next to a searched user, driven by our friendship status. */
export function friendAction(status: FriendshipStatus): FriendActionConfig {
  switch (status) {
    case "pending_out":
      return { label: "Requested", action: "cancel", disabled: false };
    case "pending_in":
      return { label: "Accept", action: "accept", disabled: false };
    case "friends":
      return { label: "Friends", action: "none", disabled: true };
    case "none":
    default:
      return { label: "Add friend", action: "send", disabled: false };
  }
}

/** A human-readable headline for a feed event, e.g. "finished Hollow Knight". The
 *  actor's name is rendered separately by the UI, so this is the predicate only. */
export function activityHeadline(e: Pick<ActivityEvent, "kind" | "gameTitle">): string {
  const title = e.gameTitle ?? "a game";
  switch (e.kind) {
    case "game_imported":
      return `imported ${title} from the Wishlist`;
    case "family_created":
      return `started a Game Family with ${title}`;
    case "bounty_claimed":
    default:
      return `finished ${title}`;
  }
}

/** The coin reward to surface on a feed event, or null when there's none to show.
 *  The server already strips the amount for friends who hide financial milestones,
 *  so this only formats whatever made it through. */
export function activityCoins(e: Pick<ActivityEvent, "detail">): number | null {
  const c = e.detail?.coins;
  return typeof c === "number" && c > 0 ? c : null;
}

/** Only a finished-game post can be "cheered" as a milestone in the UI sense — but
 *  the feed lets you cheer any kind, so this is just whether the Cheer affordance
 *  reads as a congratulation (finishes) vs. a generic nod. Used for button copy. */
export function isCongratulatoryEvent(e: Pick<ActivityEvent, "kind">): boolean {
  return e.kind === "bounty_claimed";
}

// --- Messaging -------------------------------------------------------------

/** Max message length, mirrored by the send_message RPC's server-side cap. */
export const MESSAGE_MAX = 4000;

/** Validate a message body before sending; null = OK, else an error string. */
export function validateMessageBody(body: string): string | null {
  const t = body.trim();
  if (!t) return "Message can’t be empty.";
  if (t.length > MESSAGE_MAX) return `Message is too long (max ${MESSAGE_MAX} characters).`;
  return null;
}
