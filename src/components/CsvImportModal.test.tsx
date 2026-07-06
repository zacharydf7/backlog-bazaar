import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CsvImportModal } from "./CsvImportModal";
import { useStore } from "../store";

function pickFile(csv: string) {
  const file = new File([csv], "games.csv", { type: "text/csv" });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  act(() =>
    useStore.setState({
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
});
