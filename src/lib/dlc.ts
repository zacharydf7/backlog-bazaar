// DLC on a game (owner, 2026-10-17; public since 2026-10-18). Three kinds:
//
//   expansion  a story expansion with an ending (Ghost of Yotei's DLC). It's
//              played as an expansion RUN through the Replay lane: it costs
//              coins to start and pays a bounty on a clear, both from the
//              expansion formulas on its own length, cost and date.
//   update     new content for a game you keep playing (a Hearthstone card
//              set, a season): a dated record with an optional cost.
//   item       an item, cosmetic or currency: a purchase record.
//
// The server (save_game_dlc / start_expansion / finish_expansion in
// supabase/schema.sql) is authoritative for every coin amount; the helpers
// here mirror its rules for previews. Pure, so they're unit-tested.

import { DEFAULT_HOURS, computeFormula, normalizeFormula, type EconomyConfig, type FormulaConfig } from "./economy";

export type DlcKind = "expansion" | "update" | "item";
export type ExpansionRunStatus = "owned" | "playing" | "cleared";

export interface GameDlc {
  id: string;
  gameId: string | null;
  kind: DlcKind;
  name: string;
  /** ISO date it was bought or arrived. */
  acquiredOn: string | null;
  /** US dollars. */
  cost: number | null;
  /** An expansion's length; it prices and pays the run. */
  hours: number | null;
  note: string | null;
  runStatus: ExpansionRunStatus;
  runStartedAt: number | null;
  /** The game's played hours when the run started (its time counts from here). */
  runHoursStart: number | null;
  runPrice: number | null;
  /** Whether the run can pay: false for one started while the economy was off. */
  runPaying: boolean;
  /** What the run costs and pays, frozen when it started. */
  runQuote: ExpansionQuote | null;
  runClearedAt: number | null;
  runReward: number | null;
  createdAt: number;
}

export const DLC_KINDS: { kind: DlcKind; label: string; hint: string }[] = [
  {
    kind: "expansion",
    label: "Story expansion",
    hint: "New story with an ending. Play it for coins once you've finished the game.",
  },
  {
    kind: "update",
    label: "New content",
    hint: "A card set, season or big update for a game you keep playing.",
  },
  {
    kind: "item",
    label: "Item or currency",
    hint: "A cosmetic, pass, or in-game currency you bought.",
  },
];

export function dlcKindLabel(kind: DlcKind): string {
  return DLC_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/** The kind the Add DLC form starts on: a story expansion for a finished
 *  game, new content for one you keep playing. */
export function defaultDlcKind(game: { status: string; ongoing?: boolean; inRotation?: boolean }): DlcKind {
  return game.status === "finished" && !game.ongoing && !game.inRotation ? "expansion" : "update";
}

const KINDS = new Set<DlcKind>(["expansion", "update", "item"]);
const RUN_STATUSES = new Set<ExpansionRunStatus>(["owned", "playing", "cleared"]);

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function time(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function coerceQuote(v: unknown): ExpansionQuote | null {
  if (!v || typeof v !== "object") return null;
  const q = v as Record<string, unknown>;
  return {
    price: num(q.price) ?? 0,
    bounty: num(q.bounty) ?? 0,
    gateHours: num(q.gate_hours) ?? 0,
    paying: q.paying === true,
  };
}

/** game_dlc rows as GameDlc, oldest first; malformed rows dropped. */
export function coerceGameDlc(rows: unknown): GameDlc[] {
  if (!Array.isArray(rows)) return [];
  const out: GameDlc[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    if (!r || typeof r.id !== "string") continue;
    const kind = r.kind as DlcKind;
    const runStatus = r.run_status as ExpansionRunStatus;
    const name = text(r.name);
    if (!KINDS.has(kind) || !name) continue;
    out.push({
      id: r.id,
      gameId: typeof r.game_id === "string" ? r.game_id : null,
      kind,
      name,
      acquiredOn: text(r.acquired_on),
      cost: num(r.cost),
      hours: num(r.hours),
      note: text(r.note),
      runStatus: RUN_STATUSES.has(runStatus) ? runStatus : "owned",
      runStartedAt: time(r.run_started_at),
      runHoursStart: num(r.run_hours_start),
      runPrice: num(r.run_price),
      runPaying: r.run_paying === true,
      runQuote: coerceQuote(r.run_quote),
      runClearedAt: time(r.run_cleared_at),
      runReward: num(r.run_reward),
      createdAt: time(r.created_at) ?? 0,
    });
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

/** The admin's expansion settings: formulas left unset (null) follow the
 *  game formulas setting by setting. */
export interface ExpansionConfig {
  price: unknown;
  bounty: unknown;
  minHours: number;
  countsStreak: boolean;
}

// Streak counting starts off: adding an expansion, unlike a game, doesn't
// break the Clear Streak, so counting its clears would let free records pump it.
export const DEFAULT_EXPANSION_CONFIG: ExpansionConfig = { price: null, bounty: null, minHours: 2, countsStreak: false };

/** The expansion price and bounty formulas, each unset setting taken from the
 *  game formula (expansion_formulas in SQL). */
export function expansionFormulas(economy: EconomyConfig, cfg: Pick<ExpansionConfig, "price" | "bounty">): EconomyConfig {
  return {
    price: normalizeFormula(cfg.price, economy.price),
    bounty: normalizeFormula(cfg.bounty, economy.bounty),
  };
}

export interface ExpansionQuote {
  price: number;
  bounty: number;
  /** Logged hours a full payout needs. */
  gateHours: number;
  /** False below the minimum length: a free run that pays nothing. */
  paying: boolean;
}

/** When an expansion was acquired, for its fresh-pickup factor: the acquired
 *  day (UTC midnight), else when it was added. */
export function expansionAcquiredAt(dlc: Pick<GameDlc, "acquiredOn" | "createdAt">): number {
  const day = dlc.acquiredOn ? Date.parse(`${dlc.acquiredOn}T00:00:00Z`) : NaN;
  return Number.isFinite(day) ? day : dlc.createdAt;
}

function formulaFor(cfg: FormulaConfig, dlc: Pick<GameDlc, "name" | "hours" | "cost" | "acquiredOn" | "createdAt">, nowMs: number) {
  return computeFormula(
    {
      title: dlc.name,
      genres: [],
      hours: dlc.hours ?? DEFAULT_HOURS,
      copies: dlc.cost != null ? [{ id: "dlc", platform: "", cost: dlc.cost }] : [],
      addedAt: expansionAcquiredAt(dlc),
    },
    cfg,
    nowMs,
  );
}

/** What an expansion run costs and pays (expansion_quote in SQL). */
export function expansionQuote(
  dlc: Pick<GameDlc, "name" | "hours" | "cost" | "acquiredOn" | "createdAt">,
  formulas: EconomyConfig,
  minHours: number,
  gatePct: number,
  nowMs: number = Date.now(),
): ExpansionQuote {
  const paying = dlc.hours != null && dlc.hours >= minHours;
  if (!paying) return { price: 0, bounty: 0, gateHours: 0, paying };
  return {
    price: formulaFor(formulas.price, dlc, nowMs),
    bounty: formulaFor(formulas.bounty, dlc, nowMs),
    gateHours: (gatePct / 100) * (dlc.hours ?? 0),
    paying,
  };
}

/** Hours logged on the game since its expansion run started. */
export function expansionLoggedHours(dlc: Pick<GameDlc, "runHoursStart">, playedHours: number | undefined): number {
  return Math.max(0, (playedHours ?? 0) - (dlc.runHoursStart ?? 0));
}

/** What clearing the run pays now (finish_expansion in SQL): the full bounty
 *  once the logged-time gate is met, else the start price back or the logged
 *  share, whichever is more. */
export function expansionPayout(quote: ExpansionQuote, runPrice: number, loggedHours: number): number {
  if (!quote.paying || quote.bounty <= 0) return 0;
  if (quote.gateHours <= 0 || loggedHours >= quote.gateHours) return quote.bounty;
  return Math.min(quote.bounty, Math.max(runPrice, Math.round((quote.bounty * loggedHours) / quote.gateHours)));
}

/** Dollars recorded across a game's DLC. */
export function dlcSpend(list: Pick<GameDlc, "cost">[]): number {
  return list.reduce((sum, d) => sum + (d.cost ?? 0), 0);
}

/** What the DLC on each game cost, by game id, for the spend and value totals
 *  (owner, 2026-10-18: DLC counts in what a game cost you). */
export function dlcSpendByGame(list: Pick<GameDlc, "gameId" | "cost">[]): Map<string, number> {
  const byGame = new Map<string, number>();
  for (const d of list) {
    if (d.gameId == null || !(d.cost && d.cost > 0)) continue;
    byGame.set(d.gameId, (byGame.get(d.gameId) ?? 0) + d.cost);
  }
  return byGame;
}
