import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LedgerCard } from "./LedgerCard";
import { ViewingProvider } from "../lib/viewContext";
import type { Game } from "../types";

const game: Game = {
  id: "g1",
  title: "Hollow Knight",
  status: "finished",
  addedAt: 1,
  genres: ["Metroidvania"],
  platforms: ["PC", "Nintendo Switch"],
  developers: ["Team Cherry"],
  hours: 30,
  playedHours: 42,
  released: "2017-02-24",
  copies: [{ id: "c1", platform: "Nintendo Switch", cost: 15 }],
};

function renderCard(hideSpend = false) {
  return render(
    <ViewingProvider value={{ readOnly: false, hideSpend }}>
      <LedgerCard game={game} />
    </ViewingProvider>,
  );
}

describe("LedgerCard", () => {
  it("shows the uniform read-only info block, ownership, and spend", () => {
    renderCard();
    expect(screen.getByText("Hollow Knight")).toBeTruthy();
    expect(screen.getByText("Team Cherry")).toBeTruthy(); // Developer
    expect(screen.getByText("2017")).toBeTruthy(); // Released (year)
    expect(screen.getByText("Metroidvania")).toBeTruthy(); // Genre
    expect(screen.getByText(/Owned on/)).toBeTruthy();
    expect(screen.getByText(/Spent/)).toBeTruthy();
  });

  it("carries no interactive board controls (buy / actions / ⋮ menu)", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: /buy/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /more options/i })).toBeNull();
    // The whole card is one clickable surface that opens the Game Hub.
    expect(screen.getByRole("button", { name: /Open Hollow Knight/i })).toBeTruthy();
  });

  it("hides money spent when the visited player hid it", () => {
    renderCard(true);
    expect(screen.queryByText(/Spent/)).toBeNull();
  });
});
