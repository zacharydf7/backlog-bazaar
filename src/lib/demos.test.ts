import { describe, expect, it } from "vitest";
import { boardOf, isDemo } from "./demos";

describe("demos", () => {
  it("is a demo only while it's a wishlist game marked as one", () => {
    expect(isDemo({ status: "wishlist", demo: true })).toBe(true);
    expect(isDemo({ status: "wishlist", demo: false })).toBe(false);
    expect(isDemo({ status: "backlog", demo: true })).toBe(false);
  });

  it("puts a demo on Now Playing and every other game on its status's board", () => {
    expect(boardOf({ status: "wishlist", demo: true })).toBe("playing");
    expect(boardOf({ status: "wishlist" })).toBe("wishlist");
    expect(boardOf({ status: "finished", demo: true })).toBe("finished");
  });
});
