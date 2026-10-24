import { afterEach, describe, expect, it } from "vitest";
import { entryTab, rememberEntryTab } from "./entryTab";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("entryTab", () => {
  it("has no tab on a fresh entry", () => {
    expect(entryTab()).toBeNull();
  });

  it("remembers a tab on the current entry, keeping its URL and other state", () => {
    window.history.replaceState({ bbOverlay: true }, "", "/#c/abc");
    rememberEntryTab("games");
    expect(entryTab()).toBe("games");
    expect(window.location.hash).toBe("#c/abc");
    expect((window.history.state as { bbOverlay?: boolean }).bbOverlay).toBe(true);
  });

  it("belongs to its entry: a new entry starts without one", () => {
    rememberEntryTab("games");
    window.history.pushState(null, "", "/#g/g1");
    expect(entryTab()).toBeNull();
  });
});
