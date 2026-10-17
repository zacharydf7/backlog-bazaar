import { describe, it, expect, vi, afterEach } from "vitest";
import {
  deviceClass,
  flushAppEvents,
  startAppEvents,
  stopAppEvents,
  trackEvent,
  trackScreen,
  type AppEvent,
} from "./appEvents";

afterEach(() => {
  stopAppEvents();
  vi.useRealTimers();
});

function started() {
  const sent: AppEvent[][] = [];
  startAppEvents(async (batch) => {
    sent.push(batch);
  }, { version: "abc" });
  return sent;
}

describe("app usage log", () => {
  it("logs nothing until started", async () => {
    trackEvent("feature", "mystery_pull");
    const sent = started();
    await flushAppEvents();
    expect(sent.flat().map((e) => e.kind)).toEqual(["visit"]);
  });

  it("opens with a visit, then batches events under one session", async () => {
    const sent = started();
    trackEvent("feature", "game_tab", { tab: "journey" });
    trackEvent("search", "no_results", { query: "zelda" });
    await flushAppEvents();
    const events = sent.flat();
    expect(events.map((e) => e.name)).toEqual([expect.any(String), "game_tab", "no_results"]);
    expect(events[0].detail).toMatchObject({ version: "abc" });
    expect(new Set(events.map((e) => e.session)).size).toBe(1);
  });

  it("records a screen once until the screen changes", async () => {
    const sent = started();
    trackScreen("backlog");
    trackScreen("backlog");
    trackScreen("finished");
    trackScreen("backlog");
    await flushAppEvents();
    expect(sent.flat().filter((e) => e.kind === "screen").map((e) => e.name)).toEqual([
      "backlog",
      "finished",
      "backlog",
    ]);
  });

  it("flushes on a timer and drops a failed batch quietly", async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => {
      throw new Error("offline");
    });
    startAppEvents(send);
    trackEvent("feature", "x");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(1); // nothing left to resend
  });

  it("records uncaught errors as error events", async () => {
    const sent = started();
    window.dispatchEvent(new ErrorEvent("error", { message: "boom", filename: "https://x/app.js", lineno: 7 }));
    await flushAppEvents();
    expect(sent.flat().find((e) => e.kind === "error")).toMatchObject({
      name: "boom",
      detail: { source: "app.js", line: 7 },
    });
  });

  it("classifies the device by viewport width", () => {
    expect([deviceClass(390), deviceClass(800), deviceClass(1440)]).toEqual(["phone", "tablet", "desktop"]);
  });
});
