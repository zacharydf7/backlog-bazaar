import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GamePreviewModal } from "./GamePreviewModal";
import type { Game } from "../../types";

const shared: Game = {
  id: "s1",
  title: "Tunic",
  status: "finished",
  genres: ["Adventure"],
  platforms: [],
  copies: [{ id: "c1", platform: "PC", format: "digital", cost: 25 }],
  playedHours: 12,
  addedAt: 1,
} as Game;

describe("GamePreviewModal (chat share)", () => {
  it("renders the look-only detail for a game outside any local library", () => {
    render(<GamePreviewModal game={shared} hideSpend={false} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Tunic" })).toBeTruthy();
    expect(screen.getByText("12h")).toBeTruthy(); // Played stat
    expect(screen.getByText(/Spent \$25/)).toBeTruthy();
    // Look-only: no editors anywhere.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/Add a copy/i)).toBeNull();
  });

  it("hides spend when the owner asked for it", () => {
    render(<GamePreviewModal game={shared} hideSpend onClose={vi.fn()} />);
    expect(screen.queryByText(/Spent/)).toBeNull();
  });

  // A list entry's card: the record is a catalog stand-in, not anyone's copy.
  it("drops the Played stat and opens up Suggest edit in catalog-only mode", () => {
    render(
      <GamePreviewModal
        game={{ ...shared, copies: [], playedHours: 0 }}
        hideSpend={false}
        catalogOnly
        action={<button>Wishlist</button>}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("Played")).toBeNull();
    expect(screen.getByRole("button", { name: /Suggest edit|Edit game/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wishlist" })).toBeTruthy();
  });

  it("keeps Suggest edit off the chat share — that's someone's own copy", () => {
    render(<GamePreviewModal game={shared} hideSpend={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Suggest edit|Edit game/ })).toBeNull();
  });

  it("closes via the ✕ and the backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(
      <GamePreviewModal game={shared} hideSpend={false} onClose={onClose} />,
    );
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(container.firstElementChild as Element); // backdrop
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
