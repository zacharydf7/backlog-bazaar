// Sponsorships ("Back a Game"): stake coins on a friend's backlog game; the
// stake pays out on top of their bounty when they finish it, or returns to
// you at expiry. All money movement is server-side (sponsor_game RPC + the
// settle/refund triggers in supabase/schema.sql); this module holds the pure
// coercion, validation and presentation rules so they're unit-tested offline.

/** Server defaults for the admin-tunable knobs (app_config mirrors). */
export const SPONSOR_DEFAULTS = {
  maxStake: 50,
  monthlyPairCap: 100,
  expiryDays: 60,
};

export type SponsorshipStatus = "active" | "paid" | "expired" | "refunded";

/** One stake, either direction, as list_my_sponsorships returns it. */
export interface Sponsorship {
  id: string;
  sponsor: string;
  recipient: string;
  sponsorName: string;
  recipientName: string;
  gameId: string | null; // null once the game row was deleted
  gameTitle: string;
  amount: number;
  status: SponsorshipStatus;
  createdAt: number; // ms epoch
  expiresAt: number;
  resolvedAt: number | null;
}

const STATUSES: SponsorshipStatus[] = ["active", "paid", "expired", "refunded"];

/** Coerce one RPC row, dropping malformed entries. */
export function coerceSponsorship(row: Record<string, unknown>): Sponsorship | null {
  if (
    typeof row.id !== "string" ||
    typeof row.sponsor !== "string" ||
    typeof row.recipient !== "string"
  ) {
    return null;
  }
  const amount = typeof row.amount === "number" ? Math.round(row.amount) : 0;
  if (amount <= 0) return null;
  return {
    id: row.id,
    sponsor: row.sponsor,
    recipient: row.recipient,
    sponsorName:
      typeof row.sponsor_name === "string" && row.sponsor_name.trim()
        ? row.sponsor_name
        : "A friend",
    recipientName:
      typeof row.recipient_name === "string" && row.recipient_name.trim()
        ? row.recipient_name
        : "A friend",
    gameId: typeof row.game_id === "string" ? row.game_id : null,
    gameTitle: typeof row.game_title === "string" ? row.game_title : "a game",
    amount,
    status: STATUSES.includes(row.status as SponsorshipStatus)
      ? (row.status as SponsorshipStatus)
      : "active",
    createdAt: typeof row.created_at === "string" ? Date.parse(row.created_at) : 0,
    expiresAt: typeof row.expires_at === "string" ? Date.parse(row.expires_at) : 0,
    resolvedAt: typeof row.resolved_at === "string" ? Date.parse(row.resolved_at) : null,
  };
}

/** The active stakes backing one game (the "Backed" chip's data). */
export function activeBackersFor(rows: Sponsorship[], gameId: string): Sponsorship[] {
  return rows.filter((s) => s.status === "active" && s.gameId === gameId);
}

/** The viewer's own active stake on a game, if any (one per game by rule). */
export function myActiveStakeOn(
  rows: Sponsorship[],
  sponsorId: string,
  gameId: string,
): Sponsorship | null {
  return (
    rows.find((s) => s.status === "active" && s.sponsor === sponsorId && s.gameId === gameId) ??
    null
  );
}

/** Coins counted against the sponsor→recipient monthly budget: everything
 *  still escrowed to that friend plus stakes that actually PAID OUT this
 *  calendar month (refunds and expiries give the room back). Client mirror of
 *  the sponsor_game guard, for the modal's live allowance hint. */
export function pairBudgetUsed(
  rows: Sponsorship[],
  sponsorId: string,
  recipientId: string,
  now: number = Date.now(),
): number {
  const d = new Date(now);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return rows
    .filter((s) => s.sponsor === sponsorId && s.recipient === recipientId)
    .filter(
      (s) =>
        s.status === "active" ||
        (s.status === "paid" && s.resolvedAt != null && s.resolvedAt >= monthStart),
    )
    .reduce((sum, s) => sum + s.amount, 0);
}

/** Validate a stake before sending; null = OK, else the error to show. The
 *  server re-checks everything — this only saves a round trip. */
export function validateStake(
  amount: number,
  opts: { maxStake: number; balance: number; pairUsed: number; pairCap: number },
): string | null {
  if (!Number.isFinite(amount) || Math.round(amount) !== amount || amount < 1) {
    return "Stake a whole number of coins (at least 1).";
  }
  if (amount > opts.maxStake) return `The maximum stake is ${opts.maxStake} coins.`;
  if (amount > opts.balance) return "You don't have that many coins.";
  if (opts.pairUsed + amount > opts.pairCap) {
    const room = Math.max(0, opts.pairCap - opts.pairUsed);
    return room > 0
      ? `Only ${room} more coins fit this friend's monthly backing limit.`
      : "You've reached this friend's monthly backing limit.";
  }
  return null;
}

/** Total coins currently staked across a set of backers. */
export function totalStaked(backers: Sponsorship[]): number {
  return backers.reduce((sum, s) => sum + s.amount, 0);
}

/** The earliest expiry across active backers (ms epoch), or null when none. */
export function soonestExpiry(backers: Sponsorship[]): number | null {
  if (backers.length === 0) return null;
  return backers.reduce((min, s) => Math.min(min, s.expiresAt), Infinity);
}

/** A compact countdown for a stake's expiry: "12d left", "expires today";
 *  "expired" once passed (the sweep will collect it shortly). */
export function expiryLabel(expiresAt: number, now: number = Date.now()): string {
  const msLeft = expiresAt - now;
  if (msLeft <= 0) return "expired";
  const days = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  return days <= 1 ? "expires today" : `${days}d left`;
}

/** The "Backed" chip's tooltip line, e.g.
 *  "Backed by Sarah (30) and Ben (10) — 40 bonus coins if you finish. Soonest stake: 12d left." */
export function backersTooltip(backers: Sponsorship[], now: number = Date.now()): string {
  if (backers.length === 0) return "";
  const names = backers.map((s) => `${s.sponsorName} (${s.amount})`);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const soonest = soonestExpiry(backers);
  return (
    `Backed by ${list} — ${totalStaked(backers)} bonus coins if you finish.` +
    (soonest ? ` Soonest stake: ${expiryLabel(soonest, now)}.` : "")
  );
}
