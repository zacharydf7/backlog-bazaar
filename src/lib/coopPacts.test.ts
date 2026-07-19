import { describe, it, expect } from "vitest";
import {
  activePactForCard,
  canInviteToPact,
  isLivePact,
  isPlayer2Join,
  pactForGame,
  pactJoinDraft,
  pactStatusLine,
  player2Invites,
  playtimeLockedByPact,
  playtimeSharedToPartner,
} from "./coopPacts";
import type { CoOpPact, Game } from "../types";

function pact(over: Partial<CoOpPact> = {}): CoOpPact {
  return {
    id: "p1",
    status: "active",
    gameKey: "r:7",
    title: "Hollow Knight",
    partnerId: "u2",
    partnerName: "Sam",
    partnerAvatar: null,
    myGameId: "g1",
    partnerGameId: "g9",
    iAmInviter: true,
    myFinishedAt: null,
    partnerFinishedAt: null,
    bonusPct: 25,
    createdAt: 100,
    endedAt: null,
    endedById: null,
    partnerHours: null,
    coversFee: false,
    giftedFee: null,
    partnerGameImage: null,
    partnerGameHours: null,
    partnerGamePlatform: null,
    ...over,
  };
}

function game(over: Partial<Game> = {}): Game {
  return { id: "g1", title: "Hollow Knight", status: "playing", rawgId: 7, ...over } as Game;
}

describe("pactForGame", () => {
  it("matches a bound pact by the exact card id", () => {
    expect(pactForGame([pact()], game())?.id).toBe("p1");
    expect(pactForGame([pact()], game({ id: "other" }))).toBeNull();
  });

  it("matches a pending incoming invite (no bound copy yet) by catalog identity", () => {
    const invite = pact({ status: "pending", iAmInviter: false, myGameId: null });
    // Any of my copies of rawg 7 surfaces the invite — even a different card id.
    expect(pactForGame([invite], game({ id: "any-copy", rawgId: 7 }))?.id).toBe("p1");
    expect(pactForGame([invite], game({ id: "any-copy", rawgId: 8 }))).toBeNull();
  });

  it("prefers the live pact over ended ones; else the newest ended", () => {
    const old = pact({ id: "old", status: "dissolved", createdAt: 1 });
    const newer = pact({ id: "new", status: "completed", createdAt: 2 });
    const live = pact({ id: "live", status: "active", createdAt: 0 });
    expect(pactForGame([old, newer, live], game())?.id).toBe("live");
    expect(pactForGame([old, newer], game())?.id).toBe("new");
  });
});

describe("activePactForCard", () => {
  it("returns the LIVE pact bound to this exact card (active, or a pending outgoing invite)", () => {
    expect(activePactForCard([pact()], "g1")?.id).toBe("p1");
    // The inviter's copy already sits in the Co-op lane while pending — the
    // card badge shows the waiting state, so a bound pending pact matches.
    expect(activePactForCard([pact({ status: "pending" })], "g1")?.id).toBe("p1");
    // A pending INCOMING invite has no bound copy yet — nothing to decorate.
    expect(activePactForCard([pact({ status: "pending", myGameId: null })], "g1")).toBeNull();
    expect(activePactForCard([pact({ status: "dissolved" })], "g1")).toBeNull();
    expect(activePactForCard([pact()], "g2")).toBeNull();
  });
});

describe("canInviteToPact", () => {
  it("requires an owned copy with a catalog identity and no live pact", () => {
    expect(canInviteToPact([], game({ status: "backlog" }))).toBe(true);
    expect(canInviteToPact([], game({ status: "wishlist" }))).toBe(false);
    expect(canInviteToPact([], game({ rawgId: undefined, catalogId: undefined }))).toBe(false);
    // A live pact on the identity blocks a second invite; an ended one doesn't.
    expect(canInviteToPact([pact({ status: "pending", myGameId: null })], game())).toBe(false);
    expect(canInviteToPact([pact()], game())).toBe(false);
    expect(canInviteToPact([pact({ status: "dissolved" })], game())).toBe(true);
  });
});

describe("pactStatusLine", () => {
  it("reads from the caller's perspective", () => {
    expect(pactStatusLine(pact({ status: "pending", iAmInviter: true }))).toMatch(/Waiting for Sam/);
    expect(pactStatusLine(pact({ status: "pending", iAmInviter: false }))).toMatch(/Sam wants/);
    expect(pactStatusLine(pact({ myFinishedAt: 5 }))).toMatch(/You finished/);
    expect(pactStatusLine(pact({ partnerFinishedAt: 5 }))).toMatch(/Sam finished/);
    expect(pactStatusLine(pact())).toMatch(/In a pact with Sam/);
    expect(pactStatusLine(pact({ status: "completed" }))).toMatch(/both cleared/);
  });
});

describe("isPlayer2Join / player2Invites", () => {
  const invite = pact({ status: "pending", iAmInviter: false, myGameId: null });

  it("is a Player 2 join only for a pending incoming invite with no owned copy", () => {
    expect(isPlayer2Join(invite, [])).toBe(true);
    // A wishlist-only entry still joins as Player 2 (the want-list survives).
    expect(isPlayer2Join(invite, [game({ status: "wishlist" })])).toBe(true);
    // Any owned copy of the identity routes through the normal accept instead.
    expect(isPlayer2Join(invite, [game({ status: "backlog" })])).toBe(false);
    expect(isPlayer2Join(invite, [game({ status: "finished" })])).toBe(false);
    // Only the invitee's side of a PENDING pact joins.
    expect(isPlayer2Join(pact({ status: "pending", myGameId: null }), [])).toBe(false);
    expect(isPlayer2Join(pact({ status: "active", iAmInviter: false }), [])).toBe(false);
  });

  it("player2Invites keeps only the joinable invites", () => {
    const owned = pact({ id: "p2", status: "pending", iAmInviter: false, myGameId: null });
    expect(player2Invites([invite, pact()], []).map((p) => p.id)).toEqual(["p1"]);
    expect(player2Invites([owned], [game({ status: "backlog" })])).toEqual([]);
  });
});

describe("pactJoinDraft", () => {
  it("prices the card as the server will create it — fresh, from the partner preview", () => {
    const draft = pactJoinDraft(
      pact({ partnerGameHours: 30, partnerGameImage: "img.jpg" }),
    );
    expect(draft).toEqual({ title: "Hollow Knight", genres: [], hours: 30, image: "img.jpg" });
    // addedAt stays absent: the formula reads it as "acquired right now".
    expect("addedAt" in draft).toBe(false);
  });

  it("leaves hours undefined when the partner card is private (formula default applies)", () => {
    expect(pactJoinDraft(pact()).hours).toBeUndefined();
  });
});

describe("playtimeLockedByPact / playtimeSharedToPartner", () => {
  const invitee = pact({ iAmInviter: false });

  it("locks the invitee's log box only while the pact is active and Player 1 is unfinished", () => {
    expect(playtimeLockedByPact(invitee)).toBe(true);
    // Player 1 (the invitee's partner) finished — the lock lifts so Player 2
    // can log the rest of their own run.
    expect(playtimeLockedByPact(pact({ iAmInviter: false, partnerFinishedAt: 5 }))).toBe(false);
    // Player 1 is never locked, and nothing outside an active pact is.
    expect(playtimeLockedByPact(pact())).toBe(false);
    expect(playtimeLockedByPact(pact({ iAmInviter: false, status: "pending" }))).toBe(false);
    expect(playtimeLockedByPact(pact({ iAmInviter: false, status: "dissolved" }))).toBe(false);
    expect(playtimeLockedByPact(null)).toBe(false);
  });

  it("marks Player 1's log as shared while the partner's half is still in play", () => {
    expect(playtimeSharedToPartner(pact())).toBe(true);
    // Partner finished — their card stops receiving time, so no hint.
    expect(playtimeSharedToPartner(pact({ partnerFinishedAt: 5 }))).toBe(false);
    expect(playtimeSharedToPartner(invitee)).toBe(false);
    expect(playtimeSharedToPartner(pact({ status: "pending" }))).toBe(false);
    expect(playtimeSharedToPartner(null)).toBe(false);
  });
});

describe("isLivePact", () => {
  it("counts pending and active only", () => {
    expect(isLivePact({ status: "pending" })).toBe(true);
    expect(isLivePact({ status: "active" })).toBe(true);
    expect(isLivePact({ status: "completed" })).toBe(false);
    expect(isLivePact({ status: "dissolved" })).toBe(false);
    expect(isLivePact({ status: "declined" })).toBe(false);
  });
});
