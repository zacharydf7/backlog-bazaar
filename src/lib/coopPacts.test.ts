import { describe, it, expect } from "vitest";
import {
  activePactForCard,
  canInviteToPact,
  isLivePact,
  pactForGame,
  pactStatusLine,
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
  it("returns only an ACTIVE pact bound to this exact card", () => {
    expect(activePactForCard([pact()], "g1")?.id).toBe("p1");
    expect(activePactForCard([pact({ status: "pending" })], "g1")).toBeNull();
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

describe("isLivePact", () => {
  it("counts pending and active only", () => {
    expect(isLivePact({ status: "pending" })).toBe(true);
    expect(isLivePact({ status: "active" })).toBe(true);
    expect(isLivePact({ status: "completed" })).toBe(false);
    expect(isLivePact({ status: "dissolved" })).toBe(false);
    expect(isLivePact({ status: "declined" })).toBe(false);
  });
});
