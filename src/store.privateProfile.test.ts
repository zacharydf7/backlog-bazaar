import { describe, it, expect, beforeEach, vi } from "vitest";

// Visiting a hard-private profile: view_profile returns no rows, which
// .single() surfaces as PGRST116. The store must show a human notice instead
// of the raw PostgREST error, and must not enter a broken visiting session
// (issue e3242526). Mock only the Supabase boundary; keep every real export.
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("./lib/supabase", async (importActual) => {
  const actual = await importActual<typeof import("./lib/supabase")>();
  return { ...actual, supabase: { rpc } };
});

import { useStore } from "./store";

const store = () => useStore.getState();

beforeEach(() => {
  rpc.mockReset();
  useStore.setState({ cloud: true, userId: "me", viewing: null, error: null });
});

describe("openUserBazaar — private profile (e3242526)", () => {
  it("shows a friendly notice when the profile is private (no rows → PGRST116)", async () => {
    rpc.mockImplementation((fn: string) =>
      fn === "view_profile"
        ? {
            single: () =>
              Promise.resolve({
                data: null,
                error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
              }),
          }
        : { data: [], error: null },
    );

    await store().openUserBazaar("private-user");

    expect(store().viewing).toBeNull();
    expect(store().viewingLoading).toBe(false);
    expect(store().error).toBe("That profile is private or no longer exists.");
  });

  it("keeps surfacing real errors verbatim", async () => {
    rpc.mockImplementation((fn: string) =>
      fn === "view_profile"
        ? { single: () => Promise.resolve({ data: null, error: { code: "XX000", message: "boom" } }) }
        : { data: [], error: null },
    );

    await store().openUserBazaar("someone");

    expect(store().viewing).toBeNull();
    expect(store().error).toBe("boom");
  });
});
