import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { GameCard } from "./GameCard";
import { useStore } from "../store";
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

describe("GameCard unified ownership (folded compilation copy)", () => {
  // A game owned both standalone and inside a compilation: the compilation copy
  // is dropped from the board (App-level dedupe) and folds into the standalone
  // master's card. These cover what the master card renders for that pairing.
  it("surfaces the bundle membership on the standalone master + merges platform tags", () => {
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
    // The compilation chip shows on the standalone master…
    expect(screen.getByTitle(/Part of Alwa's Collection/i)).toBeTruthy();
    // …and the platform tags span both the standalone and the folded copy.
    expect(screen.getByText("PC")).toBeTruthy();
    expect(screen.getByText("Nintendo Switch")).toBeTruthy();
  });

  it("collapses a platform owned both standalone and in the bundle to one tag", () => {
    const master = game({ id: "m", rawgId: 1, compilationId: null, copies: [{ id: "a", platform: "Nintendo Switch", format: "digital" }] });
    const child = game({
      id: "c",
      rawgId: 1,
      compilationId: "C",
      compilationName: "Alwa's Collection",
      copies: [{ id: "b", platform: "Nintendo Switch", format: "physical" }],
    });
    act(() => useStore.setState({ viewing: null, games: [master, child], compilations: [] }));
    render(<GameCard game={master} />);
    expect(screen.getAllByText("Nintendo Switch")).toHaveLength(1);
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

  it("shows one badge when the same collection is owned on two platforms", () => {
    // Same-named compilation on two platforms = two Compilation records folding
    // into the master. The badge must not duplicate (regression for the dupe shown
    // on condensed cards).
    const master = game({ id: "m", rawgId: 1, compilationId: null });
    const switchCopy = game({
      id: "s",
      rawgId: 1,
      compilationId: "C-switch",
      compilationName: "Alwa's Collection",
      copies: [{ id: "a", platform: "Nintendo Switch" }],
    });
    const ps4Copy = game({
      id: "p",
      rawgId: 1,
      compilationId: "C-ps4",
      compilationName: "Alwa's Collection",
      copies: [{ id: "b", platform: "PlayStation 4" }],
    });
    act(() => useStore.setState({ viewing: null, games: [master, switchCopy, ps4Copy], compilations: [] }));
    render(<GameCard game={master} />);
    expect(screen.getAllByTitle(/Part of Alwa's Collection/i)).toHaveLength(1);
    // …while both platforms still show as tags.
    expect(screen.getByText("Nintendo Switch")).toBeTruthy();
    expect(screen.getByText("PlayStation 4")).toBeTruthy();
  });

  it("merges two compilations of one game (no standalone) into a single card", () => {
    // Same game in two DIFFERENT bundles, no standalone copy: one card showing both
    // bundle badges and both platforms.
    const ps4 = game({
      id: "p",
      rawgId: 1,
      compilationId: "C-remix",
      compilationName: "KH HD 1.5+2.5 ReMIX",
      copies: [{ id: "a", platform: "PlayStation 4" }],
    });
    const ps3 = game({
      id: "q",
      rawgId: 1,
      compilationId: "C-15",
      compilationName: "KH HD 1.5 Remix",
      copies: [{ id: "b", platform: "PlayStation 3" }],
    });
    act(() => useStore.setState({ viewing: null, games: [ps4, ps3], compilations: [] }));
    // `ps4` is the furthest-along/earliest master that survives dedupe.
    render(<GameCard game={ps4} />);
    expect(screen.getByTitle(/Part of KH HD 1\.5\+2\.5 ReMIX/i)).toBeTruthy();
    expect(screen.getByTitle(/Part of KH HD 1\.5 Remix —/i)).toBeTruthy();
    expect(screen.getByText("PlayStation 4")).toBeTruthy();
    expect(screen.getByText("PlayStation 3")).toBeTruthy();
  });

  it("merges the same collection on two platforms (no standalone) to one badge", () => {
    const ps4 = game({
      id: "p",
      rawgId: 1,
      compilationId: "C-ps4",
      compilationName: "KH HD 2.8 Final Chapter Prologue",
      copies: [{ id: "a", platform: "PlayStation 4" }],
    });
    const xbox = game({
      id: "x",
      rawgId: 1,
      compilationId: "C-xbox",
      compilationName: "KH HD 2.8 Final Chapter Prologue",
      copies: [{ id: "b", platform: "Xbox One" }],
    });
    act(() => useStore.setState({ viewing: null, games: [ps4, xbox], compilations: [] }));
    render(<GameCard game={ps4} />);
    // Same-named collection → one chip, both platforms.
    expect(screen.getAllByTitle(/Part of KH HD 2\.8 Final Chapter Prologue/i)).toHaveLength(1);
    expect(screen.getByText("PlayStation 4")).toBeTruthy();
    expect(screen.getByText("Xbox One")).toBeTruthy();
  });

  it("opens the folded copy's compilation hub from its chip", () => {
    const master = game({ id: "m", rawgId: 1, compilationId: null });
    const child = game({ id: "c", rawgId: 1, compilationId: "C", compilationName: "Alwa's Collection" });
    act(() => useStore.setState({ viewing: null, games: [master, child], compilations: [] }));
    render(<GameCard game={master} />);
    fireEvent.click(screen.getByLabelText(/Part of Alwa's Collection/i));
    // The hub for the bundle opens (its heading is the compilation's title).
    expect(screen.getByRole("heading", { name: /Alwa's Collection/i })).toBeTruthy();
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
