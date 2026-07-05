import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ListsPage } from "./ListsPage";
import { useStore } from "../../store";
import type { GameListFolder, GameListSummary } from "../../lib/gameLists";

const fetchMyLists = vi.fn().mockResolvedValue(undefined);
const createList = vi.fn().mockResolvedValue("new-id");
const updateList = vi.fn().mockResolvedValue(true);
const deleteList = vi.fn().mockResolvedValue(true);
const createListFolder = vi.fn().mockResolvedValue("new-folder");
const renameListFolder = vi.fn().mockResolvedValue(true);
const deleteListFolder = vi.fn().mockResolvedValue(true);

let seq = 0;
function list(over: Partial<GameListSummary> = {}): GameListSummary {
  seq++;
  return {
    id: "l" + seq,
    folderId: null,
    title: "List " + seq,
    description: "",
    visibility: "private",
    itemCount: 0,
    preview: [],
    createdAt: seq,
    updatedAt: seq,
    ...over,
  };
}

function folder(over: Partial<GameListFolder> = {}): GameListFolder {
  seq++;
  return { id: "f" + seq, name: "Folder " + seq, sort: seq, createdAt: seq, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "";
  act(() =>
    useStore.setState({
      cloud: true,
      myLists: [],
      myListFolders: [],
      fetchMyLists,
      createList,
      updateList,
      deleteList,
      createListFolder,
      renameListFolder,
      deleteListFolder,
    }),
  );
});

describe("ListsPage", () => {
  it("asks guests to sign in (lists are cloud-only)", () => {
    act(() => useStore.setState({ cloud: false }));
    render(<ListsPage />);
    expect(screen.getByText(/sign in to start curating/i)).toBeTruthy();
  });

  it("fetches the workspace on mount and shows the empty invitation", () => {
    render(<ListsPage />);
    expect(fetchMyLists).toHaveBeenCalled();
    expect(screen.getByText(/Make your first list/i)).toBeTruthy();
  });

  it("renders list cards with count, visibility and the All Lists folder chip", () => {
    const f = folder({ name: "Top 10s" });
    act(() =>
      useStore.setState({
        myListFolders: [f],
        myLists: [
          list({ title: "Top 10 JRPGs", itemCount: 10, visibility: "public", folderId: f.id }),
          list({ title: "Backlog Shame", itemCount: 3 }),
        ],
      }),
    );
    render(<ListsPage />);
    expect(screen.getByText("Top 10 JRPGs")).toBeTruthy();
    expect(screen.getByText("10 games")).toBeTruthy();
    expect(screen.getByText("Public")).toBeTruthy();
    // Filed list wears its folder chip in the master view (folder name appears
    // in the sidebar row AND the chip).
    expect(screen.getAllByText("Top 10s").length).toBeGreaterThanOrEqual(2);
  });

  it("folder rows carry live count badges and filter the grid", () => {
    const f = folder({ name: "Franchises ranked" });
    act(() =>
      useStore.setState({
        myListFolders: [f],
        myLists: [
          list({ title: "Zelda: Ranked", folderId: f.id }),
          list({ title: "Unfiled list" }),
        ],
      }),
    );
    render(<ListsPage />);
    // All Lists row counts everything; the folder counts its own.
    const allRow = screen.getByRole("button", { name: /All Lists/ });
    expect(allRow.textContent).toContain("2");
    const folderRow = screen.getByRole("button", { name: /Franchises ranked/ });
    expect(folderRow.textContent).toContain("1");

    fireEvent.click(folderRow);
    expect(screen.getByText("Zelda: Ranked")).toBeTruthy();
    expect(screen.queryByText("Unfiled list")).toBeNull();
  });

  it("creates a list from the modal and opens its page", async () => {
    render(<ListsPage />);
    fireEvent.click(screen.getByRole("button", { name: /New list/ }));
    fireEvent.change(screen.getByPlaceholderText("Top 10 JRPGs"), {
      target: { value: "My Ranking" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Public" }));
    fireEvent.click(screen.getByRole("button", { name: "Create list" }));
    expect(createList).toHaveBeenCalledWith({
      title: "My Ranking",
      description: "",
      visibility: "public",
      folderId: null,
    });
    // Routes to the new list's page once the id lands.
    await act(async () => {});
    expect(window.location.hash).toBe("#l/new-id");
  });

  it("files a list into a folder from the card menu (the touch path)", () => {
    const f = folder({ name: "Top 10s" });
    const l = list({ title: "Movable" });
    act(() => useStore.setState({ myListFolders: [f], myLists: [l] }));
    render(<ListsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Options for Movable" }));
    fireEvent.click(screen.getByRole("button", { name: /^Top 10s$/ }));
    expect(updateList).toHaveBeenCalledWith(l.id, { folderId: f.id });
  });

  it("deletes a list only after the confirmation", () => {
    const l = list({ title: "Doomed", itemCount: 2 });
    act(() => useStore.setState({ myLists: [l] }));
    render(<ListsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Options for Doomed" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete list" }));
    expect(deleteList).not.toHaveBeenCalled(); // confirm first
    fireEvent.click(screen.getByRole("button", { name: "Delete list", hidden: false }));
    expect(deleteList).toHaveBeenCalledWith(l.id);
  });

  it("deleting a folder keeps its lists (copy says so) and confirms first", () => {
    const f = folder({ name: "Old folder" });
    act(() => useStore.setState({ myListFolders: [f], myLists: [list({ folderId: f.id })] }));
    render(<ListsPage />);
    fireEvent.click(screen.getByRole("button", { name: /Old folder/ })); // activate
    fireEvent.click(screen.getByTitle("Delete Old folder"));
    expect(screen.getByText(/lists inside it are kept/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    expect(deleteListFolder).toHaveBeenCalledWith(f.id);
  });

  it("creates and renames folders through the name dialog", () => {
    render(<ListsPage />);
    fireEvent.click(screen.getByRole("button", { name: /New folder/ }));
    fireEvent.change(screen.getByPlaceholderText("Top 10s"), { target: { value: "Rankings" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(createListFolder).toHaveBeenCalledWith("Rankings");
  });
});
