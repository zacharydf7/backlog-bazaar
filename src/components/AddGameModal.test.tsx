import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddGameModal, destinationNoun, showAddMissingPrompt, sortByRelevance } from "./AddGameModal";
import { useStore } from "../store";

describe("sortByRelevance", () => {
  it("floats an exact match to the top even if it was last (regression)", () => {
    // Mirrors the bug: RAWG fuzzy matches first, the exact community match last.
    const list = [
      { title: "RollerCoaster Tycoon 3: Complete Edition" },
      { title: "Mortal Kombat Komplete Edition" },
      { title: "Grand Theft Auto IV: Complete Edition" },
      { title: "Lies of P: Complete Edition" },
    ];
    const out = sortByRelevance(list, "Lies of P: Complete Edition");
    expect(out[0].title).toBe("Lies of P: Complete Edition");
  });

  it("ranks exact > prefix > substring and is stable within a rank", () => {
    const list = [
      { title: "Zelda II" }, // prefix
      { title: "The Legend of Zelda" }, // substring
      { title: "Zelda" }, // exact
      { title: "Zelda Skyward Sword" }, // prefix (after Zelda II, stable)
    ];
    expect(sortByRelevance(list, "zelda").map((x) => x.title)).toEqual([
      "Zelda",
      "Zelda II",
      "Zelda Skyward Sword",
      "The Legend of Zelda",
    ]);
  });

  it("leaves the list untouched for an empty query", () => {
    const list = [{ title: "B" }, { title: "A" }];
    expect(sortByRelevance(list, "  ").map((x) => x.title)).toEqual(["B", "A"]);
  });
});

describe("destinationNoun", () => {
  it("names the board each destination adds to", () => {
    expect(destinationNoun("backlog")).toBe("Bazaar");
    expect(destinationNoun("wishlist")).toBe("Wishlist");
    expect(destinationNoun("finished")).toBe("Finished");
  });
});

describe("showAddMissingPrompt", () => {
  const base = { title: "Pokemon Pokopia", loading: false, error: null, resultCount: 0 };

  it("shows when a real query returns nothing and no game is picked", () => {
    expect(showAddMissingPrompt(base)).toBe(true);
  });

  it("hides once a game is picked, even though the dropdown cleared (regression)", () => {
    // Picking a community game sets catalogId; a RAWG game sets rawgId. Either
    // means the empty `results` is from the pick, not a failed search.
    expect(showAddMissingPrompt({ ...base, catalogId: "cat1" })).toBe(false);
    expect(showAddMissingPrompt({ ...base, rawgId: 42 })).toBe(false);
  });

  it("hides while loading, on error, with results, or for a too-short query", () => {
    expect(showAddMissingPrompt({ ...base, loading: true })).toBe(false);
    expect(showAddMissingPrompt({ ...base, error: "boom" })).toBe(false);
    expect(showAddMissingPrompt({ ...base, resultCount: 3 })).toBe(false);
    expect(showAddMissingPrompt({ ...base, title: "p" })).toBe(false);
  });
});

// Keep the autocomplete deterministic and offline: a typed query resolves to one
// fake suggestion, and the detail/length lookups are no-ops.
vi.mock("../lib/gamedata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/gamedata")>();
  return {
    ...actual,
    usingRawg: false,
    searchGames: vi.fn(async () => [
      { title: "Zelda Tears of the Kingdom", genres: [], rawgId: 1, released: "2023-05-12", hours: 50, platforms: ["PC"] },
    ]),
    fetchGameDetails: vi.fn(async () => ({})),
    fetchHltbTimes: vi.fn(async () => null),
  };
});

// The destination chips have exact accessible names ("Bazaar"/"Wishlist"/
// "Finished") — matched precisely so we don't also catch the "Add to Bazaar"
// submit button.
function pressed(name: string): string | null {
  return screen.getByRole("button", { name }).getAttribute("aria-pressed");
}

describe("AddGameModal default destination", () => {
  it("defaults to the Bazaar when no context is given", () => {
    render(<AddGameModal onClose={() => {}} />);
    expect(pressed("Bazaar")).toBe("true");
    expect(pressed("Wishlist")).toBe("false");
  });

  it("honours the context-derived default destination", () => {
    render(<AddGameModal onClose={() => {}} defaultDestination="wishlist" />);
    expect(pressed("Wishlist")).toBe("true");
    expect(pressed("Bazaar")).toBe("false");
  });

  it("retitles the modal to match the chosen destination", () => {
    render(<AddGameModal onClose={() => {}} />);
    const heading = () => screen.getByRole("heading", { level: 2 }).textContent;
    expect(heading()).toBe("Add a game to your Bazaar");
    fireEvent.click(screen.getByRole("button", { name: "Wishlist" }));
    expect(heading()).toBe("Add a game to your Wishlist");
    fireEvent.click(screen.getByRole("button", { name: "Finished" }));
    expect(heading()).toBe("Add a game to your Finished");
  });
});

describe("AddGameModal closing", () => {
  it("does not close when the backdrop is clicked (only the ✕ should)", () => {
    const onClose = vi.fn();
    const { container } = render(<AddGameModal onClose={onClose} />);
    fireEvent.click(container.firstChild as Element); // the backdrop
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the ✕ is clicked", () => {
    const onClose = vi.fn();
    render(<AddGameModal onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("AddGameModal request-a-new-addition escape hatch", () => {
  it("always offers 'Request a new addition', even on an exact-title match", async () => {
    render(<AddGameModal onClose={() => {}} />);
    const input = screen.getByRole("combobox");
    // Type the exact title the mocked search returns, so an exact match exists —
    // which used to hide the escape hatches.
    fireEvent.change(input, { target: { value: "Zelda Tears of the Kingdom" } });

    // The static catalog-request option appears once the (exact-match) results
    // load — it used to be hidden whenever an exact title match was listed.
    const request = await screen.findByText(/Request a new addition/i);
    fireEvent.mouseDown(request);

    // It opens the new-game submission form (portaled to <body>).
    expect(await screen.findByRole("heading", { name: /new game/i })).toBeTruthy();
  });
});

describe("AddGameModal missing-platform escape hatch", () => {
  it("files a platforms-only suggestion when you own it on an unlisted platform", async () => {
    // The picked game is verified for PC only; the user owns it on Switch too.
    const submitSpy = vi
      .spyOn(useStore.getState(), "submitGameSubmission")
      .mockResolvedValue(true);

    render(<AddGameModal onClose={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Zelda" } });
    fireEvent.mouseDown(await screen.findByText("Zelda Tears of the Kingdom")); // pick it

    // Restricted to PC → the "Missing platform?" hatch appears; open it.
    fireEvent.click(await screen.findByText(/Missing platform\?/i));

    // Add a copy on a platform the game isn't listed on.
    fireEvent.click(screen.getByRole("button", { name: /Add a copy/i }));
    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "Nintendo Switch" } });

    fireEvent.click(screen.getByRole("button", { name: /Add to Bazaar/i }));

    await waitFor(() => expect(submitSpy).toHaveBeenCalled());
    const arg = submitSpy.mock.calls[0][0];
    expect(arg.kind).toBe("edit");
    expect(arg.rawgId).toBe(1);
    expect(arg.proposed.platforms).toEqual(expect.arrayContaining(["PC", "Nintendo Switch"]));
    submitSpy.mockRestore();
  });

  it("does not show the hatch (or file anything) for a game with no release list", async () => {
    const submitSpy = vi
      .spyOn(useStore.getState(), "submitGameSubmission")
      .mockResolvedValue(true);
    // Search returns a game with no platforms → choices already span the master
    // list, so there's nothing to be "missing" from.
    const gd = await import("../lib/gamedata");
    vi.mocked(gd.searchGames).mockResolvedValueOnce([
      { title: "Untracked Game", genres: [], rawgId: 9, released: "", hours: undefined } as never,
    ]);

    render(<AddGameModal onClose={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Untracked" } });
    fireEvent.mouseDown(await screen.findByText("Untracked Game"));

    expect(screen.queryByText(/Missing platform\?/i)).toBeNull();
    submitSpy.mockRestore();
  });
});

describe("AddGameModal suggestions", () => {
  it("lets you dismiss the suggestions to keep a custom title", async () => {
    render(<AddGameModal onClose={() => {}} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Zelda" } });

    // Suggestion shows up after the debounced search resolves.
    await screen.findByText("Zelda Tears of the Kingdom");

    // Tapping the "add as custom game" escape hatch clears the dropdown without
    // wiping what was typed.
    fireEvent.mouseDown(screen.getByText(/as a custom game/i));
    expect(screen.queryByText("Zelda Tears of the Kingdom")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("Zelda");
  });
});
