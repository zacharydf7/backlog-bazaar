import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SuggestEditButton } from "./GameSubmissionForm";
import type { Game } from "../types";

// A minimal mocked store: the form only needs these three.
const { store } = vi.hoisted(() => ({
  store: {
    submitGameSubmission: vi.fn(async (_input: unknown) => true),
    uploadCatalogCover: vi.fn(async () => null),
    submissionReward: 10,
  },
}));
vi.mock("../store", () => ({ useStore: () => store }));

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

  it("carries the developer edit through to the submission", async () => {
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <SuggestEditButton game={game} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Suggest edit/i }));

    // The developer field is a single comma-delimited text input.
    const dev = screen.getByLabelText(/Developer/i);
    expect((dev as HTMLInputElement).value).toBe("Team Cherry");
    fireEvent.change(dev, { target: { value: "Team Cherry, CD PROJEKT RED" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit for review/i }));

    await waitFor(() => expect(store.submitGameSubmission).toHaveBeenCalledTimes(1));
    const arg = store.submitGameSubmission.mock.calls[0][0] as {
      proposed: { developers: string[] };
    };
    expect(arg.proposed.developers).toEqual(["Team Cherry", "CD PROJEKT RED"]);
  });
});
