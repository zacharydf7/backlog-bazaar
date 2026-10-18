import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GameActions } from "./GameActions";
import { useStore } from "../store";
import { versionKey } from "../lib/copies";
import type { CoOpPact, Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Alwa's Awakening",
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
  act(() => useStore.setState({ viewing: null, bonusPerks: {} }));
});

describe("GameActions Family Discount price tag", () => {
  it("crosses out the full fee and shows the discounted price for a qualifying edition", () => {
    const bazaar = game({ id: "a", familyId: "F", released: "2015-01-01", hours: 10 });
    const done = game({ id: "b", familyId: "F", status: "finished" });
    act(() => useStore.setState({ viewing: null, games: [bazaar, done], coins: 500 }));
    render(<GameActions game={bazaar} />);

    // The struck-through full fee sits next to the discounted price…
    const struck = document.querySelector("s");
    expect(struck).toBeTruthy();
    const full = Number(struck!.textContent);
    expect(screen.getByText(/Family Discount — an edition is already active or finished/i)).toBeTruthy();
    // …and the buy button charges less than the crossed-out amount.
    const buy = screen.getByRole("button", { name: /Buy & Start/i });
    const charged = Number(buy.textContent!.replace(/\D/g, ""));
    expect(charged).toBeLessThan(full);
  });

  it("shows the plain fee when no sibling is active or finished", () => {
    const solo = game({ id: "a", released: "2015-01-01", hours: 10 });
    act(() => useStore.setState({ viewing: null, games: [solo], coins: 500 }));
    render(<GameActions game={solo} />);
    expect(document.querySelector("s")).toBeNull();
    expect(screen.queryByText(/Family Discount/i)).toBeNull();
  });
});

describe("GameActions Now Playing platform picker (instance isolation)", () => {
  // Every record is its own instance: the log-time picker offers exactly this
  // record's owned copies — a bundle copy of the same game never leaks its
  // platform into the standalone card's picker (it logs time on its own card).
  const master = () =>
    game({
      id: "m",
      rawgId: 1,
      compilationId: null,
      status: "playing",
      copies: [{ id: "a", platform: "Nintendo Switch", format: "digital" }],
    });
  const child = () =>
    game({
      id: "c",
      rawgId: 1,
      compilationId: "C",
      compilationName: "Alwa's Collection",
      copies: [{ id: "b", platform: "PlayStation 4", format: "physical" }],
    });

  it("offers only this record's own platforms — a bundle twin never leaks in", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        games: [master(), child()],
        trackEditions: false,
        fetchPlaySessions: vi.fn(async () => []),
      }),
    );
    render(<GameActions game={master()} />);
    // One owned platform → no picker at all; the bundle-only platform is absent.
    expect(screen.queryByRole("combobox", { name: /Version played for/i })).toBeNull();
    expect(screen.queryByRole("option", { name: "PlayStation 4" })).toBeNull();
  });

  it("logs time to this record with the chosen platform among its own copies", async () => {
    const logPlaytime = vi.fn(async () => {});
    const twoPlatform = () =>
      game({
        id: "m",
        rawgId: 1,
        status: "playing",
        copies: [
          { id: "a", platform: "Nintendo Switch", format: "digital" },
          { id: "b", platform: "PlayStation 4", format: "physical" },
        ],
      });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [twoPlatform()],
        trackEditions: false,
        fetchPlaySessions: vi.fn(async () => []),
        logPlaytime,
      }),
    );
    render(<GameActions game={twoPlatform()} />);

    fireEvent.change(screen.getByRole("combobox", { name: /Version played for/i }), {
      target: { value: versionKey("PlayStation 4", undefined) },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Log play time for/i }), {
      target: { value: "2h" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Log$/i }));

    await waitFor(() =>
      expect(logPlaytime).toHaveBeenCalledWith("m", 2, "PlayStation 4", undefined, undefined),
    );
  });

  it("shows no picker for a plain standalone game with a single platform", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        games: [master()],
        trackEditions: false,
        fetchPlaySessions: vi.fn(async () => []),
      }),
    );
    render(<GameActions game={master()} />);
    expect(screen.queryByRole("combobox", { name: /Version played for/i })).toBeNull();
  });
});

describe("GameActions shared co-op time (issue 8df87f83)", () => {
  const pact = (over: Partial<CoOpPact> = {}): CoOpPact =>
    ({
      id: "p1",
      status: "active",
      gameKey: "r:1",
      title: "Alwa's Awakening",
      partnerId: "u2",
      partnerName: "Sam",
      partnerAvatar: null,
      myGameId: "g1",
      partnerGameId: "g9",
      iAmInviter: true,
      myFinishedAt: null,
      partnerFinishedAt: null,
      bonusPct: 25,
      createdAt: 100,
      endedAt: null,
      endedById: null,
      partnerHours: null,
      coversFee: false,
      giftedFee: null,
      partnerGameImage: null,
      partnerGameHours: null,
      partnerGamePlatform: null,
      ...over,
    }) as CoOpPact;
  const playing = () => game({ status: "playing", rawgId: 1 });

  it("replaces Player 2's log box with a note while Player 1's half is unfinished", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        games: [playing()],
        coOpPacts: [pact({ iAmInviter: false })],
        fetchPlaySessions: vi.fn(async () => []),
      }),
    );
    render(<GameActions game={playing()} />);
    expect(screen.queryByRole("textbox", { name: /Log play time for/i })).toBeNull();
    expect(screen.getByText(/Sam logs your shared time/i)).toBeTruthy();
  });

  it("lets Player 2 log again once Player 1's half is finished", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        games: [playing()],
        coOpPacts: [pact({ iAmInviter: false, partnerFinishedAt: 5 })],
        fetchPlaySessions: vi.fn(async () => []),
      }),
    );
    render(<GameActions game={playing()} />);
    expect(screen.getByRole("textbox", { name: /Log play time for/i })).toBeTruthy();
    expect(screen.queryByText(/logs your shared time/i)).toBeNull();
  });

  it("shows Player 1 the shared-time hint next to an open log box", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        games: [playing()],
        coOpPacts: [pact()],
        fetchPlaySessions: vi.fn(async () => []),
      }),
    );
    render(<GameActions game={playing()} />);
    expect(screen.getByRole("textbox", { name: /Log play time for/i })).toBeTruthy();
    expect(screen.getByText(/also counts for Sam/i)).toBeTruthy();
  });

  it("leaves a drop-in on a Finished card out of the pact, either side", () => {
    const finished = game({ status: "finished", finishTag: "beaten", rawgId: 1 });
    for (const p of [pact(), pact({ iAmInviter: false })]) {
      act(() =>
        useStore.setState({
          viewing: null,
          games: [finished],
          coOpPacts: [p],
          fetchPlaySessions: vi.fn(async () => []),
        }),
      );
      const { unmount } = render(<GameActions game={finished} />);
      fireEvent.click(screen.getByRole("button", { name: /Log a session/i }));
      expect(screen.getByRole("textbox", { name: /Log play time for/i })).toBeTruthy();
      expect(screen.queryByText(/also counts for Sam|logs your shared time/i)).toBeNull();
      unmount();
    }
  });
});

describe("GameActions story locking (prerequisites)", () => {
  const prereq = () => game({ id: "pre", title: "Xenoblade Chronicles 2", status: "backlog" });
  const sequel = () =>
    game({
      id: "seq",
      title: "Xenoblade Chronicles 3",
      released: "2022-07-29",
      hours: 60,
      prerequisiteGameId: "pre",
    });

  it("replaces Buy & Start with an interception while the prerequisite is unfinished", () => {
    act(() => useStore.setState({ viewing: null, games: [prereq(), sequel()], coins: 500 }));
    render(<GameActions game={sequel()} />);

    const locked = screen.getByRole("button", { name: /Story-locked/i });
    expect(locked).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Buy & Start/i })).toBeNull();

    // Clicking explains the lock instead of opening the activation chooser.
    fireEvent.click(locked);
    expect(screen.getByRole("heading", { name: /Story-locked/i })).toBeTruthy();
    expect(screen.getByText(/unlocks the moment/i)).toBeTruthy();
    expect(screen.queryByText(/How do you want to start/i)).toBeNull();
  });

  it("unlocks automatically once the prerequisite is Finished (derived state)", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        games: [{ ...prereq(), status: "finished" as const }, sequel()],
        coins: 500,
      }),
    );
    render(<GameActions game={sequel()} />);
    expect(screen.getByRole("button", { name: /Buy & Start/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Story-locked/i })).toBeNull();
  });

  it("never locks when the prerequisite row is gone (deleted → set-null semantics)", () => {
    act(() => useStore.setState({ viewing: null, games: [sequel()], coins: 500 }));
    render(<GameActions game={sequel()} />);
    expect(screen.getByRole("button", { name: /Buy & Start/i })).toBeTruthy();
  });
});

describe("GameActions — Retire It", () => {
  it("offers a Bazaar retire with no salvage (nothing was invested)", async () => {
    const retireGame = vi.fn(async () => {});
    act(() =>
      useStore.setState({ viewing: null, games: [game()], coins: 500, retireGame }),
    );
    render(<GameActions game={game()} />);

    fireEvent.click(screen.getByRole("button", { name: /Retire it/i }));
    // The confirm explains the terminal move and that no coins change hands.
    expect(screen.getByText(/No coins move/i)).toBeTruthy();
    expect(screen.getByText(/buying it again at full price/i)).toBeTruthy();

    // An optional "why" note rides along to the store action. (The opener and
    // the modal confirm share a name — the portaled confirm renders last.)
    fireEvent.change(screen.getByPlaceholderText(/Why didn't it click/i), {
      target: { value: "Combat felt off" },
    });
    const confirms = screen.getAllByRole("button", { name: /^Retire it$/i });
    fireEvent.click(confirms[confirms.length - 1]);
    await waitFor(() => expect(retireGame).toHaveBeenCalledWith("g1", "Combat felt off"));
  });

  it("retiring from a lane salvages everything paid, the same as Shelve It", () => {
    const playing = game({ status: "playing", pricePaid: 100 });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [playing],
        coins: 0,
        fetchPlaySessions: vi.fn(async () => []),
      }),
    );
    render(<GameActions game={playing} />);

    fireEvent.click(screen.getByRole("button", { name: /Retire it/i }));
    // All 100 paid comes back — the SAME amount Shelve pays, so there's no
    // shelve-first arbitrage (and no forfeit since d7445b38).
    expect(screen.getByText(/You'll salvage/i)).toBeTruthy();
    expect(screen.getByText(/everything you paid/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retire · \+.*100/i })).toBeTruthy();
  });

  it("a Retired card hides every free re-entry and offers only Return to Bazaar", async () => {
    const unretireGame = vi.fn(async () => {});
    const retired = game({ status: "finished", finishTag: "retired" });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [retired],
        replaySlots: 2,
        completionistSlots: 2,
        rotationSlots: 2,
        fetchPlaySessions: vi.fn(async () => []),
        unretireGame,
      }),
    );
    render(<GameActions game={retired} />);

    // No free way back into play…
    expect(screen.queryByRole("button", { name: /^Replay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Go for 100%/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Convert to Endless/i })).toBeNull();

    // …only the road through the Bazaar, confirmed with the full-price warning.
    // (Opener and confirm share a name — the portaled confirm renders last.)
    fireEvent.click(screen.getByRole("button", { name: /Return to Bazaar/i }));
    expect(screen.getByText(/normal buy at its full price/i)).toBeTruthy();
    const confirms = screen.getAllByRole("button", { name: /^Return to Bazaar$/i });
    fireEvent.click(confirms[confirms.length - 1]);
    await waitFor(() => expect(unretireGame).toHaveBeenCalledWith("g1"));
  });

  it("'Retired' is pickable in the Finished tag select", () => {
    const beaten = game({ status: "finished", finishTag: "beaten" });
    act(() =>
      useStore.setState({
        viewing: null,
        games: [beaten],
        fetchPlaySessions: vi.fn(async () => []),
      }),
    );
    render(<GameActions game={beaten} />);
    expect(screen.getByRole("option", { name: "Retired" })).toBeTruthy();
  });
});

describe("GameActions feature-bonus preview", () => {
  const prequel = () => game({ id: "p", title: "Part One", status: "finished" });

  it("lists the bonuses a playing run is set up to earn under Mark Finished", () => {
    const run = game({
      id: "s",
      status: "playing",
      prerequisiteGameId: "p",
      startedStoryLocked: true,
      copies: [{ id: "c", platform: "PC", cost: 15 }],
    });
    act(() => useStore.setState({ viewing: null, economyEnabled: true, games: [prequel(), run] }));
    render(<GameActions game={run} />);
    expect(screen.getByText(/Bonus on finish: Story Order \+20 · Collector's Record \+10/)).toBeTruthy();
  });

  it("previews Story Order on a story-locked Bazaar game's finish-bounty line", () => {
    const sequel = game({ id: "s", prerequisiteGameId: "p", released: "2015-01-01", hours: 10 });
    act(() =>
      useStore.setState({ viewing: null, economyEnabled: true, coins: 500, games: [prequel(), sequel] }),
    );
    render(<GameActions game={sequel} />);
    expect(screen.getByText(/Finish bounty .* · Story Order \+20/)).toBeTruthy();
  });

  it("shows no bonus line for a replay run", () => {
    const run = game({ id: "s", status: "playing", resumed: true, startedStoryLocked: true });
    act(() => useStore.setState({ viewing: null, economyEnabled: true, games: [prequel(), run] }));
    render(<GameActions game={run} />);
    expect(screen.queryByText(/Bonus on finish/)).toBeNull();
  });
});

describe("GameActions Buy & Start with a full Focus lane (issue d06bb5fd)", () => {
  const focusFull = () => [
    game({ id: "b", hours: 10 }),
    game({ id: "f", status: "playing" }),
  ];

  beforeEach(() => {
    act(() =>
      useStore.setState({
        viewing: null,
        economyEnabled: true,
        coins: 1000,
        vouchers: 0,
        generalSlots: 1,
        completionistSlots: 2,
        coOpPacts: [],
        games: focusFull(),
      }),
    );
  });

  it("stays available when the Completionist lane has room", () => {
    render(<GameActions game={focusFull()[0]} />);
    const buy = screen.getByRole("button", { name: /Buy & Start/i }) as HTMLButtonElement;
    expect(buy.disabled).toBe(false);
    expect(screen.queryByText(/No open slot/i)).toBeNull();
  });

  it("reads No open slot only when Completionist is full too", () => {
    act(() => useStore.setState({ completionistSlots: 0 }));
    render(<GameActions game={focusFull()[0]} />);
    expect(screen.getByText(/No open slot/i)).toBeTruthy();
  });

  it("lets a pact-bound card start into the uncapped Co-op lane", () => {
    act(() =>
      useStore.setState({
        completionistSlots: 0,
        coOpPacts: [{ id: "pact", status: "active", myGameId: "b" } as never],
      }),
    );
    render(<GameActions game={focusFull()[0]} />);
    const buy = screen.getByRole("button", { name: /Buy & Start/i }) as HTMLButtonElement;
    expect(buy.disabled).toBe(false);
  });

  it("doesn't offer a voucher start when only Focus would take it", () => {
    act(() => useStore.setState({ coins: 0, vouchers: 2 }));
    render(<GameActions game={focusFull()[0]} />);
    expect(screen.queryByText(/Use voucher to start/i)).toBeNull();
    expect(screen.getByText(/Need/)).toBeTruthy();
  });
});

describe("GameActions finish check (coin outliers, 2026-10-17)", () => {
  const playing = (over: Partial<Game> = {}) =>
    game({ id: "p", status: "playing", hours: 40, pricePaid: 10, playedHours: 0, startedAt: 1, ...over });

  beforeEach(() => {
    act(() =>
      useStore.setState({ viewing: null, economyEnabled: true, bountyGatePct: 25, activeSession: null }),
    );
  });

  it("asks before a finish that would hold part of the bounty", () => {
    const finishGame = vi.fn(async () => {});
    act(() => useStore.setState({ games: [playing()], finishGame }));
    render(<GameActions game={playing()} />);
    fireEvent.click(screen.getByRole("button", { name: /Mark Finished/i }));
    expect(finishGame).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: /Finish Alwa's Awakening/ });
    // Logged 0 of ~40h: the activation refund now, the rest at 10h logged.
    expect(dialog.textContent).toMatch(/logged 0h of about 40h/);
    expect(dialog.textContent).toMatch(/all of it at 10h/);

    fireEvent.click(screen.getByRole("button", { name: /Finish anyway/ }));
    expect(finishGame).toHaveBeenCalledWith("p");
  });

  it("logs the time first, then finishes", async () => {
    const finishGame = vi.fn(async () => {});
    const logPlaytime = vi.fn(async () => {});
    act(() => useStore.setState({ games: [playing()], finishGame, logPlaytime }));
    render(<GameActions game={playing()} />);
    fireEvent.click(screen.getByRole("button", { name: /Mark Finished/i }));
    fireEvent.change(screen.getByLabelText(/Time you played/), { target: { value: "12h" } });
    fireEvent.click(screen.getByRole("button", { name: /Log & finish/ }));
    await waitFor(() => expect(finishGame).toHaveBeenCalledWith("p"));
    expect(logPlaytime).toHaveBeenCalledWith("p", 12);
  });

  it("files a game beaten before joining under Finished, refunded, with no bounty", async () => {
    const abandonGame = vi.fn(async () => {});
    const bazaarToFinished = vi.fn(async () => {});
    const finishGame = vi.fn(async () => {});
    act(() => useStore.setState({ games: [playing()], abandonGame, bazaarToFinished, finishGame }));
    render(<GameActions game={playing()} />);
    fireEvent.click(screen.getByRole("button", { name: /Mark Finished/i }));
    fireEvent.click(screen.getByRole("button", { name: /I beat this before I joined/ }));
    await waitFor(() => expect(bazaarToFinished).toHaveBeenCalledWith("p", "beaten"));
    expect(abandonGame).toHaveBeenCalledWith("p");
    expect(finishGame).not.toHaveBeenCalled();
  });

  it("previews the finish at the player's bounty rate", () => {
    const g = playing({ playedHours: 10 });
    act(() => useStore.setState({ games: [g], bountyRate: 100 }));
    const { unmount } = render(<GameActions game={g} />);
    const normal = Number(
      screen.getByRole("button", { name: /Mark Finished/i }).textContent!.replace(/\D/g, ""),
    );
    unmount();
    act(() => useStore.setState({ bountyRate: 130 }));
    render(<GameActions game={g} />);
    const raised = Number(
      screen.getByRole("button", { name: /Mark Finished/i }).textContent!.replace(/\D/g, ""),
    );
    expect(raised).toBe(Math.round(normal * 1.3));
    act(() => useStore.setState({ bountyRate: 100 }));
  });

  it("finishes straight away with enough logged", () => {
    const finishGame = vi.fn(async () => {});
    act(() => useStore.setState({ games: [playing({ playedHours: 10 })], finishGame }));
    render(<GameActions game={playing({ playedHours: 10 })} />);
    fireEvent.click(screen.getByRole("button", { name: /Mark Finished/i }));
    expect(finishGame).toHaveBeenCalledWith("p");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("GameActions coin event perks", () => {
  const EVENT = "Double Everything Weekend";

  beforeEach(() => {
    act(() =>
      useStore.setState({ viewing: null, economyEnabled: true, bountyGatePct: 25, bountyRate: 100, activeSession: null }),
    );
  });

  it("marks a Bazaar card's start as discounted, and lets a player afford the event price", () => {
    const solo = game({ id: "a", released: "2015-01-01", hours: 10 });
    act(() => useStore.setState({ games: [solo], coins: 100_000 }));
    const { unmount } = render(<GameActions game={solo} />);
    const full = Number(
      screen.getByRole("button", { name: /Buy & Start/i }).textContent!.replace(/\D/g, ""),
    );
    unmount();

    act(() =>
      useStore.setState({
        coins: full - 1,
        bonusPerks: { a: { discount: { event: EVENT, pct: 50, capLeft: null } } },
      }),
    );
    render(<GameActions game={solo} />);
    expect(screen.getByText(`${EVENT}: 50% off this start`)).toBeTruthy();
    const buy = screen.getByRole("button", { name: /Buy & Start/i }) as HTMLButtonElement;
    expect(buy.querySelector("s")?.textContent).toBe(String(full));
    expect(buy.textContent).toMatch(new RegExp(`${full - Math.floor(full / 2)}$`));
    // One coin short of the full price, but enough for the event price.
    expect(buy.disabled).toBe(false);
  });

  it("shows the event's bonus under Mark Finished, doubling what the finish pays", () => {
    const g = game({ id: "p", status: "playing", hours: 40, pricePaid: 10, playedHours: 10, startedAt: 1 });
    act(() =>
      useStore.setState({
        games: [g],
        bonusPerks: { p: { bounty: { event: EVENT, factor: 2, capLeft: null } } },
      }),
    );
    render(<GameActions game={g} />);
    const reward = Number(
      screen.getByRole("button", { name: /Mark Finished/i }).textContent!.replace(/\D/g, ""),
    );
    const line = screen.getByText(new RegExp(`${EVENT}:`)).textContent!.replace(/\s+/g, " ");
    expect(reward).toBeGreaterThan(0);
    expect(line).toContain(`+ ${reward} on finish`);
  });

  it("says a boost needs a verified finish, and names what finishing early gives up", () => {
    // 0 of ~40h logged: only a verified finish earns the event's boost.
    const g = game({ id: "p", status: "playing", hours: 40, pricePaid: 10, playedHours: 0, startedAt: 1 });
    act(() =>
      useStore.setState({ games: [g], bonusPerks: { p: { bounty: { event: EVENT, factor: 2, capLeft: null } } } }),
    );
    render(<GameActions game={g} />);
    expect(screen.getByText(new RegExp(`${EVENT}:`)).textContent).toMatch(/on a verified finish$/);
    fireEvent.click(screen.getByRole("button", { name: /Mark Finished/i }));
    const dialog = screen.getByRole("dialog", { name: /Finish Alwa's Awakening/ });
    expect(dialog.textContent).toMatch(new RegExp(`Finishing now gives up ${EVENT} \\+\\d+`));
  });

  it("checks before an early finish that holds nothing but would give up a bonus", () => {
    // Paid more than the bounty, so nothing is held, but Collector's Record needs a verified finish.
    const g = game({
      id: "p",
      status: "playing",
      hours: 40,
      pricePaid: 100_000,
      playedHours: 0,
      startedAt: 1,
      copies: [{ id: "c", platform: "PC", cost: 30 }],
    });
    act(() => useStore.setState({ games: [g], bonusPerks: {} }));
    render(<GameActions game={g} />);
    expect(screen.getByText(/Bonus on a verified finish: Collector's Record \+10/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Mark Finished/i }));
    expect(screen.getByRole("dialog", { name: /Finish Alwa's Awakening/ }).textContent).toMatch(
      /Finishing now gives up Collector's Record \+10/,
    );
  });

  it("tells a Bazaar card its bounty is boosted if it's finished in time", () => {
    const solo = game({ id: "a", released: "2015-01-01", hours: 10 });
    act(() =>
      useStore.setState({
        games: [solo],
        coins: 100_000,
        bonusPerks: { a: { bounty: { event: EVENT, factor: 2, capLeft: null } } },
      }),
    );
    render(<GameActions game={solo} />);
    expect(screen.getByText(new RegExp(`${EVENT}: bounty ×2 if you finish while it runs`))).toBeTruthy();
  });

  it("tells a Now Playing card its Daily Session coins are boosted", () => {
    const g = game({ id: "p", status: "playing", hours: 40, pricePaid: 10, playedHours: 10, startedAt: 1 });
    act(() =>
      useStore.setState({
        games: [g],
        bonusPerks: { p: { session: { event: EVENT, factor: 2, capLeft: null } } },
      }),
    );
    render(<GameActions game={g} />);
    expect(screen.getByText(new RegExp(`${EVENT}: Daily Session coins ×2 when you log time`))).toBeTruthy();
  });
});

describe("GameActions Rotation card (Rotation players, 2026-10-17)", () => {
  const rotation = () =>
    game({ id: "r", title: "Hearthstone", status: "playing", ongoing: true, inRotation: true, playedHours: 12 });

  beforeEach(() => {
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        economyEnabled: true,
        activeSession: null,
        rotationCheckedIn: [],
        rotationMilestone: { hours: 10, reward: 25 },
        rotationProgress: { r: { hours: 13.5, paid: 1 } },
      }),
    );
  });

  it("logs time and runs the stopwatch like a Now Playing card", () => {
    const logPlaytime = vi.fn(async () => {});
    act(() => useStore.setState({ games: [rotation()], logPlaytime }));
    render(<GameActions game={rotation()} />);
    fireEvent.change(screen.getByLabelText("Log play time for Hearthstone"), { target: { value: "45m" } });
    fireEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(logPlaytime).toHaveBeenCalledWith("r", 0.75, undefined, undefined, undefined);
    expect(screen.getByRole("button", { name: /Start stopwatch/ })).toBeTruthy();
  });

  it("shows a coin event's play boost on the check-in and milestone amounts", () => {
    act(() =>
      useStore.setState({
        games: [rotation()],
        rotationCheckinReward: 50,
        bonusPerks: { r: { session: { event: "Double Weekend", factor: 2, capLeft: null } } },
      }),
    );
    render(<GameActions game={rotation()} />);
    expect(screen.getByRole("button", { name: /Played this week/ }).textContent).toMatch(/100/);
    expect(screen.getByText(/Double Weekend: Rotation rewards ×2/)).toBeTruthy();
    expect(screen.getByText(/Next milestone/).parentElement?.textContent).toMatch(/\+\s*50/);
  });

  it("shows how far it is to the next hours milestone", () => {
    act(() => useStore.setState({ games: [rotation()] }));
    render(<GameActions game={rotation()} />);
    expect(screen.getByText(/Next milestone: 6h 30m to go/)).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: /next Rotation milestone/ }).getAttribute("aria-valuenow")).toBe("35");
  });
});

describe("GameActions — drop-in sessions", () => {
  it("logs a session on a Finished card, with a note, and keeps the game where it is", async () => {
    const logPlaytime = vi.fn(async () => {});
    const finished = game({ status: "finished", finishTag: "beaten", playedHours: 40 });
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        activeSession: null,
        games: [finished],
        fetchPlaySessions: vi.fn(async () => []),
        logPlaytime,
      }),
    );
    render(<GameActions game={finished} />);

    // Tucked away until asked for.
    expect(screen.queryByLabelText(/Log play time for/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Log a session/i }));
    expect(screen.getByRole("button", { name: /Start stopwatch/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Log play time for/), { target: { value: "1h 30m" } });
    fireEvent.change(screen.getByLabelText(/Note for this session/), { target: { value: "one quick hunt" } });
    fireEvent.click(screen.getByRole("button", { name: /^Log$/ }));
    await waitFor(() => expect(logPlaytime).toHaveBeenCalledWith("g1", 1.5, undefined, undefined, "one quick hunt"));
  });

  it("stops a stopwatch running on the card before the game moves", async () => {
    const openSessionStop = vi.fn();
    const unretireGame = vi.fn(async () => {});
    const retired = game({ status: "finished", finishTag: "retired" });
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        games: [retired],
        activeSession: { id: "s1", gameId: "g1", gameTitle: retired.title, platform: null, format: null, startedAt: Date.now() },
        fetchPlaySessions: vi.fn(async () => []),
        openSessionStop,
        unretireGame,
      }),
    );
    render(<GameActions game={retired} />);
    fireEvent.click(screen.getByRole("button", { name: /Return to Bazaar/i }));
    const confirms = screen.getAllByRole("button", { name: /^Return to Bazaar$/i });
    fireEvent.click(confirms[confirms.length - 1]);
    expect(openSessionStop).toHaveBeenCalledTimes(1);
    expect(unretireGame).not.toHaveBeenCalled();
    // The move runs once the session is logged or discarded.
    (openSessionStop.mock.calls[0] as unknown as [() => void])[0]();
    await waitFor(() => expect(unretireGame).toHaveBeenCalledWith("g1"));
  });

  it("offers it on a Retired card too", () => {
    const retired = game({ status: "finished", finishTag: "retired" });
    act(() => useStore.setState({ viewing: null, games: [retired], fetchPlaySessions: vi.fn(async () => []) }));
    render(<GameActions game={retired} />);
    fireEvent.click(screen.getByRole("button", { name: /Log a session/i }));
    expect(screen.getByLabelText(/Log play time for/)).toBeTruthy();
  });
});
