import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Startup must never leave the app on "Loading…" for good, nor open an empty
// account (Supabase gateway incident, 2026-10-23). A load that hangs past
// BOOT_STALL_MS, or fails, flags the loading screen to offer a retry, and a
// slow load that still lands opens the app. Supabase reports an unreachable
// server as an `error` on the result, not a throw, so the failure cases drive
// the real account load through a mocked Supabase boundary that answers that
// way.
const { db, onAuthStateChange } = vi.hoisted(() => ({
  /** Per-table results; unlisted tables answer with no rows. */
  db: { results: {} as Record<string, unknown>, gate: null as Promise<void> | null },
  onAuthStateChange: vi.fn(),
}));

vi.mock("./lib/supabase", async (importActual) => {
  const actual = await importActual<typeof import("./lib/supabase")>();
  // A chainable query: every builder method returns it, and awaiting it gives
  // the table's result (after `gate`, when a test holds the load open).
  const query = (table: string): unknown => {
    const answer = async () => {
      if (db.gate && table === "profiles") await db.gate;
      return db.results[table] ?? { data: table === "app_config" ? null : [], error: null };
    };
    const q: unknown = new Proxy(
      {},
      {
        get: (_, key) =>
          key === "then"
            ? (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => answer().then(resolve, reject)
            : () => q,
      },
    );
    return q;
  };
  return {
    ...actual,
    isCloudConfigured: true,
    supabase: {
      from: query,
      rpc: () => query("rpc"),
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "u1", email: "me@example.com", identities: [] } } } }),
        onAuthStateChange,
      },
    },
  };
});

import { BOOT_STALL_MS, useStore } from "./store";

const UNREACHABLE = { data: null, error: { message: "Gateway Timeout", code: "" } };

function boot() {
  useStore.setState({ initialized: false, ready: false, bootStalled: false });
  return useStore.getState().init();
}

beforeEach(() => {
  vi.useFakeTimers();
  onAuthStateChange.mockReset();
  db.results = {};
  db.gate = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startup", () => {
  it("offers a retry once loading runs long, and still opens the app if it lands", async () => {
    let settle!: () => void;
    db.gate = new Promise<void>((r) => (settle = r));
    db.results.profiles = { data: { display_name: "Me", coins: 120 }, error: null };
    const started = boot();
    await vi.advanceTimersByTimeAsync(BOOT_STALL_MS - 1);
    expect(useStore.getState().bootStalled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(useStore.getState()).toMatchObject({ ready: false, bootStalled: true });

    settle();
    await started;
    expect(useStore.getState()).toMatchObject({ ready: true, bootStalled: false, coins: 120 });
  });

  it("offers a retry, not an empty account, when the profile can't be reached", async () => {
    db.results.profiles = UNREACHABLE;
    await boot();
    expect(useStore.getState()).toMatchObject({ ready: false, bootStalled: true });
    expect(onAuthStateChange).not.toHaveBeenCalled();
  });

  it("offers a retry, not an empty library, when the games can't be reached", async () => {
    db.results.profiles = { data: { display_name: "Me" }, error: null };
    db.results.games = UNREACHABLE;
    await boot();
    expect(useStore.getState()).toMatchObject({ ready: false, bootStalled: true });
  });
});
