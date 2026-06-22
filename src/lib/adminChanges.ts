// Builds the human-readable message an admin's change sends to the affected user
// as a notification. Pure so it's unit-tested; the actual insert happens through
// the security-definer admin_notify RPC (the client can't write notifications).

/** The admin-managed fields whose changes are worth telling a user about. */
export interface UserChangeFields {
  coins: number;
  generalSlots: number;
  isAdmin: boolean;
  blocked: boolean;
}

/** One line per field that changed between `before` and `after` (empty if none). */
export function summarizeUserChanges(before: UserChangeFields, after: UserChangeFields): string[] {
  const lines: string[] = [];
  if (after.coins !== before.coins) {
    const delta = after.coins - before.coins;
    lines.push(`Coins: ${before.coins} → ${after.coins} (${delta >= 0 ? "+" : ""}${delta})`);
  }
  if (after.generalSlots !== before.generalSlots) {
    lines.push(`Now Playing slots: ${before.generalSlots} → ${after.generalSlots}`);
  }
  if (after.isAdmin !== before.isAdmin) {
    lines.push(after.isAdmin ? "You're now an admin." : "Your admin access was removed.");
  }
  if (after.blocked !== before.blocked) {
    lines.push(after.blocked ? "Your account was blocked." : "Your account was unblocked.");
  }
  return lines;
}

/** Append an admin's optional note/reason to a base message. */
export function appendNote(message: string, note?: string | null): string {
  const n = note?.trim();
  return n ? `${message}\nNote: ${n}` : message;
}

/** The notification body for a set of account changes plus an optional note, or
 *  null when nothing material changed (so we don't send an empty alert). A note
 *  on its own — with no actual change — is not worth a notification. */
export function buildChangeBody(lines: string[], note?: string | null): string | null {
  if (lines.length === 0) return null;
  return appendNote(lines.join("\n"), note);
}
