// Subscriptions: the memberships a player pays for (PS Plus, Game Pass…),
// judged for value the way a purchase is by "Money Well Spent" (lib/valueMetrics).
//
// A subscription row is one paid PLAN — provider, price, cadence, the day it
// started and (once cancelled or upgraded) the day it ended. Every plan for the
// same provider forms a MEMBERSHIP, the unit the value verdict judges. Games
// link to a membership purely through their copies: a subscription copy whose
// provider matches counts its hours toward it, and an owned copy whose
// member-discount provider matches counts its savings.
//
// Services can nest (tier ladders — lib/taxonomy DEFAULT_SERVICE_TIERS, the
// services table's tier_group/tier_rank): a membership on one rung covers
// copies tagged with the same or a lower rung, and every plan on one ladder
// forms a single membership, so an Extra → Premium upgrade reads as one
// history. Standalone services match by exact name only.
//
// Renewal periods are never stored. They're derived here from the start date
// and cadence, so games added, hours played and discounts earned bucket into
// "this period" on the fly — and editing a start date re-buckets everything at
// once, exactly like changing the target rate re-judges every Well Spent card.
//
// Everything below is pure (no React, no Supabase) so it's unit-tested offline.

import type { Game, GameCopy } from "../types";
import { isModifierAcquisition, nonDlcCopies } from "./copies";
import { hasValueTarget } from "./valueMetrics";
import type { ServiceTierMap } from "./taxonomy";

export type SubscriptionCadence = "monthly" | "yearly";

export interface Subscription {
  id: string;
  /** The service name — the join key to copy providers (matched via providerKey). */
  provider: string;
  /** USD charged per renewal period. */
  price: number;
  cadence: SubscriptionCadence;
  /** ISO date (YYYY-MM-DD) the plan started — the first period's first day. */
  startedOn: string;
  /** ISO date the plan ended (cancelled/upgraded); null while it renews. */
  endedOn: string | null;
  note: string;
}

export const CADENCES: { value: SubscriptionCadence; label: string; per: string }[] = [
  { value: "monthly", label: "Monthly", per: "month" },
  { value: "yearly", label: "Yearly", per: "year" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a well-formed YYYY-MM-DD string that names a real calendar day. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Coerce a subscriptions row from PostgREST (numerics arrive as strings). */
export function coerceSubscription(row: Record<string, unknown>): Subscription | null {
  if (typeof row.id !== "string" || typeof row.provider !== "string") return null;
  const provider = row.provider.trim();
  if (!provider) return null;
  const price = typeof row.price === "number" ? row.price : Number(row.price);
  if (!Number.isFinite(price) || price < 0) return null;
  if (row.cadence !== "monthly" && row.cadence !== "yearly") return null;
  if (!isIsoDate(row.started_on)) return null;
  const endedOn = isIsoDate(row.ended_on) ? row.ended_on : null;
  return {
    id: row.id,
    provider,
    price,
    cadence: row.cadence,
    startedOn: row.started_on,
    endedOn,
    note: typeof row.note === "string" ? row.note : "",
  };
}

/** The case-insensitive, whitespace-trimmed identity of a provider label — the
 *  key that links copies to a membership (and that the whole-service lapse
 *  sweep matches on). */
export function providerKey(provider: string | null | undefined): string {
  return (provider ?? "").trim().toLowerCase();
}

/** Whether a plan on `memberProvider` covers a copy tagged `copyProvider`:
 *  the same service, or a rung at or below it on the same tier ladder. */
export function providerCovers(
  memberProvider: string,
  copyProvider: string | null | undefined,
  tiers: ServiceTierMap,
): boolean {
  const mk = providerKey(memberProvider);
  const ck = providerKey(copyProvider);
  if (!mk || !ck) return false;
  if (mk === ck) return true;
  const mt = tiers[mk];
  const ct = tiers[ck];
  return !!mt && !!ct && mt.group === ct.group && ct.rank <= mt.rank;
}

/** A predicate over copy providers — what a membership (or a single service)
 *  covers. */
export type ProviderMatch = (provider: string | null | undefined) => boolean;

/** Exact-name coverage for one service (no ladder). */
export function exactProvider(provider: string): ProviderMatch {
  const key = providerKey(provider);
  return (p) => providerKey(p) === key;
}

/** True when any tracked plan covers the provider — the "is this service
 *  already tracked?" check behind the copy editor's set-it-up prompt. */
export function providerTracked(
  provider: string | null | undefined,
  subs: Subscription[],
  tiers: ServiceTierMap,
): boolean {
  return subs.some((s) => providerCovers(s.provider, provider, tiers));
}

/** The membership a plan belongs to: its ladder when the service sits on
 *  one ("ladder:playstation plus"), else the service itself. */
export function membershipKeyOf(provider: string, tiers: ServiceTierMap): string {
  const key = providerKey(provider);
  const tier = tiers[key];
  return tier ? `ladder:${tier.group.trim().toLowerCase()}` : key;
}

// ── Calendar arithmetic (ISO date strings, no Date-object timezone drift) ────

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The local calendar date of a timestamp as YYYY-MM-DD. Sessions are bucketed
 *  by the day the player logged them, in their own timezone. */
export function localIsoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Add `n` cadence units to an ISO date, clamping the day to the target month
 *  (a plan started Jan 31 renews Feb 28/29, then Mar 31 again — anchored to the
 *  ORIGINAL day, never drifting earlier for good). */
export function addCadence(iso: string, cadence: SubscriptionCadence, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = cadence === "monthly" ? n : n * 12;
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}-${pad2(Math.min(d, daysInMonth(ny, nm)))}`;
}

/** Whole days from `a` to `b` (ISO dates; negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

// ── Renewal periods ─────────────────────────────────────────────────────────

export interface RenewalPeriod {
  /** 0 for the first period, counting up. */
  index: number;
  /** First day (inclusive) — the day this period was paid for. */
  start: string;
  /** First day of the NEXT period (exclusive). */
  end: string;
  /** USD paid for this period. */
  price: number;
  /** True for the period containing `today`. */
  current: boolean;
}

/** Every period of a plan that has STARTED by `today` (oldest first): paid
 *  up-front on its first day, so it counts toward cost the moment it begins.
 *  A plan ending inside a period keeps that period (it was paid for); a plan
 *  that hasn't started yet has none. */
export function periodsOf(sub: Subscription, today: string): RenewalPeriod[] {
  const out: RenewalPeriod[] = [];
  for (let i = 0; ; i++) {
    const start = addCadence(sub.startedOn, sub.cadence, i);
    if (start > today) break;
    // A cancelled plan stops accruing once its end date has passed — but the
    // period that end date falls in was already paid, so it stays.
    if (sub.endedOn != null && start >= sub.endedOn && i > 0) break;
    const end = addCadence(sub.startedOn, sub.cadence, i + 1);
    out.push({ index: i, start, end, price: sub.price, current: today >= start && today < end });
  }
  return out;
}

/** True while the plan is still running on `today` (started, not ended). */
export function isPlanActive(sub: Subscription, today: string): boolean {
  return sub.startedOn <= today && (sub.endedOn == null || sub.endedOn > today);
}

/** The day the plan next renews, or null once it's ended (or is set to end
 *  before its next renewal — the player cancelled). */
export function nextRenewal(sub: Subscription, today: string): string | null {
  if (!isPlanActive(sub, today)) return null;
  const periods = periodsOf(sub, today);
  const next = periods.length > 0 ? periods[periods.length - 1].end : sub.startedOn;
  if (sub.endedOn != null && next >= sub.endedOn) return null;
  return next;
}

/** USD paid on the plan so far: one price per started period. */
export function costToDate(sub: Subscription, today: string): number {
  return periodsOf(sub, today).length * sub.price;
}

// ── Memberships (all plans for one provider) ────────────────────────────────

export interface Membership {
  /** Ladder key for tiered services, else the provider key. */
  key: string;
  /** Display label: the running plan's service (highest rung when several
   *  run), else the most recent plan's. */
  provider: string;
  /** Whether a copy tagged with `provider` rides on this membership: any
   *  plan's service, or a lower rung of its ladder. */
  covers: ProviderMatch;
  /** Newest first (by start date). */
  plans: Subscription[];
  /** True while any plan is running. */
  active: boolean;
  /** Every started period across every plan, oldest first. */
  periods: RenewalPeriod[];
  /** USD paid across all plans so far. */
  paid: number;
  /** The next renewal across active plans, or null. */
  nextRenewal: string | null;
  /** The running plan (the newest active one), or null once cancelled. */
  activePlan: Subscription | null;
}

function byStartDesc(a: Subscription, b: Subscription): number {
  return b.startedOn.localeCompare(a.startedOn) || a.id.localeCompare(b.id);
}

/** Group plans into memberships — one per tier ladder, or per standalone
 *  service. Active memberships first, then by most recent start. */
export function groupMemberships(
  subs: Subscription[],
  today: string,
  tiers: ServiceTierMap = {},
): Membership[] {
  const byKey = new Map<string, Subscription[]>();
  for (const s of subs) {
    if (!providerKey(s.provider)) continue;
    const key = membershipKeyOf(s.provider, tiers);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(s);
  }
  const rankOf = (p: Subscription) => tiers[providerKey(p.provider)]?.rank ?? 0;
  const out: Membership[] = [];
  for (const [key, list] of byKey) {
    const plans = [...list].sort(byStartDesc);
    const periods = plans
      .flatMap((p) => periodsOf(p, today))
      .sort((a, b) => a.start.localeCompare(b.start));
    const active = plans.filter((p) => isPlanActive(p, today));
    const renewals = active.map((p) => nextRenewal(p, today)).filter((d): d is string => d != null);
    // The running plan names the membership; on a ladder, the highest rung.
    const face = [...active].sort((a, b) => rankOf(b) - rankOf(a))[0] ?? plans[0];
    const providers = [...new Set(plans.map((p) => p.provider))];
    out.push({
      key,
      provider: face.provider.trim(),
      covers: (p) => providers.some((mp) => providerCovers(mp, p, tiers)),
      plans,
      active: active.length > 0,
      periods,
      paid: periods.reduce((sum, p) => sum + p.price, 0),
      nextRenewal: renewals.length > 0 ? renewals.sort()[0] : null,
      activePlan: active[0] ?? null,
    });
  }
  return out.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      b.plans[0].startedOn.localeCompare(a.plans[0].startedOn) ||
      a.provider.localeCompare(b.provider),
  );
}

// ── Linking games to a membership ───────────────────────────────────────────

/** The game's subscription copies that the membership covers. */
export function subscriptionCopiesFor(game: Game, covers: ProviderMatch): GameCopy[] {
  return nonDlcCopies(game.copies).filter(
    (c) => c.acquisition === "subscription" && covers(c.provider),
  );
}

/** True when a subscription copy of the game rides on this membership. */
export function isLinkedGame(game: Game, covers: ProviderMatch): boolean {
  return subscriptionCopiesFor(game, covers).length > 0;
}

/** USD the membership's discounts saved on the game's purchased copies. */
export function memberSavingsOf(game: Game, covers: ProviderMatch): number {
  return (game.copies ?? []).reduce(
    (sum, c) =>
      sum +
      (c.memberSavings != null && c.memberSavings > 0 && covers(c.savingsProvider)
        ? c.memberSavings
        : 0),
    0,
  );
}

/** USD saved through member discounts across every copy, any provider — the
 *  Master Ledger's "saved with memberships" figure. */
export function totalMemberSavings(copies: GameCopy[] | undefined): number {
  return (copies ?? []).reduce(
    (sum, c) => sum + (c.memberSavings != null && c.memberSavings > 0 ? c.memberSavings : 0),
    0,
  );
}

/** True when the game has an owned (non-modifier, non-DLC) copy on `platform`
 *  — or on any platform when the session couldn't be attributed. Such a copy
 *  competes with the subscription copy for the game's hours. */
function hasOwnedCopyOn(game: Game, platform: string | null): boolean {
  return nonDlcCopies(game.copies).some(
    (c) => !isModifierAcquisition(c.acquisition) && (platform == null || c.platform === platform),
  );
}

/** One logged play session, as fetched for membership attribution. `live` is
 *  false for the one-time backfill lump (no real timestamp — all-time only). */
export interface MembershipSession {
  gameId: string;
  platform: string | null;
  hours: number;
  createdAt: number;
  live: boolean;
}

/** True when a plan of the membership was running on `day`. */
function coveredOn(m: Membership, day: string): boolean {
  return m.plans.some((p) => p.startedOn <= day && (p.endedOn == null || p.endedOn > day));
}

/** Whether a session on a linked game counts toward the membership:
 *  - logged on a platform the membership's copy covers (unattributed sessions
 *    pass — they can't be pinned anywhere);
 *  - when the game is ALSO owned outright on that platform, only sessions
 *    logged while the membership was running and the copy hadn't lapsed — the
 *    rest belong to the purchase. A subscription-only game counts everything:
 *    there was no other way to play it. */
export function sessionCounts(game: Game, m: Membership, s: MembershipSession): boolean {
  const copies = subscriptionCopiesFor(game, m.covers);
  if (copies.length === 0) return false;
  if (s.platform != null && !copies.some((c) => c.platform === s.platform)) return false;
  if (!hasOwnedCopyOn(game, s.platform)) return true;
  if (!s.live) return false; // a dateless lump can't be split — the purchase keeps it
  const day = localIsoDate(s.createdAt);
  if (!coveredOn(m, day)) return false;
  const copy = copies.find((c) => s.platform == null || c.platform === s.platform);
  return !copy?.lapsedAt || localIsoDate(Date.parse(copy.lapsedAt)) >= day;
}

// ── The membership report ───────────────────────────────────────────────────

export interface LinkedGameRow {
  game: Game;
  /** The service the linked copy actually names, when it's a different rung
   *  of the membership's ladder ("PlayStation Plus Essential" under a
   *  Premium membership); null when it's the membership's own service. */
  via: string | null;
  /** Hours counted toward the membership (all-time). */
  hours: number;
  /** USD this membership's discount saved on the game's purchase. */
  savings: number;
  /** ISO date of the most recent counted live session, or null. */
  lastPlayed: string | null;
}

export interface PeriodRow {
  period: RenewalPeriod;
  /** Live hours logged on linked games during the period. */
  hours: number;
  /** Linked games first added during the period. */
  added: Game[];
  /** Member savings on games added during the period. */
  savings: number;
  /** hours × target, or null without a target. */
  valuePlayed: number | null;
  /** True once value played plus savings reach the period's price (null = no target). */
  met: boolean | null;
}

/** The value verdict for a whole membership, judged like Well Spent but with
 *  member discounts counted as value too (they're real dollars). */
export interface MembershipVerdict {
  /** USD paid so far (every started period). */
  paid: number;
  hours: number;
  savings: number;
  /** hours × target. */
  valuePlayed: number;
  /** valuePlayed + savings — what the membership has given back. */
  valueDelivered: number;
  met: boolean;
  /** Hours still to log before the goal is met (0 once it is). */
  remainingHours: number;
  /** Net cost per hour: (paid − savings) ÷ hours, floored at $0 (null while unplayed). */
  costPerHour: number | null;
}

export function membershipVerdict(
  paid: number,
  hours: number,
  savings: number,
  target: number | null | undefined,
): MembershipVerdict | null {
  if (!hasValueTarget(target)) return null;
  const h = Math.max(0, hours || 0);
  const s = Math.max(0, savings || 0);
  const valuePlayed = h * target;
  const valueDelivered = valuePlayed + s;
  const net = Math.max(0, paid - s);
  return {
    paid,
    hours: h,
    savings: s,
    valuePlayed,
    valueDelivered,
    met: paid > 0 ? valueDelivered >= paid : false,
    remainingHours: Math.max(0, net / target - h),
    costPerHour: h > 0 ? net / h : null,
  };
}

export interface MembershipReport {
  membership: Membership;
  /** Linked games, most-played first (never-played last, by title). */
  games: LinkedGameRow[];
  /** Newest period first. */
  periods: PeriodRow[];
  /** Total hours counted (live + backfill) across linked games. */
  hours: number;
  /** Hours counted that fall outside every period (backfill lumps, sessions
   *  logged before the first plan started). Part of `hours`. */
  untrackedHours: number;
  /** Member savings across every linked purchase. */
  savings: number;
  /** Games linked via a subscription copy but never played. */
  neverPlayed: number;
  verdict: MembershipVerdict | null;
}

function periodContaining(periods: RenewalPeriod[], day: string): RenewalPeriod | undefined {
  return periods.find((p) => day >= p.start && day < p.end);
}

/** Build the full report for one membership from the library, the player's
 *  logged sessions (any game — filtered here) and their target rate. */
export function membershipReport(
  m: Membership,
  games: Game[],
  sessions: MembershipSession[],
  target: number | null | undefined,
  today: string,
): MembershipReport {
  const linked = games.filter((g) => g.status !== "wishlist" && isLinkedGame(g, m.covers));
  const discounted = games.filter(
    (g) =>
      g.status !== "wishlist" && !isLinkedGame(g, m.covers) && memberSavingsOf(g, m.covers) > 0,
  );
  const ownKey = providerKey(m.provider);
  const viaOf = (g: Game): string | null => {
    const copy = subscriptionCopiesFor(g, m.covers).find((c) => providerKey(c.provider) !== ownKey);
    return copy?.provider?.trim() || null;
  };
  const byId = new Map(linked.map((g) => [g.id, g]));

  const hoursByGame = new Map<string, number>();
  const lastByGame = new Map<string, string>();
  const periodHours = new Map<number, number>();
  let hours = 0;
  let untrackedHours = 0;
  for (const s of sessions) {
    const game = byId.get(s.gameId);
    // Negative rows are corrections (an edit that lowered a total) and count
    // against the bucket they were made in, like every other windowed stat.
    if (!game || !s.hours || !sessionCounts(game, m, s)) continue;
    hours += s.hours;
    hoursByGame.set(game.id, (hoursByGame.get(game.id) ?? 0) + s.hours);
    const day = s.live ? localIsoDate(s.createdAt) : null;
    const period = day != null ? periodContaining(m.periods, day) : undefined;
    if (period) {
      periodHours.set(period.index, (periodHours.get(period.index) ?? 0) + s.hours);
    } else {
      untrackedHours += s.hours;
    }
    if (day != null && (lastByGame.get(game.id) ?? "") < day) lastByGame.set(game.id, day);
  }

  const rows: LinkedGameRow[] = [...linked, ...discounted].map((game) => ({
    game,
    via: viaOf(game),
    hours: Math.max(0, hoursByGame.get(game.id) ?? 0),
    savings: memberSavingsOf(game, m.covers),
    lastPlayed: lastByGame.get(game.id) ?? null,
  }));
  rows.sort(
    (a, b) =>
      b.hours - a.hours || b.savings - a.savings || a.game.title.localeCompare(b.game.title),
  );

  const savings = rows.reduce((sum, r) => sum + r.savings, 0);
  const periods: PeriodRow[] = m.periods
    .map((period) => {
      const added = rows
        .map((r) => r.game)
        .filter((g) => {
          const day = localIsoDate(g.addedAt);
          return day >= period.start && day < period.end;
        });
      const periodSavings = added.reduce((sum, g) => sum + memberSavingsOf(g, m.covers), 0);
      const h = Math.max(0, periodHours.get(period.index) ?? 0);
      const valuePlayed = hasValueTarget(target) ? h * target : null;
      return {
        period,
        hours: h,
        added,
        savings: periodSavings,
        valuePlayed,
        met: valuePlayed == null ? null : valuePlayed + periodSavings >= period.price,
      };
    })
    .reverse();

  return {
    membership: m,
    games: rows,
    periods,
    hours: Math.max(0, hours),
    untrackedHours: Math.max(0, untrackedHours),
    savings,
    neverPlayed: rows.filter((r) => isLinkedGame(r.game, m.covers) && r.hours === 0).length,
    verdict: membershipVerdict(m.paid, hours, savings, target),
  };
}

/** The Master Ledger's membership rollup: what every membership has cost so
 *  far, the hours they delivered, and the discounts they earned. Judged
 *  memberships (a target set, something paid) count toward "well spent". */
export interface MembershipFinancials {
  paid: number;
  hours: number;
  savings: number;
  /** (paid − savings) ÷ hours, floored at $0; null until there's both. */
  costPerHour: number | null;
  wellSpent: number;
  judged: number;
}

export function membershipFinancials(reports: MembershipReport[]): MembershipFinancials {
  let paid = 0;
  let hours = 0;
  let savings = 0;
  let wellSpent = 0;
  let judged = 0;
  for (const r of reports) {
    paid += r.membership.paid;
    hours += r.hours;
    savings += r.savings;
    if (r.verdict && r.verdict.paid > 0) {
      judged++;
      if (r.verdict.met) wellSpent++;
    }
  }
  const net = Math.max(0, paid - savings);
  return {
    paid,
    hours,
    savings,
    costPerHour: paid > 0 && hours > 0 ? net / hours : null,
    wellSpent,
    judged,
  };
}

/** "Renews Oct 3 · in 28 days" / "Renews today" / "Renewed yesterday"-style
 *  phrasing for the membership card. */
export function renewalPhrase(nextRenewalIso: string | null, today: string): string | null {
  if (nextRenewalIso == null) return null;
  const days = daysBetween(today, nextRenewalIso);
  const date = formatIsoDate(nextRenewalIso);
  if (days <= 0) return `Renews ${date} (today)`;
  if (days === 1) return `Renews ${date} (tomorrow)`;
  return `Renews ${date} (in ${days} days)`;
}

/** Midnight UTC of an ISO date — a Date safe to format with timeZone: "UTC". */
function utcOf(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtUtc(dt: Date, year: boolean): string {
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** "Sep 5, 2026" for an ISO date, without timezone drift. */
export function formatIsoDate(iso: string): string {
  return fmtUtc(utcOf(iso), true);
}

/** "Sep 5 – Oct 4, 2026" for a period (end shown inclusive; the start keeps
 *  its year only when it differs). */
export function formatPeriod(p: RenewalPeriod): string {
  const start = utcOf(p.start);
  const lastDay = new Date(utcOf(p.end).getTime() - 86_400_000);
  const sameYear = start.getUTCFullYear() === lastDay.getUTCFullYear();
  return `${fmtUtc(start, !sameYear)} – ${fmtUtc(lastDay, true)}`;
}
