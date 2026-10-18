// Coin events: admin-run, time-limited boosts (a double bounty weekend, bonus
// Daily Session coins, boosted challenge and medal rewards, cheaper starts),
// optionally aimed at genres, lengths, named platforms or "off your main
// platform", run once or on a schedule (weekly, monthly, or a monthly pattern
// like the 1st to 7th or the 3rd weekend). An event with no boost is a
// calendar note, like a holiday week. The server applies every boost (see the
// Coin events section of
// supabase/schema.sql); this module coerces the event lists and words them
// for the board banner and the admin page, unit-tested without React.

export interface BonusEventTargets {
  genres: string[];
  platforms: string[];
  offMainPlatform: boolean;
  minHours: number | null;
  maxHours: number | null;
}

export interface BonusEventBoosts {
  bountyMult: number;
  sessionMult: number;
  rewardsMult: number;
  startDiscountPct: number;
  /** Discounted starts per player per run; null = no limit. */
  discountLimit: number | null;
}

export type BonusEventRepeat = "weekly" | "monthly" | "month_days" | "month_weekend";

/** How an event repeats. month_days runs from day repeatFrom to repeatTo of
 *  each month (negative counts back from the month's end: -7..-1 is the last
 *  7 days); month_weekend runs the repeatWeek-th weekend (-1 = last). */
export interface BonusEventSchedule {
  repeat: BonusEventRepeat | null;
  repeatUntil: number | null;
  repeatFrom: number | null;
  repeatTo: number | null;
  repeatWeek: number | null;
}

/** One run of a repeating event, as the admin list shows the next few. */
export interface BonusEventRun {
  start: number;
  end: number;
  skipped: boolean;
}

/** A running or upcoming event, as the player sees it. For a repeating
 *  event, the times are this run's (or the next run's). */
export interface BonusEvent extends BonusEventBoosts, BonusEventTargets {
  id: string;
  name: string;
  description: string;
  startsAt: number;
  endsAt: number;
  repeat: BonusEventRepeat | null;
  /** How to get ready for it ("" when none). */
  prepTip: string;
  playerCap: number | null;
  capUsed: number;
  /** Discounted starts used this run. */
  discountUsed: number;
}

/** An event as the admin list shows it (archived included). startsAt/endsAt
 *  are the first run; nextStart/nextEnd the running or next one (null once
 *  it's over for good). */
export interface AdminBonusEvent extends BonusEventBoosts, BonusEventTargets, BonusEventSchedule {
  id: string;
  name: string;
  description: string;
  prepTip: string;
  startsAt: number;
  endsAt: number;
  /** The next few runs of a repeating event, skipped ones included. */
  runs: BonusEventRun[];
  nextStart: number | null;
  nextEnd: number | null;
  live: boolean;
  playerCap: number | null;
  archivedAt: number | null;
  paidCoins: number;
  players: number;
}

/** The admin form's values; `id` null creates a new event. */
export interface BonusEventDraft extends BonusEventBoosts, BonusEventTargets, BonusEventSchedule {
  id: string | null;
  name: string;
  description: string;
  prepTip: string;
  /** For a monthly pattern, when the series may begin (the end is worked out). */
  startsAt: number;
  endsAt: number;
  playerCap: number | null;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function maybeNum(v: unknown): number | null {
  if (v == null) return null;
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
}

function time(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

function rows(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => !!r && typeof r === "object") : [];
}

function repeatOf(v: unknown): BonusEventRepeat | null {
  return v === "weekly" || v === "monthly" || v === "month_days" || v === "month_weekend" ? v : null;
}

/** An event row's boosts (also read by the calendar feed). */
export function coerceBoosts(r: Record<string, unknown>): BonusEventBoosts {
  return {
    bountyMult: num(r.bounty_mult, 1),
    sessionMult: num(r.session_mult, 1),
    rewardsMult: num(r.rewards_mult, 1),
    startDiscountPct: num(r.start_discount_pct),
    discountLimit: maybeNum(r.discount_limit),
  };
}

/** An event row's game targets (also read by the calendar feed). */
export function coerceTargets(r: Record<string, unknown>): BonusEventTargets {
  return {
    genres: strings(r.genres),
    platforms: strings(r.platforms),
    offMainPlatform: r.off_main_platform === true,
    minHours: maybeNum(r.min_hours),
    maxHours: maybeNum(r.max_hours),
  };
}

function common(r: Record<string, unknown>) {
  return {
    id: typeof r.id === "string" ? r.id : "",
    name: typeof r.name === "string" ? r.name : "",
    description: typeof r.description === "string" ? r.description : "",
    startsAt: time(r.starts_at) ?? 0,
    endsAt: time(r.ends_at) ?? 0,
    repeat: repeatOf(r.repeat),
    prepTip: typeof r.prep_tip === "string" ? r.prep_tip : "",
    ...coerceBoosts(r),
    ...coerceTargets(r),
    playerCap: maybeNum(r.player_cap),
  };
}

export function coerceBonusEvents(raw: unknown): BonusEvent[] {
  return rows(raw)
    .map((r) => ({ ...common(r), capUsed: num(r.cap_used), discountUsed: num(r.discount_used) }))
    .filter((e) => e.id);
}

export function coerceAdminBonusEvents(raw: unknown): AdminBonusEvent[] {
  return rows(raw)
    .map((r) => ({
      ...common(r),
      repeatUntil: time(r.repeat_until),
      repeatFrom: maybeNum(r.repeat_from),
      repeatTo: maybeNum(r.repeat_to),
      repeatWeek: maybeNum(r.repeat_week),
      runs: rows(r.runs)
        .map((x) => ({ start: time(x.start) ?? 0, end: time(x.end) ?? 0, skipped: x.skipped === true }))
        .filter((x) => x.start > 0),
      nextStart: time(r.next_start),
      nextEnd: time(r.next_end),
      live: r.live === true,
      archivedAt: time(r.archived_at),
      paidCoins: num(r.paid_coins),
      players: num(r.players),
    }))
    .filter((e) => e.id);
}

/** "×2" / "×1.5". */
export function times(m: number): string {
  return `×${Math.round(m * 100) / 100}`;
}

/** What an event boosts, one short phrase each. */
export function boostLabels(e: BonusEventBoosts): string[] {
  const out: string[] = [];
  if (e.bountyMult > 1) out.push(`Bounties ${times(e.bountyMult)}`);
  if (e.sessionMult > 1) out.push(`Play rewards ${times(e.sessionMult)}`);
  if (e.rewardsMult > 1) out.push(`Challenge & medal rewards ${times(e.rewardsMult)}`);
  if (e.startDiscountPct > 0) {
    const n = e.discountLimit;
    out.push(n == null ? `${e.startDiscountPct}% off starts` : `${e.startDiscountPct}% off ${n} ${n === 1 ? "start" : "starts"}`);
  }
  return out;
}

/** Which games an event is for, in words; null when it's for every game. */
export function targetLabel(e: BonusEventTargets): string | null {
  const parts: string[] = [];
  if (e.genres.length > 0) parts.push(e.genres.join(", "));
  if (e.minHours != null && e.maxHours != null) parts.push(`${e.minHours}–${e.maxHours}h games`);
  else if (e.minHours != null) parts.push(`games ${e.minHours}h+`);
  else if (e.maxHours != null) parts.push(`games up to ${e.maxHours}h`);
  if (e.platforms.length > 0) parts.push(`on ${e.platforms.join(" or ")}`);
  if (e.offMainPlatform) parts.push("off your main platform");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Does the event boost anything? (One without boosts is a calendar note.) */
export function hasBoost(e: BonusEventBoosts): boolean {
  return e.bountyMult > 1 || e.sessionMult > 1 || e.rewardsMult > 1 || e.startDiscountPct > 0;
}

/** Running now (false while it has yet to start). */
export function eventIsLive(e: Pick<BonusEvent, "startsAt" | "endsAt">, now: number): boolean {
  return e.startsAt <= now && now < e.endsAt;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Why a draft can't be saved yet, or null when it's ready (mirrors the
 *  bonus_events checks so the form explains instead of erroring). */
export function bonusEventDraftProblem(d: BonusEventDraft): string | null {
  if (!d.name.trim()) return "Give the event a name.";
  if (d.name.trim().length > 80) return "Keep the name to 80 characters.";
  if (d.description.length > 500) return "Keep the description to 500 characters.";
  if (d.prepTip.length > 200) return "Keep the prep tip to 200 characters.";
  const pattern = d.repeat === "month_days" || d.repeat === "month_weekend";
  if (!Number.isFinite(d.startsAt)) return pattern ? "Pick when the schedule starts." : "Pick a start and an end.";
  if (!pattern) {
    if (!Number.isFinite(d.endsAt)) return "Pick a start and an end.";
    if (d.endsAt <= d.startsAt) return "The end must come after the start.";
  }
  // (+1 hour: a run that spans a clock change is an hour longer in real time.)
  if (d.repeat === "weekly" && d.endsAt - d.startsAt > 7 * DAY + HOUR) return "A weekly event can run at most 7 days.";
  if (d.repeat === "monthly" && d.endsAt - d.startsAt > 28 * DAY + HOUR) return "A monthly event can run at most 28 days.";
  if (d.repeat === "month_days") {
    const f = d.repeatFrom;
    const t = d.repeatTo;
    const ok =
      f != null && t != null && Number.isInteger(f) && Number.isInteger(t) &&
      ((f >= 1 && f <= 28 && t >= f && t <= 28) || (f >= -28 && f <= -1 && t >= f && t <= -1));
    if (!ok) return "Pick days 1 to 28 of the month, or a number of days at the end.";
  }
  if (d.repeat === "month_weekend" && ![1, 2, 3, 4, -1].includes(d.repeatWeek ?? 0)) {
    return "Pick which weekend of the month.";
  }
  if (d.repeat && d.repeatUntil != null && d.repeatUntil <= d.startsAt) return "Stop repeating after the first run starts.";
  for (const m of [d.bountyMult, d.sessionMult, d.rewardsMult]) {
    if (!(m >= 1 && m <= 5)) return "Multipliers go from ×1 (off) to ×5.";
  }
  if (!(d.startDiscountPct >= 0 && d.startDiscountPct <= 90)) return "The start discount goes from 0% to 90%.";
  if (d.minHours != null && d.maxHours != null && d.minHours > d.maxHours) return "The shortest length is longer than the longest.";
  if (d.playerCap != null && !(d.playerCap > 0)) return "A cap must be more than 0 (or leave it empty).";
  if (d.discountLimit != null && !(Number.isInteger(d.discountLimit) && d.discountLimit > 0)) {
    return "Discounted starts must be a whole number above 0 (or leave it empty).";
  }
  return null;
}

/** When the next listed event starts or ends after `now` (null when none). */
export function nextEventBoundary(events: Pick<BonusEvent, "startsAt" | "endsAt">[], now: number): number | null {
  const times = events.flatMap((e) => [e.startsAt, e.endsAt]).filter((t) => t > now);
  return times.length > 0 ? Math.min(...times) : null;
}

/** "2 days" / "5h" until `at` (at least 1h). */
export function spanUntil(at: number, now: number): string {
  const ms = at - now;
  return ms < DAY ? `${Math.max(1, Math.ceil(ms / 3_600_000))}h` : `${Math.ceil(ms / DAY)} days`;
}

/** "Ends in 2 days" / "Starts in 5h": the banner's countdown for a run. */
export function eventWhenLabel(e: Pick<BonusEvent, "startsAt" | "endsAt">, now: number): string {
  const live = eventIsLive(e, now);
  return `${live ? "Ends" : "Starts"} in ${spanUntil(live ? e.endsAt : e.startsAt, now)}`;
}

/** "1st", "2nd", "3rd", "21st"... */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** "Every week until Dec 31", "The 1st to 7th of every month", "The 3rd
 *  weekend of every month", "The last 7 days of every month"; null for a
 *  one-off. */
export function repeatLabel(s: BonusEventSchedule): string | null {
  let every: string;
  switch (s.repeat) {
    case "weekly":
      every = "Every week";
      break;
    case "monthly":
      every = "Every month";
      break;
    case "month_days": {
      const f = s.repeatFrom ?? 1;
      const t = s.repeatTo ?? f;
      every =
        f < 0
          ? t === -1
            ? `The last ${-f} ${f === -1 ? "day" : "days"} of every month`
            : `Days ${-f} to ${-t} before the end of every month`
          : f === t
            ? `The ${ordinal(f)} of every month`
            : `The ${ordinal(f)} to ${ordinal(t)} of every month`;
      break;
    }
    case "month_weekend":
      every = s.repeatWeek === -1 ? "The last weekend of every month" : `The ${ordinal(s.repeatWeek ?? 1)} weekend of every month`;
      break;
    default:
      return null;
  }
  if (s.repeatUntil == null) return every;
  return `${every} until ${new Date(s.repeatUntil).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

/** What running events do for one of your games (my_bonus_event_perks). */
export interface BonusEventPerk {
  /** startsLeft: discounted starts left this run (null = no limit). */
  discount?: { event: string; pct: number; capLeft: number | null; startsLeft?: number | null };
  /** On a Bazaar game: what it would get if started and finished in time. */
  bounty?: { event: string; factor: number; capLeft: number | null };
  /** Play rewards (Daily Session coins, Rotation check-ins and milestones), on
   *  a Now Playing game. */
  session?: { event: string; factor: number; capLeft: number | null };
}

export function coerceBonusPerks(raw: unknown): Record<string, BonusEventPerk> {
  const out: Record<string, BonusEventPerk> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const d = r.discount as Record<string, unknown> | undefined;
    const b = r.bounty as Record<string, unknown> | undefined;
    const se = r.session as Record<string, unknown> | undefined;
    out[id] = {
      ...(d && typeof d.event === "string" && num(d.pct) > 0
        ? {
            discount: {
              event: d.event,
              pct: num(d.pct),
              capLeft: maybeNum(d.cap_left),
              startsLeft: maybeNum(d.starts_left),
            },
          }
        : {}),
      ...(b && typeof b.event === "string" && num(b.factor) > 1
        ? { bounty: { event: b.event, factor: num(b.factor), capLeft: maybeNum(b.cap_left) } }
        : {}),
      ...(se && typeof se.event === "string" && num(se.factor) > 1
        ? { session: { event: se.event, factor: num(se.factor), capLeft: maybeNum(se.cap_left) } }
        : {}),
    };
  }
  return out;
}

/** A start under an event discount, as bonus_event_discount prices it (the
 *  saving floors, and stops at the event's cap); null when none applies. */
export function eventStartPrice(
  price: number,
  perk: BonusEventPerk | undefined,
): { price: number; saving: number; event: string; pct: number } | null {
  const d = perk?.discount;
  if (!d || price <= 0) return null;
  let saving = Math.floor((price * d.pct) / 100);
  if (d.capLeft != null) saving = Math.min(saving, Math.max(0, d.capLeft));
  return saving > 0 ? { price: price - saving, saving, event: d.event, pct: d.pct } : null;
}

/** The extra an event bounty boost adds to what a finish pays right away (the
 *  held part isn't boosted), as bonus_event_pay computes it; 0 when none. */
export function eventFinishBonus(paidAtFinish: number, perk: BonusEventPerk | undefined): number {
  const b = perk?.bounty;
  if (!b || paidAtFinish <= 0) return 0;
  let extra = Math.floor(paidAtFinish * (b.factor - 1));
  if (b.capLeft != null) extra = Math.min(extra, Math.max(0, b.capLeft));
  return Math.max(0, extra);
}

/** The running event that boosts a reward tied to no game (the strongest with
 *  cap left, ties to the one ending first, as best_bonus_event picks), with its
 *  cap left; null when none. Any rewards boost covers goal and medal rewards;
 *  a play reward (a Regular week) takes only a play boost aimed at every game. */
export function boostWithoutGame(
  events: BonusEvent[],
  now: number,
  kind: "rewards" | "session",
): { event: string; mult: number; capLeft: number | null } | null {
  const mult = (e: BonusEvent) => (kind === "rewards" ? e.rewardsMult : e.sessionMult);
  const capLeft = (e: BonusEvent) => (e.playerCap != null ? Math.max(0, e.playerCap - e.capUsed) : null);
  const best = events
    .filter((e) => mult(e) > 1 && eventIsLive(e, now) && capLeft(e) !== 0)
    .filter((e) => kind === "rewards" || targetLabel(e) == null)
    .sort((a, b) => mult(b) - mult(a) || a.endsAt - b.endsAt)[0];
  return best ? { event: best.name, mult: mult(best), capLeft: capLeft(best) } : null;
}

/** What a `reward` pays under an event boost (the extra floors and stops at
 *  the cap, as bonus_event_pay adds it). */
export function boostedReward(reward: number, boost: { mult: number; capLeft: number | null } | null): number {
  if (!boost || reward <= 0) return reward;
  let extra = Math.floor(reward * (boost.mult - 1));
  if (boost.capLeft != null) extra = Math.min(extra, boost.capLeft);
  return reward + Math.max(0, extra);
}
