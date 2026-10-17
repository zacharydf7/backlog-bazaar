import { describe, it, expect, beforeEach, vi } from "vitest";

// The weekly recap at sign-in (2026-10-17): the store opens the card only for
// a recap that hasn't been seen, and never over the first-run tutorial (the
// bell keeps it for later). Closing marks it seen. The Supabase boundary is
// mocked.
const h = vi.hoisted(() => {
  const state = { recap: null as unknown, sent: [] as string[] };
  // Like supabase-js, a call is only SENT once something awaits it (then).
  const rpc = vi.fn((name: string) => ({
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
      state.sent.push(name);
      return Promise.resolve({ data: name === "weekly_recap" ? state.recap : null, error: null }).then(ok, err);
    },
  }));
  return { state, rpc };
});

vi.mock("./lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/supabase")>()),
  supabase: { rpc: h.rpc },
}));

import { useStore } from "./store";

const RECAP = { id: "r1", week_start: "2026-10-12", seen_at: null, data: { play: { hours: 2 } } };

beforeEach(() => {
  h.rpc.mockClear();
  h.state.sent = [];
  h.state.recap = RECAP;
  useStore.setState({
    cloud: true,
    weeklyRecap: null,
    onboardingCompletedAt: 1,
    fetchNotifications: vi.fn(async () => {}),
  });
});

describe("fetchWeeklyRecap", () => {
  it("opens an unseen recap", async () => {
    await useStore.getState().fetchWeeklyRecap();
    expect(useStore.getState().weeklyRecap?.id).toBe("r1");
  });

  it("stays closed for a seen recap or a quiet week", async () => {
    h.state.recap = { ...RECAP, seen_at: "2026-10-19T09:00:00Z" };
    await useStore.getState().fetchWeeklyRecap();
    expect(useStore.getState().weeklyRecap).toBeNull();
    h.state.recap = null;
    await useStore.getState().fetchWeeklyRecap();
    expect(useStore.getState().weeklyRecap).toBeNull();
  });

  it("waits until the tutorial is done", async () => {
    useStore.setState({ onboardingCompletedAt: null });
    await useStore.getState().fetchWeeklyRecap();
    expect(useStore.getState().weeklyRecap).toBeNull();
    expect(useStore.getState().fetchNotifications).toHaveBeenCalled();
  });
});

describe("closeWeeklyRecap", () => {
  it("closes the card and marks it seen", async () => {
    await useStore.getState().fetchWeeklyRecap();
    useStore.getState().closeWeeklyRecap();
    expect(useStore.getState().weeklyRecap).toBeNull();
    expect(h.rpc).toHaveBeenCalledWith("mark_weekly_recap_seen", { p_id: "r1" });
    // Actually sent, not just built (the bug: an un-awaited call never fired,
    // so the card came back on every refresh).
    expect(h.state.sent).toContain("mark_weekly_recap_seen");
  });
});
