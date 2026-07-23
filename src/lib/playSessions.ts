// Pure logic for the play-session stopwatch: elapsed-time math, the trim rules
// mirrored from the server (end_play_session — trim only, 24h cap, minute
// snapping, a sub-minute stop logs nothing), and display formatting for the
// live pill/dialog. The server stays authoritative — these mirrors exist so the
// UI can preview exactly what a stop will log. Kept free of React/Supabase so
// it's directly unit-tested.

import type { CopyFormat } from "../types";
import { snapToMinute } from "./playtime";

/** The caller's one live stopwatch session (play_sessions row, status 'active'). */
export interface ActivePlaySession {
  id: string;
  gameId: string | null;
  gameTitle: string;
  /** The version picked at start; null = server auto-detect at log time. */
  platform: string | null;
  format: CopyFormat | null;
  startedAt: number; // epoch ms
}

/** A single session may log at most this many hours untrimmed (server clamp —
 *  a forgotten timer needs a trim, not a 400h log). */
export const SESSION_CAP_HOURS = 24;

/** Below one minute nothing is logged (the server discards the session). */
export const MIN_SESSION_HOURS = 1 / 60;

/** Past this the pill nudges "still playing?" — a timer left running overnight. */
export const LONG_SESSION_HOURS = 12;

/** Raw elapsed hours of a session at `now`, clamped ≥ 0 (client clock skew). */
export function elapsedHours(startedAt: number, now: number): number {
  return Math.max(0, (now - startedAt) / 3_600_000);
}

/** The hours a stop would log before any trim: elapsed, snapped to the minute,
 *  capped at SESSION_CAP_HOURS. Mirrors the server's v_elapsed. */
export function loggableHours(startedAt: number, now: number): number {
  return snapToMinute(Math.min(elapsedHours(startedAt, now), SESSION_CAP_HOURS));
}

/** Apply the trim rules to a proposed value: never above the loggable elapsed
 *  (trim only — inflating is refused), never below 0, snapped to the minute.
 *  Mirrors the server's clamp in end_play_session. */
export function clampTrim(proposed: number, startedAt: number, now: number): number {
  const cap = loggableHours(startedAt, now);
  return snapToMinute(Math.min(Math.max(proposed, 0), cap));
}

/** Would this stop log anything, or be discarded as sub-minute? */
export function logsAnything(hours: number): boolean {
  return hours >= MIN_SESSION_HOURS - 1e-9;
}

/** Session running long enough for the "still playing?" nudge. */
export function isLongRunning(startedAt: number, now: number): boolean {
  return elapsedHours(startedAt, now) >= LONG_SESSION_HOURS;
}

/** Live stopwatch readout: "0:00:07", "1:23:45", "26:00:00". Hours are not
 *  capped here — the pill shows the true wall-clock run; the cap applies to
 *  what a stop LOGS, and the dialog explains that. */
export function formatElapsed(startedAt: number, now: number): string {
  const totalSeconds = Math.floor(Math.max(0, now - startedAt) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
