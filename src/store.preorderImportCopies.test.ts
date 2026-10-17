import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Game } from "./types";

// Importing a wishlist game as a pre-order saves what the player says they
// paid (on its copies) in a follow-up write. That write was built but never
// awaited, and a supabase-js call only sends once something awaits it, so the
// amount was silently dropped. The Supabase boundary is mocked to behave the
// same way: nothing counts as sent until it's awaited.
const h = vi.hoisted(() => {
  const state = { sent: [] as { table: string; values: unknown }[] };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const from = vi.fn((table: string) => {
    let values: unknown = null;
    const chain: any = {
      update: (v: unknown) => {
        values = v;
        return chain;
      },
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      then: (ok: any, err: any) => {
        if (values) state.sent.push({ table, values });
        return Promise.resolve({ data: null, error: null }).then(ok, err);
      },
    };
    return chain;
  });
  const rpc = vi.fn((name: string) => {
    const res = { data: name === "import_from_wishlist" ? { merged_into: null, merged_copies: null } : null, error: null };
    return { single: () => Promise.resolve(res), then: (ok: any, err: any) => Promise.resolve(res).then(ok, err) };
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { state, from, rpc };
});

vi.mock("./lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/supabase")>()),
  supabase: { from: h.from, rpc: h.rpc },
}));

import { useStore } from "./store";

const want: Game = { id: "w1", title: "Upcoming Game", status: "wishlist", addedAt: 1, genres: [] };

beforeEach(() => {
  h.state.sent = [];
  useStore.setState({ cloud: true, userId: "u", games: [want], clearStreak: 0 });
});

describe("pre-order import", () => {
  it("saves what you paid on the copies", async () => {
    const copies = [{ id: "c1", platform: "PC", cost: 59.99 }];
    await useStore.getState().importFromWishlist("w1", { preorder: { expectedOn: "2026-12-01", copies } });
    await vi.waitFor(() =>
      expect(h.state.sent).toContainEqual({ table: "games", values: { copies } }),
    );
  });
});
