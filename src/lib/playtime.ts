// Parsing and formatting for played time. Time is stored as a number of hours
// (a float — the DB column is `real`), but players think in hours *and* minutes,
// so we accept flexible input ("1h 22m", "90m", "2.75", "1:30") and display a
// tidy "Xh Ym". Values are snapped to a whole minute to avoid float noise.

import { evaluateMathExpression } from "./mathInput";

/** Round a number of hours to the nearest whole minute. */
export function snapToMinute(hours: number): number {
  return Math.round(hours * 60) / 60;
}

/**
 * Parse a free-form play-time string into hours (snapped to the minute), or
 * null if it can't be understood. Accepted forms (case-insensitive):
 *   "1h 22m" / "1h22m" / "1 h 22 m"   → 1h 22m
 *   "90m" / "22 min"                  → minutes only
 *   "1h"                              → hours only
 *   "1:30"                            → h:mm
 *   "2.75" / "2.75h"                  → decimal hours
 *   "1.5+2" / "45/60" / "(2+1)*3"     → math over decimal hours (issue 111adc13)
 * Empty/whitespace and negatives return null.
 */
export function parsePlaytime(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  // h:mm clock form, e.g. "1:30" or "0:45".
  const clock = s.match(/^(\d+):(\d{1,2})$/);
  if (clock) {
    const h = Number(clock[1]);
    const m = Number(clock[2]);
    if (m >= 60) return null;
    return snapToMinute(h + m / 60);
  }

  // Explicit hours and/or minutes, e.g. "1h 22m", "90m", "2h".
  const hm = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?$/);
  if (hm && (hm[1] != null || hm[2] != null)) {
    const h = hm[1] != null ? Number(hm[1]) : 0;
    const m = hm[2] != null ? Number(hm[2]) : 0;
    const total = h + m / 60;
    return total >= 0 ? snapToMinute(total) : null;
  }

  // Bare decimal hours, e.g. "2.75".
  if (/^\d+(\.\d+)?$/.test(s)) {
    return snapToMinute(Number(s));
  }

  // Math over decimal hours, e.g. "1.5+2" or "45/60" (issue 111adc13). Unit
  // forms never reach here — letters and ":" aren't valid expression tokens.
  const evaluated = evaluateMathExpression(s);
  if (evaluated != null && evaluated >= 0) {
    return snapToMinute(evaluated);
  }

  return null;
}

/** Format hours as "Xh Ym" (dropping a zero part): "2h 45m", "45m", "2h", "0h". */
export function formatPlaytime(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "0h";
}

/** Format a game length for an editable length field: blank when unknown or
 *  zero, otherwise the same tidy "Xh Ym" used everywhere else. Unlike
 *  formatPlaytime, an absent length shows as "" (nothing to edit) rather than
 *  "0h". */
export function formatLength(hours: number | null | undefined): string {
  return hours && hours > 0 ? formatPlaytime(hours) : "";
}
