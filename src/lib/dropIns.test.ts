import { describe, expect, it } from "vitest";
import { canLogTime } from "./dropIns";

describe("drop-in sessions", () => {
  it("takes time on Playing and Finished games only", () => {
    expect(canLogTime({ status: "playing" })).toBe(true);
    expect(canLogTime({ status: "finished" })).toBe(true);
    for (const status of ["backlog", "wishlist", "shelved"]) expect(canLogTime({ status })).toBe(false);
  });
});
