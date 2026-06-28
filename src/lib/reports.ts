// Pure helpers for the user/content reporting flow. Kept free of React/Supabase
// so the reason catalog, label lookup, and form validation are unit-tested
// offline. The data shapes live in src/types.ts; the RPCs in supabase/schema.sql.

import type { ReportReason } from "../types";

/** The selectable reasons in the report modal, in display order. Values mirror the
 *  `reason` check constraint on the `reports` table (the SQL source of truth). */
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "explicit", label: "Explicit content" },
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate_name", label: "Inappropriate name" },
  { value: "other", label: "Something else" },
];

/** Human label for a stored reason value (falls back to the raw value). */
export function reportReasonLabel(value: string): string {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? value;
}

/** Validate a report before submitting; null = OK, else an error message. */
export function validateReport(input: { reason: string | null | undefined }): string | null {
  if (!input.reason) return "Pick a reason for your report.";
  if (!REPORT_REASONS.some((r) => r.value === input.reason)) return "Pick a valid reason.";
  return null;
}
