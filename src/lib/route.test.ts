import { describe, it, expect } from "vitest";
import {
  parseHash,
  routeToHash,
  gameHash,
  compilationHash,
  listHash,
  isAccountSwitch,
  HOME,
  type Route,
} from "./route";

describe("parseHash", () => {
  it("treats an empty or bare hash as home", () => {
    expect(parseHash("")).toEqual(HOME);
    expect(parseHash("#")).toEqual(HOME);
    expect(parseHash("#/")).toEqual(HOME);
  });

  it("parses a known page (with or without a leading slash)", () => {
    expect(parseHash("#leaderboard")).toEqual({ kind: "view", view: "leaderboard" });
    expect(parseHash("#/requests")).toEqual({ kind: "view", view: "requests" });
    expect(parseHash("#backlog")).toEqual({ kind: "view", view: "backlog" });
  });

  it("parses a visit route", () => {
    expect(parseHash("#u/abc-123")).toEqual({ kind: "visit", userId: "abc-123" });
  });

  it("falls back to home for an empty visit id", () => {
    expect(parseHash("#u/")).toEqual(HOME);
  });

  it("parses a game route", () => {
    expect(parseHash("#g/game-1")).toEqual({ kind: "game", gameId: "game-1" });
    expect(parseHash("#/g/game-1")).toEqual({ kind: "game", gameId: "game-1" });
  });

  it("parses a game inside a visit", () => {
    expect(parseHash("#u/abc-123/g/game-1")).toEqual({
      kind: "visitGame",
      userId: "abc-123",
      gameId: "game-1",
    });
  });

  it("parses a compilation route", () => {
    expect(parseHash("#c/comp-1")).toEqual({ kind: "compilation", compilationId: "comp-1" });
    expect(parseHash("#/c/comp-1")).toEqual({ kind: "compilation", compilationId: "comp-1" });
  });

  it("parses a custom list route (the share link)", () => {
    expect(parseHash("#l/list-1")).toEqual({ kind: "list", listId: "list-1" });
    expect(parseHash("#/l/list-1")).toEqual({ kind: "list", listId: "list-1" });
  });

  it("degrades a malformed game route gracefully", () => {
    expect(parseHash("#g/")).toEqual(HOME);
    expect(parseHash("#c/")).toEqual(HOME);
    expect(parseHash("#l/")).toEqual(HOME);
    // Missing game id → the plain visit still works.
    expect(parseHash("#u/abc-123/g/")).toEqual({ kind: "visit", userId: "abc-123" });
    // Missing user id → nothing to anchor to.
    expect(parseHash("#u//g/game-1")).toEqual(HOME);
  });

  it("falls back to home for unknown pages", () => {
    expect(parseHash("#bogus")).toEqual(HOME);
  });

  it("ignores the Supabase OAuth callback hash", () => {
    expect(parseHash("#access_token=xyz&type=recovery&expires_in=3600")).toEqual(HOME);
  });
});

describe("routeToHash", () => {
  it("uses an empty hash for home", () => {
    expect(routeToHash(HOME)).toBe("");
    expect(routeToHash({ kind: "view", view: "backlog" })).toBe("");
  });

  it("prefixes a page with #", () => {
    expect(routeToHash({ kind: "view", view: "about" })).toBe("#about");
  });

  it("encodes a visit", () => {
    expect(routeToHash({ kind: "visit", userId: "abc" })).toBe("#u/abc");
  });

  it("encodes a game page, standalone and inside a visit", () => {
    expect(routeToHash({ kind: "game", gameId: "g1" })).toBe("#g/g1");
    expect(routeToHash({ kind: "visitGame", userId: "abc", gameId: "g1" })).toBe("#u/abc/g/g1");
  });
});

describe("gameHash", () => {
  it("targets your own library without a visit id, the visited Bazaar with one", () => {
    expect(gameHash("g1")).toBe("#g/g1");
    expect(gameHash("g1", null)).toBe("#g/g1");
    expect(gameHash("g1", "abc")).toBe("#u/abc/g/g1");
  });
});

describe("compilationHash", () => {
  it("opens the compilation's own page", () => {
    expect(compilationHash("c1")).toBe("#c/c1");
  });
});

describe("listHash", () => {
  it("opens the list's page (doubles as the share link)", () => {
    expect(listHash("l1")).toBe("#l/l1");
  });
});

describe("round-trip", () => {
  const routes: Route[] = [
    { kind: "view", view: "backlog" },
    { kind: "view", view: "playing" },
    { kind: "view", view: "finished" },
    { kind: "view", view: "wishlist" },
    { kind: "view", view: "market" },
    { kind: "view", view: "leaderboard" },
    { kind: "view", view: "achievements" },
    { kind: "view", view: "requests" },
    { kind: "view", view: "account" },
    { kind: "view", view: "users" },
    { kind: "view", view: "roles" },
    { kind: "view", view: "whatsnew" },
    { kind: "view", view: "about" },
    { kind: "view", view: "privacy" },
    { kind: "visit", userId: "00000000-0000-0000-0000-000000000000" },
    { kind: "game", gameId: "11111111-1111-1111-1111-111111111111" },
    {
      kind: "visitGame",
      userId: "00000000-0000-0000-0000-000000000000",
      gameId: "11111111-1111-1111-1111-111111111111",
    },
    { kind: "compilation", compilationId: "22222222-2222-2222-2222-222222222222" },
    { kind: "view", view: "lists" },
    { kind: "list", listId: "33333333-3333-3333-3333-333333333333" },
  ];

  it("parseHash(routeToHash(route)) returns the original route", () => {
    for (const route of routes) {
      expect(parseHash(routeToHash(route))).toEqual(route);
    }
  });
});

describe("isAccountSwitch", () => {
  it("is true when a different account signs in", () => {
    expect(isAccountSwitch("user-a", "user-b")).toBe(true);
  });

  it("is false on the first sign-in of a session (no prior account)", () => {
    // So a reload / deep-link still restores the saved page instead of going home.
    expect(isAccountSwitch(null, "user-a")).toBe(false);
  });

  it("is false when the same account re-appears (token refresh / reload)", () => {
    expect(isAccountSwitch("user-a", "user-a")).toBe(false);
  });

  it("is false for the signed-out gap between accounts", () => {
    expect(isAccountSwitch("user-a", null)).toBe(false);
  });
});
