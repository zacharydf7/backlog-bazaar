import { describe, it, expect, beforeEach, vi } from "vitest";

// The cloud path of addCompilation re-reads the authoritative compilation row
// (with the template-cover embed) so a bundle built from a shared template
// carries the moderator cover immediately — regression guard for issue
// 504ca4e3 (collapsed parent card showed the first child's art until reload).
// We mock the Supabase boundary and keep every other real export.
// Hoisted so the (also hoisted) vi.mock factory can close over the spies.
const { rpc, maybeSingle, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  return {
    rpc: vi.fn(),
    maybeSingle,
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
  };
});

vi.mock("./lib/supabase", async (importActual) => {
  const actual = await importActual<typeof import("./lib/supabase")>();
  return { ...actual, supabase: { rpc, from } };
});

import { useStore } from "./store";

const store = () => useStore.getState();

function childRow(over: Record<string, unknown> = {}) {
  return {
    id: "child-1",
    user_id: "u1",
    title: "Game A",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [{ id: "cc1", platform: "Nintendo Switch", cost: 10 }],
    compilation_id: "comp-1",
    compilation_name: "Remaster Collection",
    added_at: new Date().toISOString(),
    ...over,
  };
}

function compRow(over: Record<string, unknown> = {}) {
  return {
    id: "comp-1",
    user_id: "u1",
    title: "Remaster Collection",
    total_cost: 10,
    platform: "Nintendo Switch",
    format: "physical",
    created_at: new Date().toISOString(),
    expanded: true,
    template_id: "tmpl-1",
    carryover_hours: 0,
    parent_image: null,
    copies: [{ id: "cc1", platform: "Nintendo Switch", cost: 10 }],
    released: null,
    ...over,
  };
}

beforeEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
  from.mockClear();
  useStore.setState({ cloud: true, userId: "u1", games: [], compilations: [] });
});

describe("addCompilation cloud cover hydration (issue 504ca4e3)", () => {
  it("carries the linked template's moderator cover onto the new compilation", async () => {
    rpc.mockResolvedValue({ data: [childRow()], error: null });
    // The authoritative re-read returns the embedded template image.
    maybeSingle.mockResolvedValue({
      data: compRow({ compilation_templates: { image: "mod-cover.png" } }),
    });

    await store().addCompilation(
      { title: "Remaster Collection", totalCost: 10, copies: [{ platform: "Nintendo Switch", format: "physical", cost: 10 }] },
      [{ name: "Game A" }],
      "backlog",
      "tmpl-1",
    );

    expect(from).toHaveBeenCalledWith("compilations");
    const comp = store().compilations.find((c) => c.id === "comp-1");
    expect(comp).toBeTruthy();
    // The bug: templateImage was undefined on the optimistic comp, so the
    // collapsed card fell back to the first child's art. It must now be set.
    expect(comp!.templateImage).toBe("mod-cover.png");
  });

  it("still adds the bundle (hand-built fallback) if the re-read returns nothing", async () => {
    rpc.mockResolvedValue({ data: [childRow()], error: null });
    maybeSingle.mockResolvedValue({ data: null });

    await store().addCompilation(
      { title: "Remaster Collection", totalCost: 10, copies: [{ platform: "Nintendo Switch", format: "physical", cost: 10 }] },
      [{ name: "Game A" }],
      "backlog",
      "tmpl-1",
    );

    const comp = store().compilations.find((c) => c.id === "comp-1");
    expect(comp).toBeTruthy();
    expect(comp!.templateImage).toBeUndefined();
    expect(store().games.some((g) => g.compilationId === "comp-1")).toBe(true);
  });
});
