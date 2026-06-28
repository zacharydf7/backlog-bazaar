import { describe, it, expect } from "vitest";
import { REPORT_REASONS, reportReasonLabel, validateReport } from "./reports";

describe("REPORT_REASONS", () => {
  it("is well-formed: unique values, non-empty labels, includes the AC categories", () => {
    const values = REPORT_REASONS.map((r) => r.value);
    expect(new Set(values).size).toBe(values.length);
    for (const r of REPORT_REASONS) expect(r.label.length).toBeGreaterThan(0);
    expect(values).toEqual(
      expect.arrayContaining(["explicit", "harassment", "spam", "inappropriate_name", "other"]),
    );
  });
});

describe("reportReasonLabel", () => {
  it("maps a value to its display label", () => {
    expect(reportReasonLabel("harassment")).toBe("Harassment");
    expect(reportReasonLabel("inappropriate_name")).toBe("Inappropriate name");
  });

  it("falls back to the raw value for an unknown reason", () => {
    expect(reportReasonLabel("mystery")).toBe("mystery");
  });
});

describe("validateReport", () => {
  it("requires a reason", () => {
    expect(validateReport({ reason: null })).toMatch(/reason/i);
    expect(validateReport({ reason: "" })).toMatch(/reason/i);
  });

  it("rejects an unknown reason", () => {
    expect(validateReport({ reason: "nope" })).toMatch(/valid/i);
  });

  it("accepts a known reason", () => {
    expect(validateReport({ reason: "spam" })).toBeNull();
  });
});
