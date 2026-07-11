import { describe, it, expect } from "vitest";
import {
  summarizeUserChanges,
  appendNote,
  buildChangeBody,
  type UserChangeFields,
} from "./adminChanges";

const base: UserChangeFields = {
  coins: 100,
  charters: 0,
  vouchers: 0,
  generalSlots: 2,
  isAdmin: false,
  blocked: false,
};

describe("summarizeUserChanges", () => {
  it("reports a coin change with a signed delta", () => {
    expect(summarizeUserChanges(base, { ...base, coins: 150 })).toEqual([
      "Coins: 100 → 150 (+50)",
    ]);
    expect(summarizeUserChanges(base, { ...base, coins: 60 })).toEqual(["Coins: 100 → 60 (-40)"]);
  });

  it("reports slot, admin, and block changes", () => {
    expect(summarizeUserChanges(base, { ...base, generalSlots: 3 })).toEqual([
      "Now Playing slots: 2 → 3",
    ]);
    expect(summarizeUserChanges(base, { ...base, isAdmin: true })).toEqual(["You're now an admin."]);
    expect(summarizeUserChanges(base, { ...base, blocked: true })).toEqual([
      "Your account was blocked.",
    ]);
  });

  it("reports a voucher grant with a signed delta", () => {
    expect(summarizeUserChanges(base, { ...base, vouchers: 2 })).toEqual([
      "Free Game Vouchers: 0 → 2 (+2)",
    ]);
  });

  it("reports an Import Charter change with a signed delta", () => {
    expect(summarizeUserChanges(base, { ...base, charters: 3 })).toEqual([
      "Import Charters: 0 → 3 (+3)",
    ]);
    expect(summarizeUserChanges({ ...base, charters: 3 }, { ...base, charters: 1 })).toEqual([
      "Import Charters: 3 → 1 (-2)",
    ]);
  });

  it("returns nothing when nothing changed", () => {
    expect(summarizeUserChanges(base, { ...base })).toEqual([]);
  });

  it("combines multiple changes", () => {
    expect(summarizeUserChanges(base, { ...base, coins: 200, generalSlots: 4 })).toEqual([
      "Coins: 100 → 200 (+100)",
      "Now Playing slots: 2 → 4",
    ]);
  });
});

describe("appendNote", () => {
  it("appends a trimmed note", () => {
    expect(appendNote("Granted a slot.", "  enjoy  ")).toBe("Granted a slot.\nNote: enjoy");
  });
  it("leaves the message alone with no note", () => {
    expect(appendNote("Granted a slot.")).toBe("Granted a slot.");
    expect(appendNote("Granted a slot.", "   ")).toBe("Granted a slot.");
  });
});

describe("buildChangeBody", () => {
  it("joins change lines and appends a note", () => {
    expect(buildChangeBody(["Coins: 100 → 150 (+50)"], "weekly bonus")).toBe(
      "Coins: 100 → 150 (+50)\nNote: weekly bonus",
    );
  });
  it("is null when there are no changes, even with a note", () => {
    expect(buildChangeBody([], "ignored")).toBeNull();
  });
});
