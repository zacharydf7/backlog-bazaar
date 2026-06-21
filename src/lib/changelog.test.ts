import { describe, it, expect } from "vitest";
import { isUnseen, RELEASES, LATEST_RELEASE_ID } from "./changelog";

describe("isUnseen", () => {
  it("is true when the user has seen nothing", () => {
    expect(isUnseen("v2", null)).toBe(true);
  });

  it("is true when a newer release exists than the one seen", () => {
    expect(isUnseen("v2", "v1")).toBe(true);
  });

  it("is false once the latest has been seen", () => {
    expect(isUnseen("v2", "v2")).toBe(false);
  });

  it("is false when there is no latest id", () => {
    expect(isUnseen("", null)).toBe(false);
  });
});

describe("RELEASES", () => {
  it("has unique ids", () => {
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes the newest entry as LATEST_RELEASE_ID", () => {
    expect(LATEST_RELEASE_ID).toBe(RELEASES[0].id);
  });

  it("every release has at least one item", () => {
    for (const r of RELEASES) expect(r.items.length).toBeGreaterThan(0);
  });
});
