// Economy health (admin, economy.insights): the whole economy over a window,
// read server-side from the coin_events ledger (admin_economy_health). This
// module maps the payload and holds the pure summaries the dashboard draws.

export interface KindFlow {
  kind: string;
  coinsIn: number;
  coinsOut: number;
  events: number;
  players: number;
}

export interface DayFlow {
  /** ISO date (UTC), or a week's first day once bucketed. */
  day: string;
  coinsIn: number;
  coinsOut: number;
}

export interface PlayerFlow {
  userId: string;
  displayName: string;
  balance: number;
  earned: number;
  spent: number;
  topSource: string | null;
  clears: number;
}

export interface EconomyHealth {
  /** Coins held across every player right now. */
  circulation: number;
  byKind: KindFlow[];
  daily: DayFlow[];
  players: PlayerFlow[];
}

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export function toEconomyHealth(raw: unknown): EconomyHealth {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  return {
    circulation: n(r.circulation),
    byKind: list(r.by_kind).map((k) => ({
      kind: String(k.kind),
      coinsIn: n(k.coins_in),
      coinsOut: n(k.coins_out),
      events: n(k.events),
      players: n(k.players),
    })),
    daily: list(r.daily).map((d) => ({ day: String(d.day), coinsIn: n(d.coins_in), coinsOut: n(d.coins_out) })),
    players: list(r.players).map((p) => ({
      userId: String(p.user_id),
      displayName: typeof p.display_name === "string" ? p.display_name : "Unnamed player",
      balance: n(p.balance),
      earned: n(p.earned),
      spent: n(p.spent),
      topSource: typeof p.top_source === "string" ? p.top_source : null,
      clears: n(p.clears),
    })),
  };
}

/** Coins in and out across the window. Opening balances are starting stock,
 *  not earnings, so they stay out of both. */
export function economyTotals(h: EconomyHealth): { coinsIn: number; coinsOut: number; net: number } {
  let coinsIn = 0;
  let coinsOut = 0;
  for (const k of h.byKind) {
    if (k.kind === "opening") continue;
    coinsIn += k.coinsIn;
    coinsOut += k.coinsOut;
  }
  return { coinsIn, coinsOut, net: coinsIn - coinsOut };
}

/** The ledger kinds that paid coins out (sources) and took them in (sinks),
 *  biggest first — a kind that moved both ways appears in each. */
export function sourcesAndSinks(h: EconomyHealth): { sources: KindFlow[]; sinks: KindFlow[] } {
  const flows = h.byKind.filter((k) => k.kind !== "opening");
  return {
    sources: flows.filter((k) => k.coinsIn > 0).sort((a, b) => b.coinsIn - a.coinsIn),
    sinks: flows.filter((k) => k.coinsOut > 0).sort((a, b) => b.coinsOut - a.coinsOut),
  };
}

/** The daily series, folded into weeks when it's too long to draw a bar per
 *  day (each week keyed by its first day in the data). */
export function chartSeries(daily: DayFlow[], maxBars = 45): DayFlow[] {
  if (daily.length <= maxBars) return daily;
  const weeks = new Map<string, DayFlow>();
  for (const d of daily) {
    const date = new Date(`${d.day}T00:00:00Z`);
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const w = weeks.get(key);
    if (w) {
      w.coinsIn += d.coinsIn;
      w.coinsOut += d.coinsOut;
    } else {
      weeks.set(key, { day: key, coinsIn: d.coinsIn, coinsOut: d.coinsOut });
    }
  }
  return [...weeks.values()].sort((a, b) => a.day.localeCompare(b.day));
}
