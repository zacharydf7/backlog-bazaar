import { describe, it, expect, beforeEach, vi } from "vitest";

// The Activity feed's Show mine switch (issue 337e39ca): the store asks the
// server for your own lines too, keeps asking while older pages load, and
// drops a reply for a switch setting that's since changed. Supabase is mocked.
const h = vi.hoisted(() => {
  const calls: { args: Record<string, unknown>; resolve: (rows: unknown[]) => void }[] = [];
  const rpc = vi.fn(
    (_name: string, args: Record<string, unknown>) =>
      new Promise((resolve) => {
        calls.push({ args, resolve: (rows) => resolve({ data: rows, error: null }) });
      }),
  );
  return { calls, rpc };
});

vi.mock("./lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/supabase")>()),
  supabase: { rpc: h.rpc },
}));

import { useStore } from "./store";

const row = (id: string, actor: string) => ({
  id,
  actor,
  actor_name: actor,
  actor_avatar: null,
  kind: "medal_earned",
  game_title: null,
  detail: { medals: ["Night Owl"] },
  created_at: "2026-10-20T10:00:00Z",
  cheer_count: 0,
  cheered_by_me: false,
  title: null,
  cosmetics: null,
});

beforeEach(() => {
  h.calls.length = 0;
  useStore.setState({ feed: [], feedHasMore: false, feedLoadingMore: false, feedIncludeMine: false });
});

describe("activity feed: Show mine", () => {
  it("asks for my own lines, and keeps asking for older pages", async () => {
    const first = useStore.getState().fetchFeed(true);
    expect(h.calls[0].args).toMatchObject({ p_include_me: true });
    h.calls[0].resolve(Array.from({ length: 30 }, (_, i) => row("e" + i, "me")));
    await first;
    expect(useStore.getState().feedHasMore).toBe(true);

    const more = useStore.getState().loadMoreFeed();
    expect(h.calls[1].args).toMatchObject({ p_include_me: true });
    h.calls[1].resolve([row("old", "me")]);
    await more;
    expect(useStore.getState().feed).toHaveLength(31);
  });

  it("drops an older page whose list was replaced while it loaded", async () => {
    const first = useStore.getState().fetchFeed(false);
    h.calls[0].resolve(Array.from({ length: 30 }, (_, i) => row("f" + i, "sora")));
    await first;
    // Flip the switch, and ask for more before the new first page arrives.
    const flipped = useStore.getState().fetchFeed(true);
    const more = useStore.getState().loadMoreFeed();
    h.calls[1].resolve([row("m1", "me")]);
    await flipped;
    h.calls[2].resolve([row("old", "sora")]);
    await more;
    expect(useStore.getState().feed.map((e) => e.id)).toEqual(["m1"]);
    expect(useStore.getState().feedLoadingMore).toBe(false);
  });

  it("still appends an older page when a line is cheered while it loads", async () => {
    const first = useStore.getState().fetchFeed(false);
    h.calls[0].resolve(Array.from({ length: 30 }, (_, i) => row("f" + i, "sora")));
    await first;
    const more = useStore.getState().loadMoreFeed();
    useStore.setState({ feed: useStore.getState().feed.map((e) => ({ ...e })) }); // as a cheer does
    h.calls[1].resolve([row("old", "sora")]);
    await more;
    expect(useStore.getState().feed).toHaveLength(31);
  });

  it("drops a reply for a switch setting that's since changed", async () => {
    const withMine = useStore.getState().fetchFeed(true);
    const friendsOnly = useStore.getState().fetchFeed(false);
    h.calls[1].resolve([row("f1", "sora")]);
    await friendsOnly;
    h.calls[0].resolve([row("m1", "me"), row("f1", "sora")]);
    await withMine;
    expect(useStore.getState().feed.map((e) => e.id)).toEqual(["f1"]);
  });
});
