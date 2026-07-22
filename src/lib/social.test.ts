import { describe, it, expect } from "vitest";
import {
  friendAction,
  activityHeadline,
  activityCoins,
  isCongratulatoryEvent,
  validateMessageBody,
  findMentionQuery,
  libraryHasTitle,
  MESSAGE_MAX,
} from "./social";
import type { ActivityEvent, Game } from "../types";

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
    expect(
      activityHeadline({
        kind: "co_op_completed",
        gameTitle: "It Takes Two",
        detail: { partner_name: "Sam" },
      }),
    ).toBe("cleared It Takes Two in a Co-op Pact with Sam");
  });

  it("falls back to 'a game' when the title is missing (deleted game)", () => {
    expect(activityHeadline({ kind: "bounty_claimed", gameTitle: null })).toBe("finished a game");
    expect(activityHeadline({ kind: "co_op_completed", gameTitle: null })).toBe(
      "cleared a game in a Co-op Pact with a friend",
    );
  });

  it("distinguishes a beaten clear from a 100% completion", () => {
    expect(
      activityHeadline({
        kind: "bounty_claimed",
        gameTitle: "Hollow Knight",
        detail: { finish_tag: "beaten" },
      }),
    ).toBe("beat Hollow Knight");
    expect(
      activityHeadline({
        kind: "bounty_claimed",
        gameTitle: "Hollow Knight",
        detail: { finish_tag: "completed" },
      }),
    ).toBe("completed Hollow Knight 100%");
  });

  it("reads an endless conclusion as wrapping up, not a campaign clear", () => {
    expect(
      activityHeadline({
        kind: "bounty_claimed",
        gameTitle: "Vampire Survivors",
        detail: { finish_tag: "endless" },
      }),
    ).toBe("wrapped up Vampire Survivors");
  });

  it("keeps the generic verb for clears recorded before the tag was captured", () => {
    expect(
      activityHeadline({ kind: "bounty_claimed", gameTitle: "Celeste", detail: { coins: 40 } }),
    ).toBe("finished Celeste");
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

describe("findMentionQuery", () => {
  it("detects an @ token at the cursor and reports its query + position", () => {
    const text = "have you played @hol";
    expect(findMentionQuery(text, text.length)).toEqual({ query: "hol", start: 16 });
  });

  it("matches a bare @ (empty query) to open the picker immediately", () => {
    expect(findMentionQuery("check this @", 12)).toEqual({ query: "", start: 11 });
  });

  it("matches at the very start of the input", () => {
    expect(findMentionQuery("@zelda", 6)).toEqual({ query: "zelda", start: 0 });
  });

  it("returns null when not in a mention (space ends it, or no @)", () => {
    expect(findMentionQuery("@hollow knight", 14)).toBeNull(); // space after the token
    expect(findMentionQuery("no mention here", 15)).toBeNull();
    expect(findMentionQuery("email a@b", 9)).toBeNull(); // @ not after whitespace/start
  });

  it("only considers the text up to the cursor", () => {
    const text = "@zelda and more";
    expect(findMentionQuery(text, 6)).toEqual({ query: "zelda", start: 0 });
    expect(findMentionQuery(text, 15)).toBeNull();
  });
});

describe("libraryHasTitle", () => {
  const lib = [{ title: "Hollow Knight" }, { title: "Celeste" }] as Pick<Game, "title">[];

  it("matches a title already in the library, case- and whitespace-insensitively", () => {
    expect(libraryHasTitle(lib, "Hollow Knight")).toBe(true);
    expect(libraryHasTitle(lib, "  hollow knight  ")).toBe(true);
  });

  it("returns false for a title you don't have", () => {
    expect(libraryHasTitle(lib, "Stardew Valley")).toBe(false);
  });

  it("returns false for a null/empty title", () => {
    expect(libraryHasTitle(lib, null)).toBe(false);
    expect(libraryHasTitle(lib, "")).toBe(false);
  });
});
