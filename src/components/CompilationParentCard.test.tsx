import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { CompilationParentCard } from "./CompilationParentCard";
import { compilationRollup } from "../lib/compilationGrouping";
import { DEFAULT_PRICE_FORMULA, DEFAULT_BOUNTY_FORMULA } from "../lib/economy";
import { useStore } from "../store";
import type { Compilation, Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Game A",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    familyId: null,
    ...over,
  } as Game;
}

const comp: Compilation = {
  id: "C",
  title: "Trilogy Collection",
  totalCost: 45,
  createdAt: 1,
  expanded: false,
  carryoverHours: 3,
};
const children = [
  game({
    id: "g1",
    title: "Part 1",
    status: "finished",
    finishTag: "completed",
    compilationId: "C",
    playedHours: 5,
  }),
  game({ id: "g2", title: "Part 2", status: "backlog", compilationId: "C", playedHours: 2, hours: 12 }),
  game({ id: "g3", title: "Part 3", status: "playing", compilationId: "C" }),
];

const buyGame = vi.fn(async () => {});
const enterRotation = vi.fn(async () => {});

beforeEach(() => {
  window.history.replaceState(null, "", "/"); // clear any hash a prior test navigated to
  buyGame.mockClear();
  enterRotation.mockClear();
  act(() =>
    useStore.setState({
      cloud: false,
      viewing: null,
      games: children,
      compilations: [comp],
      coins: 1000,
      vouchers: 0,
      generalSlots: 2,
      replaySlots: 2,
      completionistSlots: 0,
      coOpPacts: [],
      economy: { price: DEFAULT_PRICE_FORMULA, bounty: DEFAULT_BOUNTY_FORMULA },
      buyGame,
      enterRotation,
    }),
  );
});

const card = (board: "backlog" | "finished", kids: Game[] = children) => (
  <CompilationParentCard collapsed={compilationRollup(comp, kids, board)} />
);

describe("CompilationParentCard (86fc0b4b)", () => {
  it("shows the rollup: title, Bazaar count, hours incl. carryover, and spend", () => {
    render(card("backlog"));
    expect(screen.getByText("Trilogy Collection")).toBeTruthy();
    expect(screen.getByText("Compilation · 3 games · 1 in Bazaar")).toBeTruthy();
    // 5 + 2 child hours + 3 carryover = 10h.
    expect(screen.getByText(/10h played/)).toBeTruthy();
    expect(screen.getByText(/\$45 spent/)).toBeTruthy();
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByTitle("1 finished · 1 playing")).toBeTruthy();
  });

  it("lists only this board's games in the tray", () => {
    render(card("backlog"));
    const tray = within(screen.getByRole("list"));
    expect(tray.getByText("Part 2")).toBeTruthy();
    expect(tray.getByText("12h")).toBeTruthy();
    expect(tray.queryByText("Part 1")).toBeNull();
    expect(tray.queryByText("Part 3")).toBeNull();
  });

  it("shows finished games with their finish badge on the Finished card", () => {
    render(card("finished"));
    expect(screen.getByText("Compilation · 1 of 3 finished")).toBeTruthy();
    const tray = within(screen.getByRole("list"));
    expect(tray.getByText("Part 1")).toBeTruthy();
    expect(tray.getByText("Completed")).toBeTruthy();
    // Play a Game belongs to the Bazaar card.
    expect(screen.queryByRole("button", { name: /Play a Game/ })).toBeNull();
  });

  it("on the Master Ledger, lists the games in view whatever their status (9f958571)", () => {
    render(
      <CompilationParentCard
        collapsed={{ ...compilationRollup(comp, children, "ledger"), boardChildren: children }}
      />,
    );
    expect(screen.getByText("Compilation · 3 games · 1 finished")).toBeTruthy();
    const tray = within(screen.getByRole("list", { name: "Games from Trilogy Collection" }));
    // A finished game reads as on Finished; the others show their length.
    expect(tray.getByText("Completed")).toBeTruthy();
    expect(tray.getByText("12h")).toBeTruthy();
    expect(tray.getByText("Part 3")).toBeTruthy();
    // Playing a game is the Bazaar card's job.
    expect(screen.queryByRole("button", { name: /Play a Game/ })).toBeNull();
  });

  it("opens a tray game's own page", () => {
    render(card("backlog"));
    fireEvent.click(screen.getByTitle("Open Part 2"));
    expect(window.location.hash).toBe("#g/g2");
  });

  it("opens the bundle's own page when the cover is clicked", () => {
    render(card("backlog"));
    fireEvent.click(screen.getByTitle("Open Trilogy Collection"));
    expect(window.location.hash).toBe("#c/C");
  });

  it("no longer offers to expand the bundle into separate cards", () => {
    render(card("backlog"));
    expect(screen.queryByText(/Expand/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.queryByText(/Expand/i)).toBeNull();
  });

  it("Play a Game picks a Bazaar game and hands it to the activation dialog", () => {
    render(card("backlog"));
    fireEvent.click(screen.getByRole("button", { name: /Play a Game/ }));
    const picker = within(screen.getByRole("dialog", { name: /Play a game from Trilogy Collection/ }));
    // Games already in play or finished are summarized, not offered.
    expect(picker.getByText(/Now Playing:/)).toBeTruthy();
    expect(picker.getByText(/Finished:/)).toBeTruthy();
    fireEvent.click(picker.getByRole("button", { name: /Part 2/ }));
    // The game's own activation dialog takes over — same fee and lanes as its card.
    fireEvent.click(screen.getByRole("button", { name: /Pay with coins/i }));
    expect(buyGame).toHaveBeenCalledWith("g2", { kind: "general" });
  });

  it("sends a live-service game straight to Rotation", () => {
    const kids = [game({ id: "o", title: "Forever Game", compilationId: "C", ongoing: true })];
    act(() => useStore.setState({ games: kids }));
    render(card("backlog", kids));
    fireEvent.click(screen.getByRole("button", { name: /Play a Game/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Forever Game/ }));
    expect(enterRotation).toHaveBeenCalledWith("o");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("disables a story-locked game in the picker, saying why", () => {
    const kids = [
      game({ id: "a", title: "Prequel", compilationId: "C" }),
      game({ id: "b", title: "Sequel", compilationId: "C", prerequisiteGameId: "a" }),
    ];
    act(() => useStore.setState({ games: kids }));
    render(card("backlog", kids));
    fireEvent.click(screen.getByRole("button", { name: /Play a Game/ }));
    const sequel = within(screen.getByRole("dialog")).getByRole("button", { name: /Sequel/ });
    expect((sequel as HTMLButtonElement).disabled).toBe(true);
    expect(sequel.textContent).toMatch(/finish Prequel first/);
  });

  it("wears the Well spent chip once the bundle's hours pay off its cost (86fc0b4b)", () => {
    // $45 over 10h (5 + 2 + 3 carryover): met at $4.50/hr, not at $4/hr.
    act(() => useStore.setState({ targetCostPerHour: 4.5 }));
    const { unmount } = render(card("backlog"));
    expect(screen.getByText("Well spent")).toBeTruthy();
    unmount();
    act(() => useStore.setState({ targetCostPerHour: 4 }));
    render(card("backlog"));
    expect(screen.queryByText("Well spent")).toBeNull();
    act(() => useStore.setState({ targetCostPerHour: null }));
  });

  it("shows owned platforms with little format glyphs (physical / DLC)", () => {
    const withCopies: Compilation = {
      ...comp,
      copies: [
        { id: "cp1", platform: "Nintendo Switch", format: "physical" },
        { id: "cp2", platform: "PC", format: "dlc" },
      ],
    };
    render(<CompilationParentCard collapsed={compilationRollup(withCopies, children, "backlog")} />);
    // The platform label stays clean; the format reads from its glyph.
    expect(screen.getByText("Nintendo Switch")).toBeTruthy();
    expect(screen.queryByText(/Nintendo Switch \(Physical\)/i)).toBeNull();
    expect(screen.getByLabelText("Physical")).toBeTruthy();
    // A DLC-only platform carries the DLC glyph.
    expect(screen.getByText("PC")).toBeTruthy();
    expect(screen.getByLabelText("DLC")).toBeTruthy();
  });
});
