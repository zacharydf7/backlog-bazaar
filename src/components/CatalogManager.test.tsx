import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CatalogManager } from "./CatalogManager";
import { useStore } from "../store";
import type { CommunityCatalogEntry } from "../lib/submissions";

const owned: CommunityCatalogEntry = {
  id: "c1",
  title: "Xenoblade Chronicles",
  image: "https://x/cover.jpg",
  platforms: ["Nintendo Switch 2"],
  genres: ["RPG"],
  developers: ["Monolith Soft"],
  released: "2026-06-09",
  hours: 60,
  screenshots: [],
  ownerCount: 2,
  createdAt: 1,
  updatedAt: 1,
};
const orphan: CommunityCatalogEntry = {
  ...owned,
  id: "c2",
  title: "Some Indie Game",
  ownerCount: 0,
};

const fetchMock = vi.fn(async () => [owned, orphan]);
const editMock = vi.fn(async () => true);
const deleteMock = vi.fn(async () => true);

beforeEach(() => {
  fetchMock.mockClear();
  editMock.mockClear();
  deleteMock.mockClear();
  act(() =>
    useStore.setState({
      isAdmin: true,
      fetchCommunityCatalog: fetchMock,
      adminEditCatalogGame: editMock,
      adminDeleteCatalogGame: deleteMock,
    }),
  );
});

describe("CatalogManager", () => {
  it("lists community entries with their owner counts", async () => {
    render(<CatalogManager />);
    expect(await screen.findByText("Xenoblade Chronicles")).toBeTruthy();
    expect(screen.getByText("Some Indie Game")).toBeTruthy();
    expect(screen.getByText(/2 libraries/i)).toBeTruthy();
  });

  it("filters by title", async () => {
    render(<CatalogManager />);
    await screen.findByText("Xenoblade Chronicles");
    fireEvent.change(screen.getByPlaceholderText(/Search community games/i), {
      target: { value: "indie" },
    });
    expect(screen.queryByText("Xenoblade Chronicles")).toBeNull();
    expect(screen.getByText("Some Indie Game")).toBeTruthy();
  });

  it("blocks deleting an owned entry but allows an unowned one", async () => {
    render(<CatalogManager />);
    await screen.findByText("Xenoblade Chronicles");
    // The owned entry shows a non-actionable "Can't delete" marker, not a button.
    expect(screen.getByText(/Can't delete/i)).toBeTruthy();
    // The unowned entry has a Delete button → confirm → calls the store.
    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("c2"));
  });

  it("opens the editor for an entry", async () => {
    render(<CatalogManager />);
    await screen.findByText("Xenoblade Chronicles");
    fireEvent.click(screen.getAllByRole("button", { name: /^Edit$/i })[0]);
    expect(await screen.findByText(/Edit catalog entry/i)).toBeTruthy();
  });
});
