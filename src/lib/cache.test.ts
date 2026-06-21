import { describe, it, expect, beforeEach } from "vitest";
import { cacheGet, cacheSet } from "./cache";

beforeEach(() => localStorage.clear());

describe("cache", () => {
  it("stores and retrieves a value", () => {
    cacheSet("k", { a: 1 }, 1000);
    expect(cacheGet<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("returns undefined for a missing key", () => {
    expect(cacheGet("missing")).toBeUndefined();
  });

  it("expires entries past their TTL", () => {
    cacheSet("k", "v", -1); // already expired
    expect(cacheGet("k")).toBeUndefined();
  });

  it("persists to localStorage", () => {
    cacheSet("k", [1, 2, 3], 10000);
    const raw = localStorage.getItem("bb-cache:k");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).v).toEqual([1, 2, 3]);
  });
});
