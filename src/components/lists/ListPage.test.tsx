import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ListPage } from "./ListPage";
import { useStore } from "../../store";
import type { GameListDetail } from "../../lib/gameLists";

// The add-game box goes through the shared search pipeline — stub it so no
// network is touched (the suite runs offline).
vi.mock("../../lib/gameSearch", () => ({
  searchGameSuggestions: vi.fn().mockResolvedValue({ results: [], providerDown: false }),
}));

/** The approved catalog record behind an entry, as the preview card loads it. */
const catalogRecord = {
  catalogId: "cat-p4g",
  title: "Persona 4 Golden",
  image: "catalog-cover.jpg",
  platforms: ["PC"],
  genres: ["RPG"],
  developers: ["Atlus"],
  released: "2020-06-13",
  hours: 40,
  screenshots: ["shot.jpg"],
  isLiveService: false,
};

const updateList = vi.fn().mockResolvedValue(true);
const deleteList = vi.fn().mockResolvedValue(true);
const addListItem = vi.fn().mockResolvedValue(true);
const updateListItemBlurb = vi.fn().mockResolvedValue(true);
const removeListItem = vi.fn().mockResolvedValue(true);
const reorderGameList = vi.fn().mockResolvedValue(true);

function detail(over: Partial<GameListDetail> = {}): GameListDetail {
  return {
    id: "list-1",
    userId: "me",
    ownerName: "Zach",
    ownerAvatar: null,
    title: "Top 10 JRPGs",
    description: "The greats.",
    visibility: "public",
    createdAt: 0,
    updatedAt: 0,
    items: [
      { id: "i1", rawgId: 1, title: "Chrono Trigger", blurb: "Peak.", rank: 1 },
      { id: "i2", rawgId: 2, title: "Persona 4 Golden", blurb: "", rank: 2 },
    ],
    ...over,
  };
}

/** The viewer's own copy of the list's first entry (matched on rawg id). */
function libraryGame(over: Record<string, unknown> = {}) {
  return {
    id: "g9",
    title: "Chrono Trigger",
    rawgId: 1,
    status: "finished",
    copies: [],
    genres: [],
    platforms: [],
    ...over,
  };
}

const fetchGameList = vi.fn();
const fetchCatalogGame = vi.fn();
const addGame = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "";
  fetchGameList.mockResolvedValue(detail());
  fetchCatalogGame.mockResolvedValue(catalogRecord);
  act(() =>
    useStore.setState({
      cloud: true,
      userId: "me",
      games: [],
      fetchCatalogGame,
      addGame,
      fetchGameList,
      updateList,
      deleteList,
      addListItem,
      updateListItemBlurb,
      removeListItem,
      reorderGameList,
    }),
  );
});

async function renderPage(onBack = () => {}) {
  render(<ListPage listId="list-1" onBack={onBack} />);
  await waitFor(() => expect(screen.queryByText("Top 10 JRPGs")).toBeTruthy());
}

describe("ListPage — owner", () => {
  it("renders the entries in rank order with their blurbs", async () => {
    await renderPage();
    const titles = screen.getAllByText(/Chrono Trigger|Persona 4 Golden/).map((n) => n.textContent);
    expect(titles).toEqual(["Chrono Trigger", "Persona 4 Golden"]);
    expect(screen.getByText("Peak.")).toBeTruthy();
    expect(screen.getByText("2 games")).toBeTruthy();
  });

  it("offers the owner tools: add search, visibility toggle, delete", async () => {
    await renderPage();
    expect(screen.getByPlaceholderText(/Add a game/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Private" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete/ })).toBeTruthy();
  });

  it("changing visibility saves and updates the hint", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Unlisted" }));
    expect(updateList).toHaveBeenCalledWith("list-1", { visibility: "unlisted" });
    expect(screen.getByText(/Anyone with the link/)).toBeTruthy();
  });

  it("edits a blurb in place and saves on blur", async () => {
    await renderPage();
    fireEvent.click(screen.getByText(/Why did this one make the cut/));
    const box = screen.getByPlaceholderText(/Why did this one make the cut/);
    fireEvent.change(box, { target: { value: "Cozy murder mystery." } });
    fireEvent.blur(box);
    expect(updateListItemBlurb).toHaveBeenCalledWith("i2", "Cozy murder mystery.");
    expect(screen.getByText("Cozy murder mystery.")).toBeTruthy();
  });

  it("removes an entry immediately (optimistic) and tells the server", async () => {
    await renderPage();
    fireEvent.click(screen.getByTitle("Remove Chrono Trigger"));
    expect(removeListItem).toHaveBeenCalledWith("i1");
    expect(screen.queryByText("Chrono Trigger")).toBeNull();
  });

  it("deletes the whole list only after confirming, then goes back", async () => {
    const onBack = vi.fn();
    await renderPage(onBack);
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    expect(deleteList).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete list" }));
    expect(deleteList).toHaveBeenCalledWith("list-1");
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });

  it("badges an entry that lives in your library and links to its page", async () => {
    act(() => useStore.setState({ games: [libraryGame()] as never }));
    await renderPage();
    expect(screen.getByText("In your library")).toBeTruthy();
    expect((screen.getByRole("link", { name: "Chrono Trigger" }) as HTMLAnchorElement).hash).toBe(
      "#g/g9",
    );
  });

  // 86d274d1: reorder is handle-only so a phone tap can't shuffle the ranking.
  it("gives every entry a drag handle and doesn't save a reorder on a plain tap", async () => {
    await renderPage();
    expect(screen.getAllByRole("button", { name: /Drag to reorder/i })).toHaveLength(2);
    fireEvent.pointerUp(screen.getByText("Chrono Trigger"));
    expect(reorderGameList).not.toHaveBeenCalled();
  });

  it("opens the game's page when you tap anywhere on an entry you own (86d274d1)", async () => {
    act(() => useStore.setState({ games: [libraryGame()] as never }));
    await renderPage();
    // The row itself, not just the cover or the title link.
    fireEvent.click(screen.getByTitle("Open Chrono Trigger"));
    expect(window.location.hash).toBe("#g/g9");
  });

  // The follow-up report: a list built from wishlisted games opened nothing,
  // because the tap target was gated on the "in your library" match.
  it("opens a wishlisted entry's page too, without claiming it's in your library", async () => {
    act(() => useStore.setState({ games: [libraryGame({ status: "wishlist" })] as never }));
    await renderPage();
    expect(screen.queryByText("In your library")).toBeNull();
    fireEvent.click(screen.getByTitle("Open Chrono Trigger"));
    expect(window.location.hash).toBe("#g/g9");
  });

  // The second follow-up: a list of games you don't own yet (a grail list is
  // nothing else) had no live entry at all, because there is no page to open.
  // Those entries now open the same look-only card a visited game gives you.
  it("previews an entry you don't hold, on the catalog's data", async () => {
    await renderPage();
    expect(screen.queryByTitle("Open Persona 4 Golden")).toBeNull();
    // Awaited: the catalog lookup settles inside the act, not after it.
    await act(async () => {
      fireEvent.click(screen.getByTitle("Preview Persona 4 Golden"));
    });
    expect(fetchCatalogGame).toHaveBeenCalledWith({ rawgId: 2, catalogId: undefined });
    // The card, not a navigation — and it shows the shared catalog length.
    expect(screen.getByLabelText("Close")).toBeTruthy();
    expect(screen.getByText("40h")).toBeTruthy();
    expect(window.location.hash).toBe("");
  });

  it("lets you wishlist or correct a previewed entry without owning it", async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTitle("Preview Persona 4 Golden"));
    });
    // Nobody's copy: no playtime is claimed for it.
    expect(screen.queryByText("Played")).toBeNull();
    // Correcting the shared catalog shouldn't require owning the game: the
    // submission form opens over the card, seeded with the catalog's values.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Suggest edit|Edit game/ }));
    });
    expect(screen.getByRole("heading", { name: /Suggest an edit|Edit game/ })).toBeTruthy();
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe("Persona 4 Golden");
    // The form portals to <body>, so it competes with the card's layer instead
    // of nesting inside it — jsdom can't see stacking, so compare the layers
    // directly. Regression: the form opening BEHIND the card that launched it.
    const layerOf = (el: Element | null | undefined) =>
      Number(/z-\[(\d+)\]/.exec(el?.className ?? "")?.[1] ?? 0);
    const formLayer = layerOf(
      screen.getByRole("heading", { name: /Suggest an edit|Edit game/ }).closest("div.fixed"),
    );
    const cardLayer = layerOf(
      screen
        .getByRole("heading", { level: 2, name: "Persona 4 Golden" })
        .closest("div.fixed"),
    );
    expect(cardLayer).toBeGreaterThan(0); // both layers were actually found
    expect(formLayer).toBeGreaterThan(cardLayer);
    fireEvent.click(screen.getAllByLabelText("Close")[1]); // back to the card
    fireEvent.click(screen.getByRole("button", { name: /^Wishlist$/ }));
    await waitFor(() =>
      expect(addGame).toHaveBeenCalledWith(
        expect.objectContaining({ rawgId: 2, title: "Persona 4 Golden" }),
        "wishlist",
      ),
    );
  });

  it("the row's own controls don't navigate away", async () => {
    act(() => useStore.setState({ games: [libraryGame()] as never }));
    await renderPage();
    fireEvent.click(screen.getByTitle("Remove Chrono Trigger"));
    expect(removeListItem).toHaveBeenCalledWith("i1");
    expect(window.location.hash).toBe("");
    // Opening the blurb editor is an edit, not a navigation.
    fireEvent.click(screen.getAllByTitle("Edit this note")[0]);
    expect(window.location.hash).toBe("");
    expect(screen.getByPlaceholderText(/Why did this one make the cut/)).toBeTruthy();
  });
});

describe("ListPage — visitor & edge states", () => {
  it("renders read-only with the owner byline for someone else's list", async () => {
    act(() => useStore.setState({ userId: "someone-else" }));
    await renderPage();
    expect(screen.getByText("Zach")).toBeTruthy(); // byline → their Bazaar
    expect(screen.queryByPlaceholderText(/Add a game/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
    expect(screen.queryByTitle(/Remove/)).toBeNull();
    // Visibility renders as a chip, not a toggle.
    expect(screen.queryByRole("button", { name: "Private" })).toBeNull();
  });

  it("shows the unavailable panel when the server returns nothing", async () => {
    fetchGameList.mockResolvedValue(null);
    render(<ListPage listId="gone" onBack={() => {}} />);
    await waitFor(() => expect(screen.queryByText(/isn't available/)).toBeTruthy());
  });

  it("hides Copy link on a private list (nothing to share)", async () => {
    fetchGameList.mockResolvedValue(detail({ visibility: "private" }));
    await renderPage();
    expect(screen.queryByRole("button", { name: /Copy link/ })).toBeNull();
    // Flip to public → the share button appears.
    fireEvent.click(screen.getByRole("button", { name: "Public" }));
    expect(screen.getByRole("button", { name: /Copy link/ })).toBeTruthy();
  });
});
