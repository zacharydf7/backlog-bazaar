import { describe, it, expect, beforeEach, vi } from "vitest";

// Time already played, entered when adding a game, is catch-up, not this
// week's play (owner reports, 2026-10-17): the store sends it through
// set_platform_playtime, which the server logs as typed catch-up
// (src/lib/playtimeSource.sql.test.ts), never as a plain played_hours update.
// The Supabase boundary is mocked.
const h = vi.hoisted(() => {
  const state = {
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
    updates: [] as Record<string, unknown>[],
  };
  const row = {
    id: "new-game", user_id: "u", title: "Disney Dreamlight Valley", status: "playing",
    played_hours: 0, genres: [], platforms: [], copies: [], added_at: "2026-10-10T18:47:25Z",
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const result = { data: row, error: null };
  const chain: any = new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === "then") return (ok: any, err: any) => Promise.resolve(result).then(ok, err);
        if (key === "single" || key === "maybeSingle") return () => Promise.resolve(result);
        if (key === "update")
          return (values: Record<string, unknown>) => {
            state.updates.push(values);
            return chain;
          };
        return () => chain;
      },
    },
  );
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    state.rpcCalls.push({ name, args });
    const res = { data: name === "set_platform_playtime" ? 356 : null, error: null };
    return { single: () => Promise.resolve(res), then: (ok: any, err: any) => Promise.resolve(res).then(ok, err) };
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { state, rpc, from: vi.fn(() => chain) };
});

vi.mock("./lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/supabase")>()),
  supabase: { from: h.from, rpc: h.rpc },
}));

import { useStore } from "./store";

beforeEach(() => {
  h.state.rpcCalls = [];
  h.state.updates = [];
  useStore.setState({ cloud: true, userId: "u", games: [], platformList: ["PlayStation 5", "PC"] });
});

describe("starting playtime at add", () => {
  it("goes through the catch-up call to the single owned copy, not a plain update", async () => {
    await useStore.getState().addGame(
      {
        title: "Disney Dreamlight Valley",
        genres: [],
        playedHours: 356,
        copies: [{ id: "c1", platform: "PlayStation 5", format: "digital" }],
      },
      "playing",
    );
    const calls = h.state.rpcCalls.filter((c) => c.name === "set_platform_playtime");
    expect(calls).toEqual([
      {
        name: "set_platform_playtime",
        args: {
          p_game: "new-game",
          p_platform: "PlayStation 5",
          p_format: "digital",
          p_hours: 356,
        },
      },
    ]);
    expect(h.state.updates.some((u) => "played_hours" in u)).toBe(false);
  });

  it("sends nothing when no time was entered", async () => {
    await useStore.getState().addGame({ title: "Fresh", genres: [] }, "backlog");
    expect(h.state.rpcCalls.some((c) => c.name === "set_platform_playtime")).toBe(false);
  });
});
