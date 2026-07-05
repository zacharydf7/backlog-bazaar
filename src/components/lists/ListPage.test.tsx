import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ListPage } from "./ListPage";
import { useStore } from "../../store";
import type { GameListDetail } from "../../lib/gameLists";

// The add-game box goes through the shared search pipeline — stub it so no
// network is touched (the suite runs offline).
vi.mock("../../lib/gameSearch", () => ({
  searchGameSuggestions: vi.fn().mockResolvedValue([]),
}));

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

const fetchGameList = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchGameList.mockResolvedValue(detail());
  act(() =>
    useStore.setState({
      cloud: true,
      userId: "me",
      games: [],
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
    act(() =>
      useStore.setState({
        games: [{ id: "g9", title: "Chrono Trigger", rawgId: 1, status: "finished", copies: [], genres: [], platforms: [] }] as never,
      }),
    );
    await renderPage();
    expect(screen.getByText("In your library")).toBeTruthy();
    expect((screen.getByRole("link", { name: "Chrono Trigger" }) as HTMLAnchorElement).hash).toBe(
      "#g/g9",
    );
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
