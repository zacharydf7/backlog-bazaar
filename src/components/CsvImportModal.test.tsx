import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CsvImportModal } from "./CsvImportModal";
import { useStore } from "../store";
import { searchGameSuggestions } from "../lib/gameSearch";

// The background cover-match pass calls searchGameSuggestions (network). Mock it
// so the tests are deterministic and offline; each test sets its own result.
vi.mock("../lib/gameSearch", () => ({ searchGameSuggestions: vi.fn(async () => []) }));
const mockSearch = vi.mocked(searchGameSuggestions);

function pickFile(csv: string) {
  const file = new File([csv], "games.csv", { type: "text/csv" });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  mockSearch.mockReset();
  mockSearch.mockResolvedValue([]); // default: no catalog match → games stay plain
  act(() =>
    useStore.setState({
      cloud: false, // offline: the real addGame/enrich take their local paths
      games: [],
      platformList: ["PC", "Nintendo Switch"],
    }),
  );
});

describe("CsvImportModal (00efda53)", () => {
  it("previews the plan and imports every addable row through addGame", async () => {
    const addSpy = vi.spyOn(useStore.getState(), "addGame").mockResolvedValue();
    render(<CsvImportModal onClose={() => {}} />);

    pickFile(
      ["Title,Platform,Cost,Status", "Hades,pc,$24.99,finished", "Stray,Nintendo Switch,,wishlist"].join(
        "\n",
      ),
    );

    // The plan summary + per-row preview appear once the file parses.
    expect(await screen.findByText("2 to import")).toBeTruthy();
    expect(screen.getByText("Hades")).toBeTruthy();
    expect(screen.getByText("Stray")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Import 2 games/i }));
    await waitFor(() => expect(addSpy).toHaveBeenCalledTimes(2));

    // Each row rides the normal addGame path with its parsed values.
    const [hadesMeta, hadesStatus, hadesTag] = addSpy.mock.calls[0];
    expect(hadesMeta.title).toBe("Hades");
    expect(hadesMeta.copies?.[0]).toMatchObject({ platform: "PC", cost: 24.99 });
    expect(hadesStatus).toBe("finished");
    expect(hadesTag).toBe("beaten");
    const [strayMeta, strayStatus] = addSpy.mock.calls[1];
    expect(strayMeta.title).toBe("Stray");
    expect(strayStatus).toBe("wishlist");

    // The done state confirms the count.
    expect(await screen.findByText(/Imported 2 games/i)).toBeTruthy();
    addSpy.mockRestore();
  });

  it("shows skipped duplicates in the preview and imports only the rest", async () => {
    act(() =>
      useStore.setState({
        games: [
          {
            id: "g1",
            title: "Hades",
            status: "backlog",
            genres: [],
            platforms: [],
            addedAt: 1,
            copies: [{ id: "c1", platform: "PC" }],
          } as never,
        ],
      }),
    );
    const addSpy = vi.spyOn(useStore.getState(), "addGame").mockResolvedValue();
    render(<CsvImportModal onClose={() => {}} />);
    pickFile("Title,Platform\nHades,PC\nOkami,PC");

    expect(await screen.findByText("1 to import")).toBeTruthy();
    expect(screen.getByText("1 skipped as duplicates")).toBeTruthy();
    expect(screen.getByText("Skipped — duplicate")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Import 1 game/i }));
    await waitFor(() => expect(addSpy).toHaveBeenCalledTimes(1));
    expect(addSpy.mock.calls[0][0].title).toBe("Okami");
    addSpy.mockRestore();
  });

  it("explains an unusable file instead of importing", async () => {
    render(<CsvImportModal onClose={() => {}} />);
    pickFile("Halo\nDoom"); // no Title header row
    expect(await screen.findByText(/No game-title column found/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Import/i })).toBeNull();
  });

  it("links a confident catalog match and reports the covers added (change #1)", async () => {
    mockSearch.mockResolvedValue([
      { title: "Hades", genres: [], image: "hades.png", rawgId: 42 },
    ]);
    const enrichSpy = vi.spyOn(useStore.getState(), "enrichImportedGame").mockResolvedValue();
    render(<CsvImportModal onClose={() => {}} />);
    pickFile("Title,Platform\nHades,PC");

    fireEvent.click(await screen.findByRole("button", { name: /Import 1 game/i }));

    // The background pass finds a match and enriches the just-imported game.
    expect(await screen.findByText(/added cover art to 1/i)).toBeTruthy();
    await waitFor(() => expect(enrichSpy).toHaveBeenCalled());
    const [, match] = enrichSpy.mock.calls[0];
    expect(match.image).toBe("hades.png");
    expect(match.rawgId).toBe(42);
    enrichSpy.mockRestore();
  });

  it("can cancel the background cover pass, keeping everything imported (change #2)", async () => {
    // Hang the first cover search so the pass is mid-flight when we cancel.
    let release!: () => void;
    const pending = new Promise<never[]>((res) => {
      release = () => res([]);
    });
    mockSearch.mockReturnValueOnce(pending).mockResolvedValue([]);
    render(<CsvImportModal onClose={() => {}} />);
    pickFile("Title,Platform\nHades,PC\nOkami,PC");

    fireEvent.click(await screen.findByRole("button", { name: /Import 2 games/i }));
    // Both games import fast; the cover pass starts and shows a Stop control.
    const stop = await screen.findByRole("button", { name: /Stop finding covers/i });
    fireEvent.click(stop);
    act(() => release());

    expect(await screen.findByText(/You stopped early/i)).toBeTruthy();
    // Both games were kept, and the second was never searched (stopped after one).
    expect(useStore.getState().games).toHaveLength(2);
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });
});
