import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SuggestEditButton } from "./GameSubmissionForm";
import type { Game } from "../types";

// A minimal mocked store: the form only needs these. `can` drives whether a
// moderator edits directly vs. files a suggestion.
const { store } = vi.hoisted(() => ({
  store: {
    submitGameSubmission: vi.fn(async (_input: unknown) => true),
    uploadCatalogCover: vi.fn(async (): Promise<string | null> => null),
    fetchGameScreenshots: vi.fn(async () => [] as string[]),
    submissionReward: 10,
    can: vi.fn((_key: string) => false),
    // Controlled taxonomy master lists that drive the platform/genre dropdowns.
    platformList: ["PC", "PlayStation 4", "PlayStation 5", "Nintendo Switch", "Xbox Series X/S"],
    genreList: ["Action", "Adventure", "RPG", "Indie"],
  },
}));
// Support both useStore() and useStore(selector), the two call styles the form
// and its sub-components use.
vi.mock("../store", () => ({
  useStore: (sel?: (s: typeof store) => unknown) => (sel ? sel(store) : store),
}));

const game: Game = {
  id: "g1",
  title: "Hollow Knight",
  status: "backlog",
  addedAt: 0,
  genres: [],
  platforms: ["PC"],
  developers: ["Team Cherry"],
};

beforeEach(() => {
  store.submitGameSubmission.mockClear();
  store.uploadCatalogCover.mockReset();
  store.uploadCatalogCover.mockResolvedValue(null);
  store.can.mockReturnValue(false);
});

describe("moderator direct edit", () => {
  it("labels the action as a direct edit (no review) when the user can moderate", async () => {
    store.can.mockReturnValue(true);
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <SuggestEditButton game={game} />
      </form>,
    );
    // The trigger reads "Edit game", not "Suggest edit".
    fireEvent.click(screen.getByRole("button", { name: /Edit game/i }));
    // The form commits directly: a "Save changes" button and no "for review" copy.
    expect(screen.getByRole("button", { name: /Save changes/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Submit for review/i })).toBeNull();
    expect(screen.getByText(/no review needed/i)).toBeTruthy();
  });

  it("lets a moderator edit the release date and sends it in the proposal", async () => {
    store.can.mockReturnValue(true);
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <SuggestEditButton game={game} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit game/i }));

    // The moderator-only Release date input is present (it's hidden for regular
    // users — see the round-trip test below) and its value flows into the proposal.
    const date = screen.getByLabelText(/Release date/i);
    fireEvent.change(date, { target: { value: "2017-02-24" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => expect(store.submitGameSubmission).toHaveBeenCalledTimes(1));
    const arg = store.submitGameSubmission.mock.calls[0][0] as {
      proposed: { released: string };
    };
    expect(arg.proposed.released).toBe("2017-02-24");
  });
});

describe("SuggestEditButton inside another form", () => {
  it("does not trigger the enclosing form's submit (no double save)", async () => {
    // Mirrors the Edit Game screen: the Suggest-edit button lives inside the
    // game's own <form>. Submitting a suggestion must NOT also run that form.
    const outerSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={outerSubmit}>
        <SuggestEditButton game={game} />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Suggest edit/i }));
    // Make a real change so the suggestion is valid and actually submits.
    const title = screen.getByDisplayValue("Hollow Knight");
    fireEvent.change(title, { target: { value: "Hollow Knight: Voidheart" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit for review/i }));

    await waitFor(() => expect(store.submitGameSubmission).toHaveBeenCalledTimes(1));
    expect(outerSubmit).not.toHaveBeenCalled();
  });

  it("adds platforms by picking from the controlled master list", async () => {
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <SuggestEditButton game={game} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Suggest edit/i }));

    // Platforms are chosen from a dropdown (no free text). Pick two; "PC" is
    // already selected (from the game) and so isn't offered again.
    const add = screen.getByLabelText(/Add platforms/i);
    fireEvent.change(add, { target: { value: "PlayStation 4" } });
    fireEvent.change(add, { target: { value: "Nintendo Switch" } });

    fireEvent.click(screen.getByRole("button", { name: /Submit for review/i }));
    await waitFor(() => expect(store.submitGameSubmission).toHaveBeenCalledTimes(1));
    const arg = store.submitGameSubmission.mock.calls[0][0] as {
      proposed: { platforms: string[] };
    };
    // The pre-existing "PC" stays; the two picked platforms are appended.
    expect(arg.proposed.platforms).toEqual(["PC", "PlayStation 4", "Nintendo Switch"]);
  });

  it("hides the genre/developer/release-date inputs from regular users but round-trips their baselines", async () => {
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <SuggestEditButton game={game} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Suggest edit/i }));

    // A regular user gets no genre/developer inputs, and no release-date input
    // (that one is moderator-only — covered above).
    expect(screen.queryByLabelText(/Developer/i)).toBeNull();
    expect(screen.queryByText(/Release date/i)).toBeNull();
    expect(screen.queryByText(/^Genres$/i)).toBeNull();

    // A real edit still submits — and the retired fields carry their baseline
    // values through untouched, so approval can never wipe legacy catalog data.
    fireEvent.change(screen.getByLabelText(/Estimated playtime/i), {
      target: { value: "12h" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit for review/i }));

    await waitFor(() => expect(store.submitGameSubmission).toHaveBeenCalledTimes(1));
    const arg = store.submitGameSubmission.mock.calls[0][0] as {
      proposed: { developers: string[]; genres: string[]; released: string; hours: number };
    };
    expect(arg.proposed.developers).toEqual(["Team Cherry"]);
    expect(arg.proposed.genres).toEqual([]);
    expect(arg.proposed.released).toBe("");
    expect(arg.proposed.hours).toBe(12);
  });

  it("uploads several screenshots selected at once", async () => {
    store.uploadCatalogCover
      .mockResolvedValueOnce("https://x/s1.jpg")
      .mockResolvedValueOnce("https://x/s2.jpg");
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <SuggestEditButton game={game} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Suggest edit/i }));

    // The screenshots picker is the multi-select file input (portaled to body).
    const input = document.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    const f1 = new File(["a"], "a.png", { type: "image/png" });
    const f2 = new File(["b"], "b.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [f1, f2] } });

    await waitFor(() => expect(store.uploadCatalogCover).toHaveBeenCalledTimes(2));
    expect(await screen.findByAltText("Screenshot 1")).toBeTruthy();
    expect(screen.getByAltText("Screenshot 2")).toBeTruthy();
  });
});
