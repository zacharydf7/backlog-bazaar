import { describe, it, expect } from "vitest";
import { STATUS_LABEL, gameStatusLabel, isInRotation } from "./status";

describe("gameStatusLabel (issue b4c6ac9d)", () => {
  it("reads In Rotation for a live-service game in the Rotation lane", () => {
    expect(gameStatusLabel({ status: "playing", inRotation: true })).toBe("In Rotation");
    expect(isInRotation({ status: "playing", inRotation: true })).toBe(true);
  });

  it("keeps the plain label for a normal Now Playing run", () => {
    expect(gameStatusLabel({ status: "playing", inRotation: false })).toBe("Now Playing");
    expect(gameStatusLabel({ status: "playing" })).toBe("Now Playing");
    expect(isInRotation({ status: "playing" })).toBe(false);
  });

  it("ignores a stale inRotation flag off the playing status", () => {
    // A parked live-service game is in the Bazaar; only playing+inRotation is
    // "In Rotation".
    expect(gameStatusLabel({ status: "backlog", inRotation: true })).toBe(
      STATUS_LABEL.backlog,
    );
    expect(isInRotation({ status: "backlog", inRotation: true })).toBe(false);
  });

  it("matches STATUS_LABEL for every non-rotation status", () => {
    for (const status of ["backlog", "wishlist", "finished", "playing"] as const) {
      expect(gameStatusLabel({ status })).toBe(STATUS_LABEL[status]);
    }
  });
});
