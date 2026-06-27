// The Rotation lane (live-service / ongoing games — the Now Playing "Endless"
// slots) lets you check a game in once per weekly reset for a small coin reward.
// The reset is a FIXED weekly boundary (configurable day + hour + timezone) so it
// mirrors how live-service games reset their quests on a schedule (e.g. every
// Tuesday), rather than a rolling 7 days. These helpers compute that boundary for
// display + optimistic gating; the server (rotation_checkin / rotation_period_start)
// remains the source of truth, so minor client clock/timezone drift is harmless.

export interface RotationResetConfig {
  resetDow: number; // day of week, 0 = Sunday … 6 = Saturday (Postgres dow)
  resetHour: number; // hour of day, 0–23, in resetTz
  resetTz: string; // IANA timezone the day/hour are expressed in (e.g. "UTC")
}

/** Defaults mirroring the SQL app_config defaults: 3 slots, 3 coins, Tue 00:00 UTC. */
export const DEFAULT_ROTATION_SLOTS = 3;
export const DEFAULT_ROTATION_CHECKIN_REWARD = 3;
export const DEFAULT_ROTATION_RESET: RotationResetConfig = {
  resetDow: 2, // Tuesday
  resetHour: 0,
  resetTz: "UTC",
};

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DOW_BY_ABBR: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function clampDow(dow: number): number {
  return (((Math.trunc(dow) % 7) + 7) % 7);
}

function clampHour(hour: number): number {
  return Math.min(Math.max(Math.trunc(hour), 0), 23);
}

function safeTz(tz: string): string {
  return tz && tz.trim() ? tz.trim() : "UTC";
}

/** The wall-clock parts of an instant as read off the clock in `tz`. */
function wallPartsInTz(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some engines render midnight as "24"
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour,
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
    dow: DOW_BY_ABBR[get("weekday")] ?? 0,
  };
}

/** Milliseconds to add to a real instant to get the wall-clock epoch in `tz`
 *  (i.e. the UTC timestamp of the same Y-M-D H:M:S shown on the clock there).
 *  Timezone offsets are whole minutes, so comparing the wall parts against the
 *  instant rounded to the second yields the exact zone offset. */
function tzOffsetMs(date: Date, tz: string): number {
  const p = wallPartsInTz(date, tz);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const instantSec = Math.round(date.getTime() / 1000) * 1000;
  return wall - instantSec;
}

/** Start of the current weekly Rotation period: the most recent reset boundary
 *  (configured weekday + hour, in the configured tz) that is not in the future. */
export function rotationPeriodStart(now: Date, cfg: RotationResetConfig): Date {
  const tz = safeTz(cfg.resetTz);
  const dow = clampDow(cfg.resetDow);
  const hour = clampHour(cfg.resetHour);
  const p = wallPartsInTz(now, tz);
  const offset = tzOffsetMs(now, tz);
  const daysBack = (((p.dow - dow) % 7) + 7) % 7;
  // Wall-clock epoch of this week's reset (clock time in tz, encoded as a UTC ms).
  const wallReset = Date.UTC(p.year, p.month - 1, p.day, hour, 0, 0) - daysBack * DAY;
  let instant = wallReset - offset;
  if (instant > now.getTime()) instant -= WEEK; // boundary not reached yet this week
  return new Date(instant);
}

/** The next reset boundary after `now` (exactly one week past the current start). */
export function rotationNextReset(now: Date, cfg: RotationResetConfig): Date {
  return new Date(rotationPeriodStart(now, cfg).getTime() + WEEK);
}

/** Can this game be checked in right now? True when it was never checked in, or
 *  its last check-in predates the current period's start. */
export function canRotationCheckin(
  lastCheckinAt: Date | number | null | undefined,
  now: Date,
  cfg: RotationResetConfig,
): boolean {
  if (lastCheckinAt == null) return true;
  const last = typeof lastCheckinAt === "number" ? lastCheckinAt : lastCheckinAt.getTime();
  return last < rotationPeriodStart(now, cfg).getTime();
}

/** The full weekday name for a Postgres dow (0–6). */
export function resetDayLabel(dow: number): string {
  return DAY_NAMES[clampDow(dow)];
}

/** A one-line summary of the reset schedule, e.g. "Resets Tuesdays · 00:00 UTC". */
export function rotationResetSummary(cfg: RotationResetConfig): string {
  const hh = String(clampHour(cfg.resetHour)).padStart(2, "0");
  return `Resets ${resetDayLabel(cfg.resetDow)}s · ${hh}:00 ${safeTz(cfg.resetTz)}`;
}

/** A compact countdown to the next reset, e.g. "3d 4h", "5h 12m", "now". */
export function formatResetCountdown(now: Date, cfg: RotationResetConfig): string {
  const ms = rotationNextReset(now, cfg).getTime() - now.getTime();
  if (ms <= 0) return "now";
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}
