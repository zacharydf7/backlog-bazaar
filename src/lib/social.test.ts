import { describe, it, expect } from "vitest";
import {
  friendAction,
  activityHeadline,
  activityCoins,
  isCongratulatoryEvent,
  validateMessageBody,
  MESSAGE_MAX,
  MESSAGE_FOLDERS,
} from "./social";
import type { ActivityEvent } from "../types";

describe("friendAction", () => {
  it("offers to send a request when there's no relationship", () => {
    expect(friendAction("none")).toEqual({
      label: "Add friend",
      action: "send",
      disabled: false,
    });
  });

  it("offers to cancel an outgoing request", () => {
    expect(friendAction("pending_out").action).toBe("cancel");
  });

  it("offers to accept an incoming request", () => {
    expect(friendAction("pending_in").action).toBe("accept");
  });

  it("is inert once already friends", () => {
    const a = friendAction("friends");
    expect(a.action).toBe("none");
    expect(a.disabled).toBe(true);
  });
});

describe("activityHeadline", () => {
  it("describes each broadcast kind", () => {
    expect(activityHeadline({ kind: "game_imported", gameTitle: "Celeste" })).toBe(
      "imported Celeste from the Wishlist",
    );
    expect(activityHeadline({ kind: "family_created", gameTitle: "Final Fantasy VII" })).toBe(
      "started a Game Family with Final Fantasy VII",
    );
    expect(activityHeadline({ kind: "bounty_claimed", gameTitle: "Hollow Knight" })).toBe(
      "finished Hollow Knight",
    );
  });

  it("falls back to 'a game' when the title is missing (deleted game)", () => {
    expect(activityHeadline({ kind: "bounty_claimed", gameTitle: null })).toBe("finished a game");
  });
});

describe("activityCoins", () => {
  it("returns the coin reward when present and positive", () => {
    expect(activityCoins({ detail: { coins: 42 } })).toBe(42);
  });

  it("returns null when the amount is absent (hidden) or zero", () => {
    expect(activityCoins({ detail: {} })).toBeNull();
    expect(activityCoins({ detail: { coins: 0 } })).toBeNull();
  });
});

describe("isCongratulatoryEvent", () => {
  it("is true only for a finished-game post", () => {
    const finish: Pick<ActivityEvent, "kind"> = { kind: "bounty_claimed" };
    expect(isCongratulatoryEvent(finish)).toBe(true);
    expect(isCongratulatoryEvent({ kind: "game_imported" })).toBe(false);
  });
});

describe("validateMessageBody", () => {
  it("rejects an empty or whitespace-only message", () => {
    expect(validateMessageBody("")).toMatch(/empty/i);
    expect(validateMessageBody("   ")).toMatch(/empty/i);
  });

  it("rejects a message over the cap", () => {
    expect(validateMessageBody("x".repeat(MESSAGE_MAX + 1))).toMatch(/too long/i);
  });

  it("accepts a normal message", () => {
    expect(validateMessageBody("Want to co-op tonight?")).toBeNull();
    expect(validateMessageBody("x".repeat(MESSAGE_MAX))).toBeNull();
  });
});

describe("MESSAGE_FOLDERS", () => {
  it("lists the three folders in order", () => {
    expect(MESSAGE_FOLDERS.map((f) => f.value)).toEqual(["received", "sent", "archived"]);
  });
});
