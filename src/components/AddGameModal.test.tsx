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

// A seeded library row matching the mocked "Zelda Tears of the Kingdom"
// suggestion (rawgId 1), for the routing tests below.
function libraryRow(over: Partial<import("../types").Game> = {}): import("../types").Game {
  return {
    id: "owned1",
    title: "Zelda Tears of the Kingdom",
    rawgId: 1,
    genres: [],
    status: "backlog",
    addedAt: 1,
    copies: [{ id: "c1", platform: "PC" }],
    ...over,
  } as import("../types").Game;
}

async function pickZelda() {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "Zelda" } });
  fireEvent.mouseDown(await screen.findByText("Zelda Tears of the Kingdom"));
}

function addCopyOn(platform: string) {
  fireEvent.click(screen.getByRole("button", { name: /Add a copy|Add a version/i }));
  const selects = screen.getAllByLabelText("Platform");
  fireEvent.change(selects[selects.length - 1], { target: { value: platform } });
}

describe("AddGameModal field locking (verified data)", () => {
  it("locks the release date for a recognized game, editable again for customs", async () => {
    render(<AddGameModal onClose={() => {}} />);
    const date = () => screen.getByLabelText(/Release date/i) as HTMLInputElement;
    expect(date().disabled).toBe(false);
    await pickZelda();
    expect(date().disabled).toBe(true); // the catalog supplied 2023-05-12
    // Editing the title reverts to a custom game — the date unlocks.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "My Custom Game" } });
    expect(date().disabled).toBe(false);
  });

  it("hides the free-text Length when HowLongToBeat has times (chips take over)", async () => {
    const gd = await import("../lib/gamedata");
    vi.mocked(gd.fetchHltbTimes).mockResolvedValueOnce({ main: 10, mainExtra: 15, completionist: 20 });
    render(<AddGameModal onClose={() => {}} />);
    expect(screen.getByLabelText(/^Length/i)).toBeTruthy();
    await pickZelda();
    await screen.findByText("Mainline it"); // the HLTB playstyle chips
    expect(screen.queryByLabelText(/^Length/i)).toBeNull();
  });

  it("keeps Length editable when HLTB returns nothing", async () => {
    render(<AddGameModal onClose={() => {}} />);
    await pickZelda(); // default mock resolves null
    expect(screen.getByLabelText(/^Length/i)).toBeTruthy();
  });
});

describe("AddGameModal per-version played inputs", () => {
  it("generates one hours input per platform copy, and none for wishlist", () => {
    render(<AddGameModal onClose={() => {}} />);
    // No copies yet: the generic single Played field.
    expect(screen.getByLabelText(/^Played/i)).toBeTruthy();
    addCopyOn("PC");
    addCopyOn("Nintendo Switch");
    expect(screen.getByLabelText("Hours played on PC")).toBeTruthy();
    expect(screen.getByLabelText("Hours played on Nintendo Switch")).toBeTruthy();
    // A wishlist game hasn't been played — the section disappears entirely.
    fireEvent.click(screen.getByRole("button", { name: "Wishlist" }));
    expect(screen.queryByLabelText(/Hours played/i)).toBeNull();
    expect(screen.queryByLabelText(/^Played/i)).toBeNull();
  });
});

describe("AddGameModal suggestion presence tags", () => {
  it("says a wishlisted match is on the Wishlist, not in the Bazaar (regression)", async () => {
    useStore.setState({ games: [libraryRow({ id: "wish1", status: "wishlist" })] });
    render(<AddGameModal onClose={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Zelda" } });
    await screen.findByText("Zelda Tears of the Kingdom");
    expect(screen.getByText(/on your Wishlist/i)).toBeTruthy();
    expect(screen.queryByText(/in your Bazaar/i)).toBeNull();
    useStore.setState({ games: [] });
  });

  it("names the actual board for owned matches", async () => {
    useStore.setState({ games: [libraryRow({ status: "finished" })] });
    render(<AddGameModal onClose={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Zelda" } });
    await screen.findByText("Zelda Tears of the Kingdom");
    expect(screen.getByText(/in your Finished/i)).toBeTruthy();
    useStore.setState({ games: [] });
  });
});

describe("AddGameModal pre-submission routing", () => {
  it("halts an owned duplicate behind the attach dialog; confirm attaches", async () => {
    // Owned on Switch; adding a PC copy (a genuinely new version) attaches.
    useStore.setState({
      games: [libraryRow({ copies: [{ id: "c1", platform: "Nintendo Switch" }] })],
    });
    const attachSpy = vi.spyOn(useStore.getState(), "attachCopies").mockResolvedValue();
    const onClose = vi.fn();
    render(<AddGameModal onClose={onClose} />);
    await pickZelda();
    addCopyOn("PC");
    fireEvent.click(screen.getByRole("button", { name: /Add to Bazaar/i }));

    // The submission halts on the confirmation dialog.
    expect(await screen.findByText(/attach the new copy/i)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    // Cancel keeps the form intact…
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/attach the new copy/i)).toBeNull();
    expect(attachSpy).not.toHaveBeenCalled();

    // …and confirming attaches to the existing card instead of adding.
    fireEvent.click(screen.getByRole("button", { name: /Add to Bazaar/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Attach copy" }));
    await waitFor(() => expect(attachSpy).toHaveBeenCalled());
    expect(attachSpy.mock.calls[0][0]).toBe("owned1");
    expect(onClose).toHaveBeenCalled();
    attachSpy.mockRestore();
    useStore.setState({ games: [] });
  });

  it("warns before bypassing charters and removes the wishlist entry on confirm", async () => {
    useStore.setState({ games: [libraryRow({ id: "wish1", status: "wishlist", copies: [] })] });
    const addSpy = vi.spyOn(useStore.getState(), "addGame").mockResolvedValue();
    const removeSpy = vi.spyOn(useStore.getState(), "removeGame").mockResolvedValue();
    render(<AddGameModal onClose={() => {}} />);
    await pickZelda();
    addCopyOn("PC");
    fireEvent.click(screen.getByRole("button", { name: /Add to Bazaar/i }));

    expect(await screen.findByText(/bypasses the Import Charter system/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add anyway" }));
    await waitFor(() => expect(removeSpy).toHaveBeenCalledWith("wish1"));
    expect(addSpy).toHaveBeenCalled();
    addSpy.mockRestore();
    removeSpy.mockRestore();
    useStore.setState({ games: [] });
  });

  it("blocks a copy colliding with an owned version on library boards (regression)", async () => {
    // Owned on PC; re-adding a PC copy to the Bazaar used to attach a duplicate.
    useStore.setState({ games: [libraryRow()] });
    render(<AddGameModal onClose={() => {}} />);
    await pickZelda();
    addCopyOn("PC");
    expect(await screen.findByText(/already on your card/i)).toBeTruthy();
    const submit = screen.getByRole("button", { name: /Add to Bazaar/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    useStore.setState({ games: [] });
  });

  it("blocks wishlisting the exact version already owned, inline", async () => {
    useStore.setState({ games: [libraryRow()] });
    render(<AddGameModal onClose={() => {}} defaultDestination="wishlist" />);
    await pickZelda();
    addCopyOn("PC"); // already owned on PC
    expect(await screen.findByText(/You already own/i)).toBeTruthy();
    const submit = screen.getByRole("button", { name: /Add to Wishlist/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    useStore.setState({ games: [] });
  });

  it("says 'already on your Wishlist' — not 'you own it' — for a wishlist-only match (regression)", async () => {
    useStore.setState({
      games: [libraryRow({ id: "wish1", status: "wishlist", copies: [{ id: "c1", platform: "PC" }] })],
    });
    render(<AddGameModal onClose={() => {}} defaultDestination="wishlist" />);
    await pickZelda();
    // No new version picked: nothing to append, so the add is blocked — but the
    // game is only WISHLISTED, so it must not claim ownership.
    expect(await screen.findByText(/already on your Wishlist/i)).toBeTruthy();
    expect(screen.queryByText(/You already own/i)).toBeNull();

    // Re-requesting a version the entry already lists names it accurately too.
    addCopyOn("PC");
    expect(await screen.findByText(/Your Wishlist already lists/i)).toBeTruthy();
    expect(screen.queryByText(/You already own/i)).toBeNull();
    useStore.setState({ games: [] });
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
