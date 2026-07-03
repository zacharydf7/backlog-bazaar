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
