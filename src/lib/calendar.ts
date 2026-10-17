// The site calendar (owner, 2026-10-17): coin events (the monthly schedule,
// one-offs and boost-free holiday notes), seasonal challenges, goal resets,
// and a player's own dates (pre-order arrivals, subscription renewals), so
// everyone can see what's coming and get ready. Events and challenges come
// from calendar_feed; resets and personal dates are worked out here from what
// the app already has. Pure (no React, no Supabase), unit-tested.

import type { Game } from "../types";
import { boostLabels, hasBoost, targetLabel, type BonusEventBoosts, type BonusEventTargets } from "./bonusEvents";
import { wallTimeInTz, type RotationResetConfig } from "./rotation";
import { addCadence, type Subscription } from "./subscriptions";

export type CalendarKind = "event" | "holiday" | "challenge" | "reset" | "preorder" | "renewal";

export interface CalendarItem {
  key: string;
  kind: CalendarKind;
  title: string;
  start: number;
  /** Exclusive end; null for a moment (a reset, an arrival day). */
  end: number | null;
  /** Short lines under the title: what it boosts, for which games, notes. */
  detail: string[];
  /** How to get ready ("" when none). */
  prep: string;
  /** Only this player sees it (their pre-orders and renewals). */
  personal: boolean;
  /** For an event aimed at certain games: does it fit any of yours? */
  forYou: boolean;
}

/** Feed items are calendar items; the alias names where they come from. */
export type CalendarFeedItem = CalendarItem;

const DAY = 86_400_000;

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function maybeNum(v: unknown): number | null {
  return v == null ? null : Number.isFinite(num(v, NaN)) ? num(v) : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

/** calendar_feed's events and seasonal challenges, as calendar items. */
export function coerceCalendarFeed(raw: unknown): CalendarItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CalendarItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const start = Date.parse(str(x.starts_at));
    const end = Date.parse(str(x.ends_at));
    if (!Number.isFinite(start) || !Number.isFinite(end) || !str(x.id)) continue;
    if (x.kind === "event") {
      const boosts: BonusEventBoosts = {
        bountyMult: num(x.bounty_mult, 1),
        sessionMult: num(x.session_mult, 1),
        rewardsMult: num(x.rewards_mult, 1),
        startDiscountPct: num(x.start_discount_pct),
        discountLimit: maybeNum(x.discount_limit),
      };
      const targets: BonusEventTargets = {
        genres: strings(x.genres),
        platforms: strings(x.platforms),
        offMainPlatform: x.off_main_platform === true,
        minHours: maybeNum(x.min_hours),
        maxHours: maybeNum(x.max_hours),
      };
      const target = targetLabel(targets);
      out.push({
        key: `event:${x.id}:${start}`,
        kind: hasBoost(boosts) ? "event" : "holiday",
        title: str(x.name),
        start,
        end,
        detail: [
          ...boostLabels(boosts),
          ...(target ? [`For ${target}`] : []),
          ...(str(x.description) ? [str(x.description)] : []),
        ],
        prep: str(x.prep_tip),
        personal: false,
        forYou: x.for_you !== false,
      });
    } else if (x.kind === "challenge") {
      const reward = num(x.reward);
      out.push({
        key: `challenge:${x.id}`,
        kind: "challenge",
        title: str(x.name),
        start,
        end,
        detail: [
          ...(str(x.description) ? [str(x.description)] : []),
          ...(reward > 0 ? [`Reward: ${reward} coins`] : []),
        ],
        prep: "",
        personal: false,
        forYou: true,
      });
    }
  }
  return out;
}

/** The days (as y/m/d in UTC fields) from one instant to another, padded a
 *  day each side so a reset just outside in one timezone isn't missed. */
function daysBetween(from: number, to: number): Date[] {
  const out: Date[] = [];
  const first = new Date(from - DAY);
  const day = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
  for (let t = day.getTime(); t <= to + DAY; t += DAY) out.push(new Date(t));
  return out;
}

/** When new weekly and monthly goals arrive, between `from` and `to`: the
 *  weekly reset day, and the 1st of each month, at the reset hour in the site
 *  timezone. (Daily goals reset every day; the page says so instead.) */
export function resetItems(from: number, to: number, cfg: RotationResetConfig): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const d of daysBetween(from, to)) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const at = wallTimeInTz(y, m, day, cfg.resetHour, cfg.resetTz);
    if (at < from || at >= to) continue;
    if (day === 1) {
      out.push({
        key: `reset:month:${y}-${m}`,
        kind: "reset",
        title: "New monthly goals",
        start: at,
        end: null,
        detail: ["Pick three goals for the month on the Challenges page."],
        prep: "",
        personal: false,
        forYou: true,
      });
    }
    if (d.getUTCDay() === cfg.resetDow) {
      out.push({
        key: `reset:week:${y}-${m}-${day}`,
        kind: "reset",
        title: "New weekly goals",
        start: at,
        end: null,
        detail: ["Three fresh weekly goals, and the Rotation check-in resets."],
        prep: "",
        personal: false,
        forYou: true,
      });
    }
  }
  return out;
}

/** Local midnight of an ISO date (YYYY-MM-DD). */
function localDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** A player's own dates between `from` and `to`: pre-orders arriving and
 *  subscriptions renewing. */
export function personalItems(
  games: Pick<Game, "id" | "title" | "status" | "preorderExpectedOn" | "preorderedAt">[],
  subscriptions: Subscription[],
  from: number,
  to: number,
): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const g of games) {
    if (g.status !== "backlog" || !g.preorderedAt || !g.preorderExpectedOn) continue;
    const at = localDay(g.preorderExpectedOn);
    if (at < from || at >= to) continue;
    out.push({
      key: `preorder:${g.id}`,
      kind: "preorder",
      title: `${g.title} arrives`,
      start: at,
      end: null,
      detail: ["Your pre-order unlocks in your Bazaar."],
      prep: "Have the coins to start it ready.",
      personal: true,
      forYou: true,
    });
  }
  for (const s of subscriptions) {
    for (let i = 1; i < 1000; i++) {
      const iso = addCadence(s.startedOn, s.cadence, i);
      if (s.endedOn != null && iso >= s.endedOn) break;
      const at = localDay(iso);
      if (at >= to) break;
      if (at < from) continue;
      out.push({
        key: `renewal:${s.id}:${iso}`,
        kind: "renewal",
        title: `${s.provider} renews`,
        start: at,
        end: null,
        detail: [`$${s.price.toFixed(2)} ${s.cadence === "monthly" ? "monthly" : "yearly"} renewal`],
        prep: "",
        personal: true,
        forYou: true,
      });
    }
  }
  return out;
}

/** Sorted by start, then title. */
export function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}

export interface AgendaSection {
  label: string;
  items: CalendarItem[];
}

/** The phone view: happening now, the next 7 days, and later. Ended items
 *  drop off. */
export function agenda(items: CalendarItem[], now: number): AgendaSection[] {
  const sorted = sortItems(items).filter((i) => (i.end ?? i.start + 1) > now);
  const live = sorted.filter((i) => i.end != null && i.start <= now);
  const soon = sorted.filter((i) => i.start > now && i.start < now + 7 * DAY);
  const later = sorted.filter((i) => i.start >= now + 7 * DAY);
  return [
    { label: "Happening now", items: live },
    { label: "Next 7 days", items: soon },
    { label: "Later", items: later },
  ].filter((s) => s.items.length > 0);
}

export interface CalendarDay {
  /** Local midnight. */
  date: number;
  inMonth: boolean;
  items: CalendarItem[];
}

/** The month grid (Sunday-first weeks, 0-based month) with each item on
 *  every day it covers; a moment shows on its own day. */
export function monthGrid(year: number, month: number, items: CalendarItem[]): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks: CalendarDay[][] = [];
  const sorted = sortItems(items);
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const dayStart = day.getTime();
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
      week.push({
        date: dayStart,
        inMonth: day.getMonth() === month,
        items: sorted.filter((i) =>
          i.end == null ? i.start >= dayStart && i.start < dayEnd : i.start < dayEnd && i.end > dayStart,
        ),
      });
    }
    // A sixth week entirely in the next month adds nothing.
    if (w === 5 && week.every((d) => !d.inMonth)) break;
    weeks.push(week);
  }
  return weeks;
}

/** "Sat, Nov 21" / "Sat, Nov 21 to Mon, Nov 23" (the end shown inclusive, so
 *  a weekend ending Monday midnight reads Sat to Sun). */
export function itemWhenLabel(i: Pick<CalendarItem, "start" | "end">, locale?: string): string {
  const fmt = (t: number) => new Date(t).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
  if (i.end == null) return fmt(i.start);
  const lastDay = i.end - 1;
  const sameDay = new Date(i.start).toDateString() === new Date(lastDay).toDateString();
  return sameDay ? fmt(i.start) : `${fmt(i.start)} to ${fmt(lastDay)}`;
}

export interface WeekBar {
  item: CalendarItem;
  /** First and last column (0 = Sunday) the bar covers in this week. */
  startCol: number;
  endCol: number;
  /** Row under the day numbers, from 0. */
  lane: number;
  /** The item began in an earlier week / runs on into a later one. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** One week of the month grid as bars, the way a wall calendar draws them: a
 *  multi-day item is one bar across the days it covers, stacked into lanes so
 *  bars never overlap (longer ones first). Items past `maxLanes` aren't drawn;
 *  `hidden` counts them per day for a "+N more". */
export function weekBars(
  week: CalendarDay[],
  maxLanes = 3,
): { bars: WeekBar[]; hidden: number[] } {
  const spans = new Map<string, { item: CalendarItem; startCol: number; endCol: number }>();
  week.forEach((day, col) => {
    for (const item of day.items) {
      const s = spans.get(item.key);
      if (s) s.endCol = col;
      else spans.set(item.key, { item, startCol: col, endCol: col });
    }
  });
  const ordered = [...spans.values()].sort(
    (a, b) =>
      a.startCol - b.startCol ||
      b.endCol - b.startCol - (a.endCol - a.startCol) ||
      a.item.start - b.item.start ||
      a.item.title.localeCompare(b.item.title),
  );
  const laneEnds: number[] = [];
  const bars: WeekBar[] = [];
  const hidden = week.map(() => 0);
  const weekStart = week[0].date;
  const weekEnd = week[week.length - 1].date + DAY;
  for (const s of ordered) {
    let lane = laneEnds.findIndex((end) => end < s.startCol);
    if (lane === -1) lane = laneEnds.length;
    if (lane >= maxLanes) {
      for (let c = s.startCol; c <= s.endCol; c++) hidden[c]++;
      continue;
    }
    laneEnds[lane] = s.endCol;
    bars.push({
      ...s,
      lane,
      continuesBefore: s.item.start < weekStart,
      continuesAfter: s.item.end != null && s.item.end > weekEnd,
    });
  }
  return { bars, hidden };
}
