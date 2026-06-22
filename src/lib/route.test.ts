import { describe, it, expect } from "vitest";
import { parseHash, routeToHash, HOME, type Route } from "./route";

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
});

describe("round-trip", () => {
  const routes: Route[] = [
    { kind: "view", view: "backlog" },
    { kind: "view", view: "playing" },
    { kind: "view", view: "finished" },
    { kind: "view", view: "wishlist" },
    { kind: "view", view: "market" },
    { kind: "view", view: "leaderboard" },
    { kind: "view", view: "requests" },
    { kind: "view", view: "account" },
    { kind: "view", view: "users" },
    { kind: "view", view: "whatsnew" },
    { kind: "view", view: "about" },
    { kind: "visit", userId: "00000000-0000-0000-0000-000000000000" },
  ];

  it("parseHash(routeToHash(route)) returns the original route", () => {
    for (const route of routes) {
      expect(parseHash(routeToHash(route))).toEqual(route);
    }
  });
});
