import { describe, it, expect, beforeEach, vi } from "vitest";

// The menu badge counts challenge rewards waiting to be claimed (issue
// 5aa51ab1), so evaluating challenges, which runs at sign-in, loads the list
// even before the Challenges page has ever been opened. The Supabase boundary
// is mocked.
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("./lib/supabase", async (importActual) => {
  const actual = await importActual<typeof import("./lib/supabase")>();
  return { ...actual, supabase: { rpc } };
});

import { useStore } from "./store";

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => ({ data: name === "evaluate_challenges" ? [] : {}, error: null }));
  useStore.setState({ cloud: true, challenges: null });
});

describe("evaluateChallenges", () => {
  it("loads the challenge list even when the page was never opened", async () => {
    expect(await useStore.getState().evaluateChallenges()).toBe(true);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["evaluate_challenges", "list_challenges"]);
  });

  it("reports a failed load", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "list_challenges" ? { data: null, error: { message: "down" } } : { data: [], error: null },
    );
    expect(await useStore.getState().evaluateChallenges()).toBe(false);
  });
});
