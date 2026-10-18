import { describe, expect, it } from "vitest";
import { canLogTime } from "./dropIns";

describe("drop-in sessions", () => {
  it("takes time on Playing and Finished games only", () => {
    expect(canLogTime({ status: "playing" })).toBe(true);
    expect(canLogTime({ status: "finished" })).toBe(true);
    for (const status of ["backlog", "wishlist"] as const) expect(canLogTime({ status })).toBe(false);
  });

  it("takes time on a wishlist game only while it's a demo", () => {
    expect(canLogTime({ status: "wishlist", demo: true })).toBe(true);
    expect(canLogTime({ status: "backlog", demo: true })).toBe(false);
  });
});
