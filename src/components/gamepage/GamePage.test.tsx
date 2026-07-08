import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { GamePage } from "./GamePage";
import { useStore, type ViewingSession } from "../../store";
import type { Game } from "../../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Chrono Trigger",
    status: "backlog",
    genres: ["RPG"],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

function visitingSession(games: Game[]): ViewingSession {
  return {
    userId: "friend-1",
    displayName: "Rey",
    avatarUrl: null,
    coins: 0,
    theme: null,
    gamesFinished: 0,
    hoursFinished: 0,
    hideSpend: true,
    lastSeenAt: null,
    activity: null,
    badges: [],
    title: null,
    aboutMe: null,
    bannerUrl: null,
    accent: null,
    bg: null,
    games,
  };
}

beforeEach(() => {
  // jsdom doesn't implement scrolling; the page scrolls to top on mount.
  window.scrollTo = vi.fn();
  act(() => useStore.setState({ cloud: true, games: [game()], viewing: null }));
});

describe("GamePage", () => {
  it("renders the hero and section tabs for an own-library game", () => {
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Chrono Trigger" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Overview/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Journey/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Library/ })).toBeTruthy();
  });

  it("keeps the hero status-agnostic — no inline buy/log/finish controls", () => {
    // A backlog game never shows a "Buy & Start" button on its page…
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Buy .* Start/i })).toBeNull();

    // …and a Now Playing game shows neither the play-time logger nor a
    // Mark Finished button in the hero. Those actions live on the board card;
    // the page looks the same regardless of status.
    act(() => useStore.setState({ games: [game({ status: "playing", playedHours: 3 })] }));
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    expect(screen.queryByLabelText(/Log play time/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark Finished/i })).toBeNull();
  });

  it("switches the active tab on click", () => {
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    const journey = screen.getByRole("tab", { name: /Journey/ });
    expect(journey.getAttribute("aria-selected")).toBe("false");
    fireEvent.click(journey);
    expect(journey.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /Overview/ }).getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  it("shows a not-found panel (with a working Back) for an unknown id", () => {
    const onBack = vi.fn();
    render(<GamePage gameId="nope" onBack={onBack} />);
    expect(screen.getByText(/isn’t in the library/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows a loading panel instead of not-found while a visit deep link loads", () => {
    render(<GamePage gameId="nope" visitPending onBack={vi.fn()} />);
    expect(screen.getByText(/Loading their Bazaar/)).toBeTruthy();
    expect(screen.queryByText(/isn’t in the library/)).toBeNull();
  });

  it("resolves from the visited library and offers visitors Overview + Community only", () => {
    act(() =>
      useStore.setState({
        viewing: visitingSession([game({ id: "vg1", title: "Their Game" })]),
      }),
    );
    render(<GamePage gameId="vg1" onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Their Game" })).toBeTruthy();
    // Community content is visitor-visible; the owner-only panes are not, and
    // an unreviewed game offers no Review tab.
    expect(screen.getByRole("tab", { name: /Overview/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Community/ })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Review/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Journey/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Library/ })).toBeNull();
  });

  it("offers visitors the Review tab when the owner left one", () => {
    act(() =>
      useStore.setState({
        viewing: visitingSession([
          game({ id: "vg1", title: "Their Game", review: "Superb.", reviewScore: 9 }),
        ]),
      }),
    );
    render(<GamePage gameId="vg1" onBack={vi.fn()} />);
    const reviewTab = screen.getByRole("tab", { name: /Review/ });
    fireEvent.click(reviewTab);
    expect(screen.getByText("Superb.")).toBeTruthy();
    // Owner-only panes stay hidden from visitors.
    expect(screen.queryByRole("tab", { name: /Journey/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Library/ })).toBeNull();
  });

  it("keeps the hero universal — no status badge or score chip, even with both set", () => {
    act(() =>
      useStore.setState({ games: [game({ status: "playing", reviewScore: 7 })] }),
    );
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    // Instance state lives in the tabs, not the hero: the hero shows only the
    // cover, the global title and the like control.
    expect(screen.queryByText("Now Playing")).toBeNull();
    expect(screen.queryByTitle("3.5 out of 5 stars")).toBeNull();
    // The score is still right there on the Review tab.
    fireEvent.click(screen.getByRole("tab", { name: /Review/ }));
    expect(screen.getByText("3.5 / 5")).toBeTruthy();
  });

  it("leaves the page (onBack) when a resolved game disappears", () => {
    const onBack = vi.fn();
    render(<GamePage gameId="g1" onBack={onBack} />);
    expect(onBack).not.toHaveBeenCalled();
    act(() => useStore.setState({ games: [] }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("GamePage as the unified Game Details Hub", () => {
  it("shows combined stats across editions and a Manage in Library entry", () => {
    const a = game({
      id: "a",
      title: "Witcher 3 PC",
      familyId: "F",
      familyName: "The Witcher 3",
      status: "finished",
      playedHours: 10,
    });
    const b = game({ id: "b", title: "Witcher 3 Switch", familyId: "F", playedHours: 5 });
    act(() => useStore.setState({ games: [a, b] }));
    render(<GamePage gameId="a" onBack={vi.fn()} />);
    expect(screen.getByText(/2 editions in your library/i)).toBeTruthy();
    expect(screen.getByText(/15h played/i)).toBeTruthy();
    // The entry point jumps into the Library tab — the instance control center.
    fireEvent.click(screen.getByRole("button", { name: /Manage in Library/i }));
    expect(
      screen.getByRole("tab", { name: /Library/ }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("shows no editions block for a hub of one", () => {
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    expect(screen.queryByText(/editions in your library/i)).toBeNull();
  });

  it("wears the family name as the global title", () => {
    const a = game({ id: "a", title: "Witcher 3 PC", familyId: "F", familyName: "The Witcher 3" });
    const b = game({ id: "b", title: "Witcher 3 Switch", familyId: "F" });
    act(() => useStore.setState({ games: [a, b] }));
    render(<GamePage gameId="b" onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "The Witcher 3" })).toBeTruthy();
  });

  it("groups unlinked same-catalog instances onto one page, whichever variant opened it", () => {
    const ps = game({ id: "a", rawgId: 7, playedHours: 4 });
    const sw = game({ id: "b", rawgId: 7, playedHours: 2 });
    act(() => useStore.setState({ games: [ps, sw] }));
    render(<GamePage gameId="b" onBack={vi.fn()} />);
    expect(screen.getByText(/2 editions in your library/i)).toBeTruthy();
    expect(screen.getByText(/6h played/i)).toBeTruthy();
  });

  it("switches the Journey/Review record through the Select Edition dropdown", () => {
    const ps = game({
      id: "a",
      rawgId: 7,
      copies: [{ id: "c1", platform: "PlayStation 4" }],
      review: "PS4 take.",
    });
    const sw = game({
      id: "b",
      rawgId: 7,
      copies: [{ id: "c2", platform: "Nintendo Switch" }],
      review: "Switch take.",
    });
    act(() => useStore.setState({ games: [ps, sw] }));
    render(<GamePage gameId="a" onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: /Review/ }));
    // Seeded by the clicked variant…
    expect(screen.getByDisplayValue("PS4 take.")).toBeTruthy();
    // …and the dropdown re-targets the other record.
    fireEvent.change(screen.getByLabelText("Select edition"), { target: { value: "g:b" } });
    expect(screen.getByDisplayValue("Switch take.")).toBeTruthy();
    expect(screen.queryByDisplayValue("PS4 take.")).toBeNull();
  });

  it("offers no edition dropdown on a hub of one", () => {
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Journey/ }));
    expect(screen.queryByLabelText("Select edition")).toBeNull();
  });

  it("keeps a wishlisted-elsewhere edition out of the Select Edition dropdown (15d13b9a)", () => {
    const ps = game({ id: "a", rawgId: 7, status: "finished", copies: [{ id: "c1", platform: "PlayStation 5" }] });
    const pc = game({ id: "b", rawgId: 7, status: "backlog", copies: [{ id: "c2", platform: "PC" }] });
    const wish = game({ id: "c", rawgId: 7, status: "wishlist", copies: [{ id: "c3", platform: "Nintendo Switch 2" }] });
    act(() => useStore.setState({ games: [ps, pc, wish] }));
    render(<GamePage gameId="a" onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: /Journey/ }));
    const options = within(screen.getByLabelText("Select edition"))
      .getAllByRole("option")
      .map((o) => o.textContent ?? "");
    // Both owned editions are selectable; the wishlist-only platform never is.
    expect(options.some((t) => /PlayStation 5/.test(t))).toBe(true);
    expect(options.some((t) => /PC/.test(t))).toBe(true);
    expect(options.some((t) => /Nintendo Switch 2/.test(t))).toBe(false);
  });

  it("jumps to a sibling edition via the Library tab's family manager", () => {
    window.history.replaceState(null, "", "/");
    const a = game({ id: "a", title: "Witcher 3 PC", familyId: "F" });
    const b = game({ id: "b", title: "Witcher 3 Switch", familyId: "F" });
    act(() => useStore.setState({ games: [a, b] }));
    render(<GamePage gameId="a" onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: /Library/ }));
    fireEvent.click(screen.getByRole("button", { name: /Manage family/i }));
    fireEvent.click(screen.getByRole("button", { name: /Open Witcher 3 Switch/i }));

    expect(screen.queryByRole("heading", { name: /Family Breakdown/i })).toBeNull();
    expect(window.location.hash).toBe("#g/b");
  });

  it("offers a Wishlist button on a visited game you don't own, adding it to your library (f015625a)", () => {
    const addSpy = vi.fn(async () => {});
    act(() =>
      useStore.setState({
        games: [], // you own nothing
        viewing: visitingSession([game({ id: "vg", rawgId: 7, title: "Mirage" })]),
        addGame: addSpy,
      }),
    );
    render(<GamePage gameId="vg" onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /^Wishlist$/i }));
    expect(addSpy).toHaveBeenCalled();
    const [meta, status] = addSpy.mock.calls[0] as unknown as [{ rawgId?: number }, string];
    expect(status).toBe("wishlist");
    expect(meta.rawgId).toBe(7); // added to YOUR library by catalog identity
  });

  it("shows 'In your library' instead of Wishlist when you already have the visited game", () => {
    act(() =>
      useStore.setState({
        games: [game({ id: "mine", rawgId: 7, status: "backlog" })],
        viewing: visitingSession([game({ id: "vg", rawgId: 7, title: "Mirage" })]),
      }),
    );
    render(<GamePage gameId="vg" onBack={vi.fn()} />);
    expect(screen.getByText(/In your library/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Wishlist$/i })).toBeNull();
  });

  it("lets a visitor read the review of an edition through the dropdown", () => {
    act(() =>
      useStore.setState({
        viewing: visitingSession([
          game({
            id: "vg1",
            rawgId: 7,
            copies: [{ id: "c1", platform: "PC" }],
            review: "The PC one.",
          }),
          game({ id: "vg2", rawgId: 7, copies: [{ id: "c2", platform: "Nintendo Switch" }] }),
        ]),
      }),
    );
    render(<GamePage gameId="vg2" onBack={vi.fn()} />);
    // The unreviewed edition was clicked, but a review exists somewhere in the
    // hub, so the tab is offered — with a quiet empty state for this edition.
    fireEvent.click(screen.getByRole("tab", { name: /Review/ }));
    expect(screen.getByText(/No review on this edition/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Select edition"), { target: { value: "g:vg1" } });
    expect(screen.getByText("The PC one.")).toBeTruthy();
  });
});

describe("GamePage Prev/Next browsing (7ad49282)", () => {
  const nav = {
    stops: [
      { kind: "game" as const, id: "g0" },
      { kind: "game" as const, id: "g1" },
      { kind: "compilation" as const, id: "c2" },
    ],
    label: "Bazaar",
  };

  it("shows the position and steps to the next stop, disabling Prev at the start", () => {
    // g0 is first in the sequence: Prev is disabled, Next goes to g1.
    act(() => useStore.setState({ games: [game({ id: "g0" })] }));
    const onNavigate = vi.fn();
    render(<GamePage gameId="g0" onBack={vi.fn()} pageNav={nav} onNavigate={onNavigate} />);

    expect(screen.getByText(/1 of 3/)).toBeTruthy();
    expect((screen.getByLabelText(/Previous in Bazaar/i) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Next in Bazaar/i));
    expect(onNavigate).toHaveBeenCalledWith({ kind: "game", id: "g1" });
  });

  it("steps forward into a collapsed-compilation stop (issue 28ec4975)", () => {
    // g1 sits before the bundle card: Next must open the compilation page.
    act(() => useStore.setState({ games: [game({ id: "g1" })] }));
    const onNavigate = vi.fn();
    render(<GamePage gameId="g1" onBack={vi.fn()} pageNav={nav} onNavigate={onNavigate} />);

    expect(screen.getByText(/2 of 3/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Next in Bazaar/i));
    expect(onNavigate).toHaveBeenCalledWith({ kind: "compilation", id: "c2" });
  });

  it("shows no controls when the game isn't part of the sequence (e.g. opened via search)", () => {
    act(() => useStore.setState({ games: [game({ id: "solo" })] }));
    render(<GamePage gameId="solo" onBack={vi.fn()} pageNav={nav} onNavigate={vi.fn()} />);
    expect(screen.queryByLabelText(/in Bazaar/i)).toBeNull();
  });

  it("shows no controls without a pageNav (deep link / profile shelf)", () => {
    render(<GamePage gameId="g1" onBack={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.queryByLabelText(/Next in/i)).toBeNull();
  });
});

describe("GamePage owner ⋮ menu (546c0de8)", () => {
  it("mirrors the card's quick actions for a standalone game", () => {
    act(() => useStore.setState({ viewing: null, games: [game()] }));
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    expect(screen.getByText(/Move to wishlist/i)).toBeTruthy();
    expect(screen.getByText(/Move to Finished/i)).toBeTruthy();
    expect(screen.getByText(/Make private/i)).toBeTruthy();
    expect(screen.getByText(/Link editions/i)).toBeTruthy();
    expect(screen.getByText(/Delete game/i)).toBeTruthy();
  });

  it("deletes only after confirmation, then leaves the page", () => {
    const onBack = vi.fn();
    const removeGame = vi.fn();
    act(() => useStore.setState({ viewing: null, games: [game()], removeGame }));
    render(<GamePage gameId="g1" onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    fireEvent.click(screen.getByText(/Delete game/i));
    expect(removeGame).not.toHaveBeenCalled(); // confirm first
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(removeGame).toHaveBeenCalledWith("g1");
    expect(onBack).toHaveBeenCalled();
  });

  const stopNav = (ids: string[]) => ({
    stops: ids.map((id) => ({ kind: "game" as const, id })),
    label: "Bazaar",
  });

  it("steps to the previous card after deleting, instead of leaving the page (546c0de8)", () => {
    const onBack = vi.fn();
    const onNavigate = vi.fn();
    const removeGame = vi.fn();
    act(() => useStore.setState({ viewing: null, games: [game()], removeGame }));
    render(
      <GamePage gameId="g1" onBack={onBack} pageNav={stopNav(["g0", "g1", "g2"])} onNavigate={onNavigate} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    fireEvent.click(screen.getByText(/Delete game/i));
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(removeGame).toHaveBeenCalledWith("g1");
    expect(onNavigate).toHaveBeenCalledWith({ kind: "game", id: "g0" });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("steps to the new first card when deleting the first (546c0de8)", () => {
    const onNavigate = vi.fn();
    act(() => useStore.setState({ viewing: null, games: [game()], removeGame: vi.fn() }));
    render(<GamePage gameId="g1" onBack={vi.fn()} pageNav={stopNav(["g1", "g2", "g3"])} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    fireEvent.click(screen.getByText(/Delete game/i));
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(onNavigate).toHaveBeenCalledWith({ kind: "game", id: "g2" });
  });

  it("leaves the page when the deleted game is the only card in the sequence (546c0de8)", () => {
    const onBack = vi.fn();
    const onNavigate = vi.fn();
    act(() => useStore.setState({ viewing: null, games: [game()], removeGame: vi.fn() }));
    render(<GamePage gameId="g1" onBack={onBack} pageNav={stopNav(["g1"])} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    fireEvent.click(screen.getByText(/Delete game/i));
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
  });

  it("moves to Finished with a tag (no coins) from the menu", () => {
    const bazaarToFinished = vi.fn();
    act(() => useStore.setState({ viewing: null, games: [game()], bazaarToFinished }));
    render(<GamePage gameId="g1" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    fireEvent.click(screen.getByText(/Move to Finished/i));
    fireEvent.click(screen.getByRole("button", { name: /^Completed$/i }));
    expect(bazaarToFinished).toHaveBeenCalledWith("g1", "completed");
  });

  it("is owner-only — hidden while visiting", () => {
    act(() =>
      useStore.setState({ viewing: visitingSession([game({ id: "vg1", title: "Theirs" })]) }),
    );
    render(<GamePage gameId="vg1" onBack={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /More options/i })).toBeNull();
  });

  it("points a multi-edition hub to the Library tab instead of per-copy actions", () => {
    const a = game({ id: "a", rawgId: 7, title: "Edition A" });
    const b = game({ id: "b", rawgId: 7, title: "Edition B" });
    act(() => useStore.setState({ viewing: null, games: [a, b] }));
    render(<GamePage gameId="a" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    expect(screen.getByText(/Manage editions/i)).toBeTruthy();
    expect(screen.queryByText(/Delete game/i)).toBeNull();
    fireEvent.click(screen.getByText(/Manage editions/i));
    expect(screen.getByRole("tab", { name: /Library/ }).getAttribute("aria-selected")).toBe("true");
  });
});
