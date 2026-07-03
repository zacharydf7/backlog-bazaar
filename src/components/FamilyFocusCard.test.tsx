import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { FamilyFocusCard } from "./FamilyFocusCard";
import { ViewingProvider } from "../lib/viewContext";
import { groupCollapsedFamilies } from "../lib/familyGrouping";
import { useStore } from "../store";
import type { Game, GameStatus } from "../types";

function game(id: string, over: Partial<Game> = {}): Game {
  return {
    id,
    title: id,
    status: "backlog" as GameStatus,
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    familyId: "F",
    ...over,
  } as Game;
}

function makeFamily(members: Game[]) {
  const fam = groupCollapsedFamilies(members).families[0];
  if (!fam) throw new Error("test setup: family didn't fold");
  return fam;
}

beforeEach(() => {
  act(() => useStore.setState({ viewing: null, parentTemplates: [], compilations: [] }));
});

describe("FamilyFocusCard", () => {
  const members = () => [
    game("old", {
      title: "Xenoblade Chronicles",
      status: "finished",
      playedHours: 100,
      released: "2010-06-10",
      copies: [{ id: "c1", platform: "Nintendo Wii", format: "physical", cost: 50 }],
    }),
    game("new", {
      title: "Xenoblade: Definitive Edition",
      status: "playing",
      playedHours: 20,
      released: "2020-05-29",
      copies: [{ id: "c2", platform: "Nintendo Switch", format: "digital", cost: 60 }],
      familyName: "Xenoblade Chronicles",
    }),
  ];

  it("renders the family name, aggregate chips, and the active edition's controls inline", () => {
    act(() => useStore.setState({ games: members() }));
    render(<FamilyFocusCard family={makeFamily(members())} />);

    expect(screen.getByText("Xenoblade Chronicles")).toBeTruthy();
    // Both the cover overlay and the family chip announce the edition count.
    expect(screen.getAllByText(/2 editions/).length).toBeGreaterThan(0);
    expect(screen.getByText(/120h total/)).toBeTruthy();
    expect(screen.getByText(/\$110 spent/)).toBeTruthy();
    expect(screen.getByText(/1 cleared/)).toBeTruthy();

    // The playing edition's real footer is embedded — zero-click time logging
    // and finishing, exactly like its standalone card.
    expect(screen.getByRole("button", { name: /Mark finished/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Log play time/i })).toBeTruthy();
  });

  it("hides the other editions behind the expander and reveals rows on demand", () => {
    act(() => useStore.setState({ games: members() }));
    render(<FamilyFocusCard family={makeFamily(members())} />);

    // Collapsed by default: the finished edition's row isn't shown.
    expect(screen.queryByText("Xenoblade Chronicles", { selector: "span" })).toBeNull();
    const toggle = screen.getByRole("button", { name: /View 1 other edition/i });
    fireEvent.click(toggle);
    expect(screen.getByTitle(/Open Xenoblade Chronicles$/i)).toBeTruthy();
    expect(screen.getByText("2010")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hide other editions/i })).toBeTruthy();
  });

  it("read-only visits show the family without owner actions", () => {
    const fam = makeFamily(members());
    render(
      <ViewingProvider value={{ readOnly: true, hideSpend: false }}>
        <FamilyFocusCard family={fam} />
      </ViewingProvider>,
    );
    expect(screen.queryByRole("button", { name: /Mark finished/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Manage this Game Family/i })).toBeNull();
    // The aggregate story still reads.
    expect(screen.getByText(/120h total/)).toBeTruthy();
  });
});
