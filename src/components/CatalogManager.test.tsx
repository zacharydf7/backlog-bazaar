import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CatalogManager } from "./CatalogManager";
import { useStore } from "../store";
import type { CommunityCatalogEntry } from "../lib/submissions";
import type { CompilationTemplate, TemplateGame } from "../lib/compilationTemplates";

// Keep the parent-picker's game search deterministic and offline: RAWG resolves
// to one fake suggestion (no catalog row yet), like the AddGameModal tests.
vi.mock("../lib/gamedata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/gamedata")>();
  return {
    ...actual,
    usingRawg: false,
    searchGames: vi.fn(async () => [
      { title: "Mega Man Anthology", genres: [], rawgId: 77, released: "2015-08-25", platforms: ["PC"] },
    ]),
    fetchGameDetails: vi.fn(async () => ({})),
    fetchHltbTimes: vi.fn(async () => null),
  };
});

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
  isLiveService: false,
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

const template: CompilationTemplate = {
  id: "t1",
  title: "Mega Man Legacy Collection",
  games: [{ name: "Mega Man" }, { name: "Mega Man 2" }],
  createdAt: 1,
};

const fetchMock = vi.fn(async () => [owned, orphan]);
const editMock = vi.fn(async () => true);
const deleteMock = vi.fn(async () => true);
const fetchTemplatesMock = vi.fn(async () => [template]);
const editTemplateMock = vi.fn(
  async (_id: string, _title: string, _games: TemplateGame[], _parent: string | null) => true,
);
const setTemplateImageMock = vi.fn(async (_id: string, _image: string | null) => true);
const ensureParentMock = vi.fn(async () => "cat-new");
const searchCatalogGamesMock = vi.fn(async () => [] as never[]);

beforeEach(() => {
  fetchMock.mockClear();
  editMock.mockClear();
  deleteMock.mockClear();
  fetchTemplatesMock.mockClear();
  editTemplateMock.mockClear();
  setTemplateImageMock.mockClear();
  ensureParentMock.mockClear();
  searchCatalogGamesMock.mockClear();
  act(() =>
    useStore.setState({
      isAdmin: true,
      fetchCommunityCatalog: fetchMock,
      adminEditCatalogGame: editMock,
      adminDeleteCatalogGame: deleteMock,
      fetchCompilationCatalog: fetchTemplatesMock,
      adminEditCompilationTemplate: editTemplateMock,
      adminSetCompilationTemplateImage: setTemplateImageMock,
      ensureCatalogParent: ensureParentMock,
      searchCatalogGames: searchCatalogGamesMock,
      fetchCatalogOverrides: vi.fn(async () => ({})),
    }),
  );
});

/** Open the compilation-template editor for the seeded template. */
async function openTemplateEditor() {
  render(<CatalogManager />);
  fireEvent.click(screen.getByRole("button", { name: /Compilations/i }));
  await screen.findByText("Mega Man Legacy Collection");
  fireEvent.click(screen.getByRole("button", { name: /^Edit$/i }));
  await screen.findByText(/Edit compilation/i);
}

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

describe("CatalogManager compilation parent picker", () => {
  it("links a RAWG game the catalog doesn't know yet by creating its row on pick", async () => {
    await openTemplateEditor();

    // The picker searches the full game database, not just catalog rows.
    fireEvent.change(screen.getByLabelText("Parent game"), { target: { value: "Mega Man" } });
    fireEvent.mouseDown(await screen.findByText("Mega Man Anthology"));

    // A RAWG-only pick creates the catalog row (fill-blanks upsert) first…
    await waitFor(() =>
      expect(ensureParentMock).toHaveBeenCalledWith(
        expect.objectContaining({ rawgId: 77, title: "Mega Man Anthology" }),
      ),
    );
    // …then shows the linked-parent chip.
    expect(await screen.findByLabelText("Clear parent game")).toBeTruthy();

    // Saving passes the freshly created catalog id as the parent link.
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(editTemplateMock).toHaveBeenCalled());
    expect(editTemplateMock.mock.calls[0][3]).toBe("cat-new");
  });

  it("links a community game directly by its catalog id (no ensure round-trip)", async () => {
    searchCatalogGamesMock.mockResolvedValueOnce([
      { title: "Homebrew Bundle", genres: [], catalogId: "cat-community" },
    ] as never);
    await openTemplateEditor();

    fireEvent.change(screen.getByLabelText("Parent game"), { target: { value: "Homebrew" } });
    fireEvent.mouseDown(await screen.findByText("Homebrew Bundle"));

    expect(await screen.findByLabelText("Clear parent game")).toBeTruthy();
    expect(ensureParentMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(editTemplateMock).toHaveBeenCalled());
    expect(editTemplateMock.mock.calls[0][3]).toBe("cat-community");
  });
});

describe("CatalogManager compilation parent cover", () => {
  it("saves a newly entered cover URL through the dedicated action", async () => {
    await openTemplateEditor();

    fireEvent.change(screen.getByLabelText(/Parent card cover/i), {
      target: { value: "https://x/legacy-collection.jpg" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() =>
      expect(setTemplateImageMock).toHaveBeenCalledWith("t1", "https://x/legacy-collection.jpg"),
    );
  });

  it("does not touch the cover when it wasn't changed", async () => {
    await openTemplateEditor();
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(editTemplateMock).toHaveBeenCalled());
    expect(setTemplateImageMock).not.toHaveBeenCalled();
  });

  it("clearing the field clears the moderator cover (null, not empty string)", async () => {
    fetchTemplatesMock.mockResolvedValueOnce([{ ...template, image: "https://x/old.jpg" }]);
    await openTemplateEditor();

    fireEvent.change(screen.getByLabelText(/Parent card cover/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => expect(setTemplateImageMock).toHaveBeenCalledWith("t1", null));
  });
});
