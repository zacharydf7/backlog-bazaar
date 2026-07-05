import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { GameCard } from "./GameCard";
import { useStore } from "../store";
import { ViewingProvider } from "../lib/viewContext";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Hollow Knight",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    familyId: null,
    ...over,
  } as Game;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/"); // clear any hash a prior test navigated to
  act(() => useStore.setState({ viewing: null, parentTemplates: [] }));
});

describe("GameCard focused layout", () => {
  it("renders the title but relocates secondary metadata to the detail modal", () => {
    render(
      <GameCard
        game={game({
          title: "Celeste",
          released: "2018-01-25",
          hours: 8,
          playedHours: 3,
          metacritic: 92,
          genres: ["Platformer"],
          developers: ["Maddy Makes Games"],
          platforms: ["PC", "Nintendo Switch"],
        })}
      />,
    );
    expect(screen.getByText("Celeste")).toBeTruthy();
    // None of the deep data appears on the card itself.
    expect(screen.queryByText("Released")).toBeNull();
    expect(screen.queryByText("Length")).toBeNull();
    expect(screen.queryByText("Played")).toBeNull();
    expect(screen.queryByText("Platformer")).toBeNull();
    expect(screen.queryByText("Maddy Makes Games")).toBeNull();
    expect(screen.queryByText("92")).toBeNull();
  });

  it("shows the review score chip on a finished card, but not before finishing", () => {
    const { unmount } = render(
      <GameCard game={game({ status: "finished", finishedAt: 1, finishTag: "beaten", reviewScore: 9 })} />,
    );
    expect(screen.getByTitle("4.5 out of 5 stars")).toBeTruthy();
    unmount();
    render(<GameCard game={game({ status: "backlog", reviewScore: 9 })} />);
    expect(screen.queryByTitle("4.5 out of 5 stars")).toBeNull();
  });

  it("does not leak the cover's 'Edit' tooltip onto the ellipsis menu (regression)", () => {
    render(<GameCard game={game({ title: "Celeste" })} />);
    const editRegion = screen.getByTitle("Edit Celeste");
    const menuButton = screen.getByRole("button", { name: /More options/i });
    // The menu must be a SIBLING of the titled cover region, not a descendant —
    // otherwise every menu option shows the inherited "Edit <title>" tooltip.
    expect(editRegion.contains(menuButton)).toBe(false);
  });

  it("renders one tag per unique owned platform, deduping physical + digital", () => {
    render(
      <GameCard
        game={game({
          copies: [
            { id: "c1", platform: "PlayStation 5", format: "physical" },
            { id: "c2", platform: "PlayStation 5", format: "digital" },
            { id: "c3", platform: "Nintendo Switch", format: "physical" },
          ],
        })}
      />,
    );
    // The same platform owned in two formats collapses to a single tag.
    expect(screen.getAllByText("PlayStation 5")).toHaveLength(1);
    expect(screen.getByText("Nintendo Switch")).toBeTruthy();
  });
});

describe("GameCard while visiting another player's Bazaar (read-only)", () => {
  it("labels the cover 'View' (not 'Edit') and drops the ⋮ options menu", () => {
    act(() => useStore.setState({ viewing: { userId: "friend" } as never }));
    render(
      <ViewingProvider value={{ readOnly: true, hideSpend: false }}>
        <GameCard game={game({ title: "Celeste" })} />
      </ViewingProvider>,
    );
    // Clicking a visited card opens a read-only page — so it reads "View", and
    // the owner-only edit affordances (the ⋮ menu) are gone entirely.
    expect(screen.getByTitle("View Celeste")).toBeTruthy();
    expect(screen.queryByTitle("Edit Celeste")).toBeNull();
    expect(screen.queryByRole("button", { name: /More options/i })).toBeNull();
  });
});

describe("GameCard family badge", () => {
  it("shows a compact family icon chip with the family name in its tooltip", () => {
    render(<GameCard game={game({ familyId: "F", familyName: "Ori Saga" })} />);
    expect(screen.getByTitle(/Part of the Ori Saga Family/i)).toBeTruthy();
    // Icon-only: no inline "Family" text crowding the card.
    expect(screen.queryByText("Family")).toBeNull();
    expect(screen.queryByText(/editions/i)).toBeNull();
  });

  it("opens the Manage Game Family hub when the family icon is clicked", () => {
    const g = game({ familyId: "F", familyName: "Ori Saga" });
    act(() => useStore.setState({ viewing: null, games: [g] }));
    render(<GameCard game={g} />);
    fireEvent.click(screen.getByLabelText(/Part of the Ori Saga Family/i));
    expect(screen.getByRole("heading", { name: /Manage Game Family/i })).toBeTruthy();
  });

  it("shows no family chip for an unlinked game", () => {
    render(<GameCard game={game({ familyId: null })} />);
    expect(screen.queryByTitle(/Family/i)).toBeNull();
  });

  it("jumps from the icon's hub to a sibling's own page (navigation)", () => {
    const g = game({ id: "a", title: "Ori PC", familyId: "F", familyName: "Ori Saga" });
    const sibling = game({ id: "b", title: "Ori Switch", familyId: "F" });
    act(() => useStore.setState({ viewing: null, games: [g, sibling] }));
    render(<GameCard game={g} />);

    fireEvent.click(screen.getByLabelText(/Part of the Ori Saga Family/i));
    fireEvent.click(screen.getByRole("button", { name: /Open Ori Switch/i }));

    // The hub closes and the app navigates to the sibling's game page.
    expect(screen.queryByRole("heading", { name: /Manage Game Family/i })).toBeNull();
    expect(window.location.hash).toBe("#g/b");
  });
});

describe("GameCard ⋮ menu — Link editions", () => {
  it("offers Link editions for an unlinked game and opens the Manage Family hub", () => {
    const g = game({ familyId: null });
    act(() => useStore.setState({ viewing: null, games: [g] }));
    render(<GameCard game={g} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    // Query by text: the cover area is itself role=button, so its accessible name
    // absorbs the menu's labels — getByRole("button", …) would be ambiguous.
    fireEvent.click(screen.getByText(/Link editions/i));
    expect(screen.getByRole("heading", { name: /Manage Game Family/i })).toBeTruthy();
  });

  it("does not offer Link editions for an already-linked game (managed from the detail)", () => {
    render(<GameCard game={game({ familyId: "F" })} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    expect(screen.queryByText(/Link editions/i)).toBeNull();
  });
});

describe("GameCard wishlist target-version highlight", () => {
  it("highlights the wanted version when the game is owned on another platform", () => {
    const owned = game({
      id: "own1",
      rawgId: 42,
      status: "backlog",
      copies: [{ id: "c1", platform: "PC" }],
    });
    const wish = game({
      id: "wish1",
      rawgId: 42,
      status: "wishlist",
      copies: [{ id: "c2", platform: "Nintendo Switch", format: "physical" }],
    });
    act(() => useStore.setState({ viewing: null, games: [owned, wish] }));
    render(<GameCard game={wish} />);
    expect(screen.getByText("You own another version")).toBeTruthy();
    expect(screen.getByText(/Wanted on Nintendo Switch \(Physical\)/i)).toBeTruthy();
    // The plain platform tag styling is replaced, not duplicated.
    expect(screen.queryByText(/^Nintendo Switch$/)).toBeNull();
  });

  it("renders a plain wishlist card when the game isn't owned elsewhere", () => {
    const wish = game({
      id: "wish1",
      rawgId: 42,
      status: "wishlist",
      copies: [{ id: "c2", platform: "Nintendo Switch" }],
    });
    act(() => useStore.setState({ viewing: null, games: [wish] }));
    render(<GameCard game={wish} />);
    expect(screen.queryByText("You own another version")).toBeNull();
    expect(screen.queryByText(/Wanted on/i)).toBeNull();
    expect(screen.getByText("Nintendo Switch")).toBeTruthy();
  });

  it("tolerates a legacy copy-less wishlist row for an owned game", () => {
    const owned = game({ id: "own1", rawgId: 42, status: "backlog", copies: [{ id: "c1", platform: "PC" }] });
    const wish = game({ id: "wish1", rawgId: 42, status: "wishlist", copies: [] });
    act(() => useStore.setState({ viewing: null, games: [owned, wish] }));
    render(<GameCard game={wish} />);
    expect(screen.getByText("You own another version")).toBeTruthy();
    expect(screen.queryByText(/Wanted on/i)).toBeNull();
  });
});

describe("GameCard compilation badge", () => {
  it("shows a compact package chip with the compilation name in its tooltip", () => {
    render(
      <GameCard game={game({ compilationId: "C", compilationName: "Mario All-Stars" })} />,
    );
    expect(screen.getByTitle(/Part of Mario All-Stars/i)).toBeTruthy();
    // Icon-only: the name lives in the tooltip, not inline on the card.
    expect(screen.queryByText(/Part of Mario All-Stars/i)).toBeNull();
  });

  it("shows no compilation chip for a standalone game", () => {
    render(<GameCard game={game()} />);
    expect(screen.queryByTitle(/Part of/i)).toBeNull();
  });

  it("hides Remove for a compilation child (it can only be deleted with the compilation)", () => {
    const g = game({ compilationId: "C", compilationName: "Mario All-Stars" });
    act(() => useStore.setState({ viewing: null, games: [g], compilations: [] }));
    render(<GameCard game={g} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    expect(screen.queryByText(/^Remove$/)).toBeNull();
    // …replaced by an entry that opens the compilation hub.
    expect(screen.getByText(/Open compilation/i)).toBeTruthy();
  });

  it("offers Mark finished (not wishlist/link) for a backlog compilation child", () => {
    const g = game({ id: "gc", compilationId: "C", status: "backlog", familyId: null });
    act(() => useStore.setState({ viewing: null, cloud: false, games: [g], compilations: [] }));
    render(<GameCard game={g} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    // A bundle piece is owned + isn't an edition, so neither applies.
    expect(screen.queryByText(/Move to wishlist/i)).toBeNull();
    expect(screen.queryByText(/Link editions/i)).toBeNull();
    act(() => {
      fireEvent.click(screen.getByText(/Mark finished/i));
    });
    expect(useStore.getState().games.find((x) => x.id === "gc")?.status).toBe("finished");
  });

  it("offers Move to Bazaar for a finished compilation child", () => {
    const g = game({ id: "gf", compilationId: "C", status: "finished", finishedAt: 1, familyId: null });
    act(() => useStore.setState({ viewing: null, cloud: false, games: [g], compilations: [] }));
    render(<GameCard game={g} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    act(() => {
      fireEvent.click(screen.getByText(/Move to Bazaar/i));
    });
    expect(useStore.getState().games.find((x) => x.id === "gf")?.status).toBe("backlog");
  });
});

describe("GameCard expand/collapse compilation menu", () => {
  const template = {
    id: "T",
    title: "Trilogy Collection",
    games: [{ name: "Part 1" }, { name: "Part 2" }],
    parentCatalogId: "cat-1",
    parentRawgId: 42,
  };

  it("offers Collapse compilation for a bundle piece", () => {
    const g = game({ id: "gc", compilationId: "C", compilationName: "Bundle" });
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: false,
        games: [g],
        compilations: [
          { id: "C", title: "Bundle", totalCost: 0, createdAt: 1, expanded: true, carryoverHours: 0 },
        ],
      }),
    );
    render(<GameCard game={g} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    act(() => {
      fireEvent.click(screen.getByText(/Collapse compilation/i));
    });
    expect(useStore.getState().compilations[0].expanded).toBe(false);
  });

  it("offers Expand compilation… for an owned card matching a linked template", () => {
    const g = game({ id: "gp", rawgId: 42, title: "Trilogy Collection" });
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: false,
        games: [g],
        compilations: [],
        parentTemplates: [template],
      }),
    );
    render(<GameCard game={g} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    expect(screen.getByText(/Expand compilation…/i)).toBeTruthy();
  });

  it("never offers expansion for wishlist rows or unmatched games", () => {
    const wish = game({ id: "gw", rawgId: 42, status: "wishlist" });
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: false,
        games: [wish],
        compilations: [],
        parentTemplates: [template],
      }),
    );
    render(<GameCard game={wish} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    expect(screen.queryByText(/Expand compilation/i)).toBeNull();
  });
});

describe("GameCard instance isolation (standalone + bundle twin)", () => {
  // A game owned both standalone and inside a compilation is two independent
  // instances — the standalone card never absorbs the bundle copy's platforms
  // or badge, and vice versa. What connects them is the informational
  // "Cleared Elsewhere" marker only.
  it("keeps each card's platform tags and bundle badge strictly its own", () => {
    const master = game({ id: "m", rawgId: 1, compilationId: null, copies: [{ id: "a", platform: "PC" }] });
    const child = game({
      id: "c",
      rawgId: 1,
      compilationId: "C",
      compilationName: "Alwa's Collection",
      copies: [{ id: "b", platform: "Nintendo Switch", format: "physical" }],
    });
    act(() => useStore.setState({ viewing: null, games: [master, child], compilations: [] }));
    render(<GameCard game={master} />);
    // No bundle chip and no leaked platform on the standalone card…
    expect(screen.queryByTitle(/Part of Alwa's Collection/i)).toBeNull();
    expect(screen.getByText("PC")).toBeTruthy();
    expect(screen.queryByText("Nintendo Switch")).toBeNull();
  });

  it("the bundle child card keeps its own badge and platform", () => {
    const master = game({ id: "m", rawgId: 1, compilationId: null, copies: [{ id: "a", platform: "PC" }] });
    const child = game({
      id: "c",
      rawgId: 1,
      compilationId: "C",
      compilationName: "Alwa's Collection",
      copies: [{ id: "b", platform: "Nintendo Switch", format: "physical" }],
    });
    act(() => useStore.setState({ viewing: null, games: [master, child], compilations: [] }));
    render(<GameCard game={child} />);
    expect(screen.getByTitle(/Part of Alwa's Collection/i)).toBeTruthy();
    expect(screen.getByText("Nintendo Switch")).toBeTruthy();
    expect(screen.queryByText("PC")).toBeNull();
  });

  it("keeps the standalone master's own menu (Remove + Move to wishlist), not piece options", () => {
    const master = game({ id: "m", rawgId: 1, compilationId: null });
    const child = game({ id: "c", rawgId: 1, compilationId: "C", compilationName: "Alwa's Collection" });
    act(() => useStore.setState({ viewing: null, cloud: false, games: [master, child], compilations: [] }));
    render(<GameCard game={master} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    expect(screen.getByText(/^Remove$/)).toBeTruthy();
    expect(screen.getByText(/Move to wishlist/i)).toBeTruthy();
    expect(screen.queryByText(/Mark finished/i)).toBeNull();
  });

  it("opens the child's own compilation hub from its chip", () => {
    const child = game({ id: "c", rawgId: 1, compilationId: "C", compilationName: "Alwa's Collection" });
    act(() => useStore.setState({ viewing: null, games: [child], compilations: [] }));
    render(<GameCard game={child} />);
    fireEvent.click(screen.getByLabelText(/Part of Alwa's Collection/i));
    // The hub for the bundle opens (its heading is the compilation's title).
    expect(screen.getByRole("heading", { name: /Alwa's Collection/i })).toBeTruthy();
  });
});

describe("GameCard Cleared Elsewhere badge", () => {
  it("marks an unplayed copy when another instance already beat the game", () => {
    const done = game({
      id: "d",
      rawgId: 1,
      status: "finished",
      finishTag: "beaten",
      copies: [{ id: "a", platform: "Nintendo Switch", format: "digital" }],
    });
    const fresh = game({ id: "f", rawgId: 1, status: "backlog", copies: [{ id: "b", platform: "PC" }] });
    act(() => useStore.setState({ viewing: null, games: [done, fresh], compilations: [] }));
    render(<GameCard game={fresh} />);
    const chip = screen.getByText(/Cleared elsewhere/i);
    expect(chip).toBeTruthy();
    // The tooltip names the clearing copy's platform.
    expect(screen.getByTitle(/beaten on your Nintendo Switch copy/i)).toBeTruthy();
  });

  it("never marks the finished instance itself, or copies of a different game", () => {
    const done = game({ id: "d", rawgId: 1, status: "finished", finishTag: "beaten" });
    const other = game({ id: "o", rawgId: 2, status: "backlog" });
    act(() => useStore.setState({ viewing: null, games: [done, other], compilations: [] }));
    const { rerender } = render(<GameCard game={done} />);
    expect(screen.queryByText(/Cleared elsewhere/i)).toBeNull();
    rerender(<GameCard game={other} />);
    expect(screen.queryByText(/Cleared elsewhere/i)).toBeNull();
  });

  it("a retired instance never marks its twin as cleared", () => {
    const retired = game({ id: "r", rawgId: 1, status: "finished", finishTag: "retired" });
    const fresh = game({ id: "f", rawgId: 1, status: "backlog" });
    act(() => useStore.setState({ viewing: null, games: [retired, fresh], compilations: [] }));
    render(<GameCard game={fresh} />);
    expect(screen.queryByText(/Cleared elsewhere/i)).toBeNull();
  });
});

describe("GameCard story-lock badge", () => {
  it("shows the Story-locked pill naming the prerequisite, and clears when it's finished", () => {
    const pre = game({ id: "pre", title: "Hollow Knight", status: "backlog" });
    const locked = game({ id: "seq", title: "Silksong", prerequisiteGameId: "pre" });
    act(() => useStore.setState({ viewing: null, games: [pre, locked] }));
    const { rerender } = render(<GameCard game={locked} />);
    // Both the badge pill and the embedded footer's intercept button carry it.
    expect(screen.getAllByText(/Story-locked/i).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(/Locked until you finish Hollow Knight/i).length).toBeGreaterThan(0);

    // The badge is derived — finishing the prerequisite clears it, no stored state.
    act(() => useStore.setState({ games: [{ ...pre, status: "finished" }, locked] }));
    rerender(<GameCard game={locked} />);
    expect(screen.queryAllByText(/Story-locked/i)).toHaveLength(0);
  });
});
