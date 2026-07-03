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
  it("shows the uniform read-only info block, ownership badges, and spend", () => {
    renderCard();
    expect(screen.getByText("Hollow Knight")).toBeTruthy();
    expect(screen.getByText("Length")).toBeTruthy();
    expect(screen.getByText("Hours played")).toBeTruthy();
    // Ownership renders as the shared platform badge (chip), not prose.
    expect(screen.getByText("Nintendo Switch")).toBeTruthy();
    expect(screen.getByText(/Spent/)).toBeTruthy();
    // Retired metadata never renders: developer, release year, genre.
    expect(screen.queryByText("Team Cherry")).toBeNull();
    expect(screen.queryByText("2017")).toBeNull();
    expect(screen.queryByText("Metroidvania")).toBeNull();
  });

  it("lists only owned platforms — never the historical release list (regression)", () => {
    // The game launched on PC + Switch, but only a Switch copy is owned: the
    // card must not surface the release list, just the Switch ownership badge.
    renderCard();
    expect(screen.queryByText("Platforms")).toBeNull();
    expect(screen.queryByText(/\bPC\b/)).toBeNull();
    expect(screen.getByText("Nintendo Switch")).toBeTruthy();
  });

  it("badges each owned version with its recorded formats (inventory view)", () => {
    render(
      <ViewingProvider value={{ readOnly: false, hideSpend: false }}>
        <LedgerCard
          game={{
            ...game,
            copies: [
              { id: "c1", platform: "Nintendo Switch", format: "digital" },
              { id: "c2", platform: "PlayStation 4", format: "physical" },
              { id: "c3", platform: "PlayStation 4", format: "digital" },
            ],
          }}
        />
      </ViewingProvider>,
    );
    expect(screen.getByText("Nintendo Switch (Digital)")).toBeTruthy();
    expect(screen.getByText("PlayStation 4 (Physical, Digital)")).toBeTruthy();
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
