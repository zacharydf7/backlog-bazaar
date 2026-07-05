import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { ProfileHub } from "./ProfileHub";
import { useStore, type ViewingSession } from "../store";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g" + Math.random().toString(36).slice(2, 7),
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

function visit(over: Partial<ViewingSession> = {}): ViewingSession {
  return {
    userId: "u2",
    displayName: "KaizoSamurai",
    avatarUrl: null,
    coins: 250,
    theme: null,
    gamesFinished: 3,
    hoursFinished: 40,
    hideSpend: false,
    lastSeenAt: null,
    activity: null,
    badges: [],
    title: null,
    aboutMe: "Veteran gamer | Achievement hunter",
    bannerUrl: null,
    accent: "violet",
    bg: null,
    games: [],
    ...over,
  };
}

beforeEach(() => {
  act(() =>
    useStore.setState({
      viewing: null,
      cloud: true,
      games: [],
      // Default the activity fetch to an in-flight promise so tests that don't
      // exercise the feed never take a post-assertion state update (act warning);
      // feed tests supply their own resolving mock and await it.
      fetchProfileActivity: vi.fn(() => new Promise<never>(() => {})),
      // Same for the visited-achievements fetch (own-profile reads store state).
      fetchUserAchievements: vi.fn(() => new Promise<never>(() => {})),
      achievements: [],
    }),
  );
});

describe("ProfileHub — visiting (read-only)", () => {
  it("renders the visited player's identity, bio, and module data", () => {
    act(() =>
      useStore.setState({
        viewing: visit({
          games: [
            game({ title: "Elden Ring", status: "playing" }),
            game({ title: "Hades", status: "finished" }),
          ],
        }),
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "KaizoSamurai", level: 1 })).toBeTruthy();
    expect(screen.getByText(/Veteran gamer/i)).toBeTruthy();
    expect(screen.getByText("Elden Ring")).toBeTruthy();
    expect(screen.getByText("Hades")).toBeTruthy();
    // No editing affordances while visiting.
    expect(screen.queryByText(/Edit colors/i)).toBeNull();
  });

  it("renders the custom cover the server sent (friends see covers; regression)", () => {
    // player_library swaps custom covers to the catalog default for NON-friends,
    // so a /covers/ URL reaching a visitor means they're a friend who may see it.
    // The hub used to hide it anyway, leaving friends' shelves blank.
    act(() =>
      useStore.setState({
        viewing: visit({
          games: [
            game({ title: "Custom Cover", status: "playing", image: "https://x/covers/uid/abc.jpg" }),
          ],
        }),
      }),
    );
    const { container } = render(<ProfileHub onOpenTab={() => {}} />);
    expect(screen.getByText("Custom Cover")).toBeTruthy();
    const imgs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(imgs.some((src) => src?.includes("/covers/"))).toBe(true);
  });

  it("applies the profile accent as a scoped CSS variable", () => {
    act(() => useStore.setState({ viewing: visit({ accent: "violet" }) }));
    const { container } = render(<ProfileHub onOpenTab={() => {}} />);
    const root = container.firstChild as HTMLElement;
    expect(root.style.getPropertyValue("--accent")).toBe("#a855f7");
  });

  it("applies the visited player's background as a full derived palette", () => {
    act(() => useStore.setState({ viewing: visit({ bg: "#0c0a09", accent: null }) }));
    const { container } = render(<ProfileHub onOpenTab={() => {}} />);
    const root = container.firstChild as HTMLElement;
    expect(root.style.getPropertyValue("--canvas")).toBe("#0c0a09");
    // The whole neutral palette rides along so the theme's ink can't clash.
    expect(root.style.getPropertyValue("--ink")).not.toBe("");
    expect(root.style.getPropertyValue("--panel")).not.toBe("");
  });
});

describe("ProfileHub — colors (own profile)", () => {
  it("opens the Colors modal from the Edit colors row", () => {
    act(() =>
      useStore.setState({ viewing: null, cloud: true, displayName: "Me", games: [], bg: null, accent: null }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit colors/i }));
    expect(screen.getByText("Profile colors")).toBeTruthy();
    expect(screen.getByLabelText("Preset colors")).toBeTruthy();
  });
});

describe("ProfileHub — banner frame", () => {
  it("renders a set banner at the crop modal's 3:1 frame (no re-crop; regression)", () => {
    // A fixed-height strip made object-cover re-crop the saved 3:1 image
    // vertically — the profile showed a zoomed-in band of what the user framed.
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        displayName: "Me",
        games: [],
        bannerUrl: "https://x/avatars/u1/banner.jpg",
      }),
    );
    const { container } = render(<ProfileHub onOpenTab={() => {}} />);
    const img = container.querySelector('img[src*="banner.jpg"]') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect((img.parentElement as HTMLElement).className).toContain("aspect-[3/1]");
  });

  it("keeps the shorter gradient strip when no banner is set", () => {
    act(() =>
      useStore.setState({ viewing: null, cloud: true, displayName: "Me", games: [], bannerUrl: null }),
    );
    const { container } = render(<ProfileHub onOpenTab={() => {}} />);
    expect(container.querySelector(".aspect-\\[3\\/1\\]")).toBeNull();
  });
});

describe("ProfileHub — recent activity", () => {
  const iso = (s: string) => Date.parse(s + "T12:00:00Z");

  function recentModule() {
    return within(screen.getByText("Recent Activity").closest("section") as HTMLElement);
  }

  it("builds the local feed from Added and Finished dates, newest first, with gold/silver chips", () => {
    const games = [
      game({ id: "s", title: "Stray", status: "backlog", addedAt: iso("2026-06-10") }),
      game({
        id: "h",
        title: "Hades",
        status: "finished",
        finishTag: "completed",
        addedAt: iso("2026-06-01"),
        finishedAt: iso("2026-07-03"),
      }),
      game({
        id: "c",
        title: "Celeste",
        status: "finished",
        finishTag: "beaten",
        addedAt: iso("2026-05-01"),
        finishedAt: iso("2026-06-20"),
      }),
    ];
    act(() => useStore.setState({ viewing: null, cloud: true, userId: null, games }));
    render(<ProfileHub onOpenTab={() => {}} />);
    const module = recentModule();
    // Milestone vocabulary: one Completed, one Beat, an Added per game.
    expect(module.getByText("Completed")).toBeTruthy();
    expect(module.getByText("Beat")).toBeTruthy();
    expect(module.getAllByText("Added")).toHaveLength(3);
    // Newest first: Hades's completion (Jul 3) leads the feed.
    expect((module.getAllByRole("button")[0].textContent ?? "")).toContain("Hades");
  });

  it("caps the feed at six with a show-all expander", () => {
    const games = Array.from({ length: 7 }, (_, i) =>
      game({ id: "g" + i, title: "Game " + i, status: "backlog", addedAt: 1000 * (i + 1) }),
    );
    act(() => useStore.setState({ viewing: null, cloud: true, userId: null, games }));
    render(<ProfileHub onOpenTab={() => {}} />);
    const module = recentModule();
    // Newest six shown; the oldest waits behind Show all.
    expect(module.getByText("Game 6")).toBeTruthy();
    expect(module.queryByText("Game 0")).toBeNull();
    fireEvent.click(module.getByRole("button", { name: /Show all 7/i }));
    expect(module.getByText("Game 0")).toBeTruthy();
  });

  it("omits endless conclusions (but still logs the Added step)", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        userId: null,
        games: [
          game({ id: "m", title: "MMO", status: "finished", finishTag: "endless", finishedAt: iso("2026-07-01"), addedAt: iso("2026-06-01") }),
        ],
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    const module = recentModule();
    // The endless finish is not a clear, so no Beat/Completed chip…
    expect(module.queryByText("Beat")).toBeNull();
    expect(module.queryByText("Completed")).toBeNull();
    // …but the Added milestone still appears.
    expect(module.getByText("Added")).toBeTruthy();
  });

  it("opens a game's page from an activity row", () => {
    window.history.replaceState(null, "", "/");
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        userId: null,
        games: [game({ id: "x", title: "Stray", status: "backlog", addedAt: 5 })],
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    // One backlog game → a single Added row, so the match is unambiguous.
    fireEvent.click(recentModule().getByRole("button", { name: /Stray/i }));
    expect(window.location.hash).toBe("#g/x");
  });

  it("shows the server milestone feed (incl. Started) online, replacing the local fallback", async () => {
    const fetchProfileActivity = vi.fn(async () => [
      { id: "m1", kind: "started" as const, occurredOn: "2026-07-02", createdAt: 2, gameId: "g1", gameTitle: "Elden Ring", gameImage: null, finishTag: null },
      { id: "m2", kind: "added" as const, occurredOn: "2026-07-01", createdAt: 1, gameId: "g1", gameTitle: "Elden Ring", gameImage: null, finishTag: null },
    ]);
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        userId: "me",
        games: [game({ id: "g1", title: "Elden Ring", status: "playing" })],
        fetchProfileActivity,
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    expect(fetchProfileActivity).toHaveBeenCalledWith("me");
    // "Started" only exists in the server feed — proof it replaced the fallback.
    await waitFor(() => expect(recentModule().getByText("Started")).toBeTruthy());
  });

  it("shows an empty note when there's no activity", () => {
    act(() => useStore.setState({ viewing: null, cloud: true, userId: null, games: [] }));
    render(<ProfileHub onOpenTab={() => {}} />);
    expect(recentModule().getByText(/start your timeline/i)).toBeTruthy();
  });
});

describe("ProfileHub — platform breakdown", () => {
  it("rolls the library into per-platform segmented rows with counts and totals", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        games: [
          game({ copies: [{ id: "a", platform: "Nintendo Switch" }] }),
          game({
            copies: [{ id: "b", platform: "Nintendo Switch" }],
            status: "finished",
            finishTag: "completed",
          }),
          game({ copies: [{ id: "c", platform: "PC" }], status: "playing" }),
        ],
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    // Scope to the module — the game tiles elsewhere also print platform names.
    const module = within(screen.getByText("Platforms").closest("section") as HTMLElement);
    expect(module.getByText("Nintendo Switch")).toBeTruthy();
    expect(module.getByText(/1 in the Bazaar · 1 completed · 2 total/)).toBeTruthy();
    expect(module.getByText(/1 playing · 1 total/)).toBeTruthy();
    // Neither shelf is fully cleared.
    expect(module.queryByText(/100% cleared/)).toBeNull();
    expect(module.getByText("1/2 cleared")).toBeTruthy();
  });

  it("gives a fully-finished platform the 100% treatment", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        games: [
          game({
            copies: [{ id: "a", platform: "GameCube" }],
            status: "finished",
            finishTag: "beaten",
          }),
        ],
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    expect(screen.getByText(/100% cleared/)).toBeTruthy();
  });

  it("renders for a visited profile from the snapshot library", () => {
    act(() =>
      useStore.setState({
        viewing: visit({
          games: [game({ copies: [{ id: "a", platform: "PS Vita" }], status: "playing" })],
        }),
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    const module = within(screen.getByText("Platforms").closest("section") as HTMLElement);
    expect(module.getByText("PS Vita")).toBeTruthy();
    expect(module.getByText(/1 playing · 1 total/)).toBeTruthy();
  });
});

describe("ProfileHub — game tiles", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  it("opens the game's page when a Now Playing tile is clicked", () => {
    act(() =>
      useStore.setState({ viewing: null, cloud: true, games: [game({ title: "Elden Ring", status: "playing" })] }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    const module = within(screen.getByText("Now Playing").closest("section") as HTMLElement);
    fireEvent.click(module.getByRole("button", { name: /Elden Ring/i }));
    expect(window.location.hash).toBe("#g/" + useStore.getState().games[0].id);
  });

  it("opens the game's page when a Finished tile is clicked", () => {
    act(() =>
      useStore.setState({ viewing: null, cloud: true, games: [game({ title: "Hades", status: "finished" })] }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    // Scope via the module heading — "Finished" also labels a Bazaar stat.
    const module = within(
      screen.getByRole("heading", { name: /Finished/ }).closest("section") as HTMLElement,
    );
    fireEvent.click(module.getByRole("button", { name: /Hades/i }));
    expect(window.location.hash).toBe("#g/" + useStore.getState().games[0].id);
  });

  it("routes a visited player's tile to the visit-scoped game hash", () => {
    act(() =>
      useStore.setState({
        viewing: visit({ userId: "u2", games: [game({ title: "Celeste", status: "playing" })] }),
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    const id = (useStore.getState().viewing as ViewingSession).games[0].id;
    const module = within(screen.getByText("Now Playing").closest("section") as HTMLElement);
    fireEvent.click(module.getByRole("button", { name: /Celeste/i }));
    expect(window.location.hash).toContain("u2");
    expect(window.location.hash).toContain(id);
  });

  it("shows only the cover and title — no redundant status or platform chip", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        games: [
          game({
            title: "Elden Ring",
            status: "playing",
            copies: [{ id: "c1", platform: "Nintendo Switch" }],
          }),
        ],
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    const module = within(screen.getByText("Now Playing").closest("section") as HTMLElement);
    expect(module.getByText("Elden Ring")).toBeTruthy();
    // "Now Playing" survives only as the module header — no per-tile status stamp.
    expect(module.getAllByText("Now Playing")).toHaveLength(1);
    // The platform pill is gone from the tile.
    expect(module.queryByText("Nintendo Switch")).toBeNull();
  });
});

describe("ProfileHub — In Rotation (b4c6ac9d)", () => {
  it("surfaces live-service games in their own In Rotation section, not Now Playing", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        games: [
          game({ title: "Hearthstone", status: "playing", inRotation: true }),
          game({ title: "Elden Ring", status: "playing" }),
        ],
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    const rotation = within(screen.getByText("In Rotation").closest("section") as HTMLElement);
    expect(rotation.getByText("Hearthstone")).toBeTruthy();
    const nowPlaying = within(
      screen.getByRole("heading", { name: /Now Playing/ }).closest("section") as HTMLElement,
    );
    // The focused run stays under Now Playing; the live-service game does not.
    expect(nowPlaying.getByText("Elden Ring")).toBeTruthy();
    expect(nowPlaying.queryByText("Hearthstone")).toBeNull();
  });

  it("hides Now Playing when everything in play is in rotation", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        games: [game({ title: "Hearthstone", status: "playing", inRotation: true })],
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    expect(screen.queryByRole("heading", { name: /Now Playing/ })).toBeNull();
    expect(screen.getByText("In Rotation")).toBeTruthy();
  });

  it("labels a rotation game's Started step as In Rotation in Recent Activity", async () => {
    const fetchProfileActivity = vi.fn(async () => [
      {
        id: "m1",
        kind: "started" as const,
        occurredOn: "2026-07-02",
        createdAt: 2,
        gameId: "g1",
        gameTitle: "Hearthstone",
        gameImage: null,
        finishTag: null,
      },
    ]);
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        userId: "me",
        games: [game({ id: "g1", title: "Hearthstone", status: "playing", inRotation: true })],
        fetchProfileActivity,
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    const module = within(screen.getByText("Recent Activity").closest("section") as HTMLElement);
    await waitFor(() => expect(module.getByText("In Rotation")).toBeTruthy());
    // The generic "Started" stamp is replaced, not shown alongside.
    expect(module.queryByText("Started")).toBeNull();
  });
});

describe("ProfileHub — own profile (editable)", () => {
  it("shows the colors row and bio editor for your own profile", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        displayName: "Me",
        aboutMe: null,
        accent: null,
        bg: null,
        games: [game({ title: "My Game", status: "backlog" })],
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Me", level: 1 })).toBeTruthy();
    // Editing affordances present (colors row + bio editor).
    expect(screen.getByRole("button", { name: /Edit colors/i })).toBeTruthy();
    expect(screen.getByText(/Add an .About Me/i)).toBeTruthy();
  });
});

describe("ProfileHub — Achievements module", () => {
  const earnedMedal = {
    id: "a1",
    slug: "first-clear",
    family: "finisher",
    tier: 1 as const,
    name: "First Clear",
    description: "Finish your first game",
    icon: "trophy",
    metric: "games_finished",
    threshold: 1,
    sort: 1,
    earnedAt: 100,
    metricValue: 3,
    holders: 3,
    players: 20,
  };

  it("shows your earned medals with a View all into the trophy room", () => {
    act(() => useStore.setState({ achievements: [earnedMedal] }));
    const onOpen = vi.fn();
    render(<ProfileHub onOpenTab={() => {}} onOpenAchievements={onOpen} />);
    const module = within(screen.getByText("Achievements").closest("section") as HTMLElement);
    expect(module.getByText("First Clear")).toBeTruthy();
    expect(module.getByText("1 of 1 earned")).toBeTruthy();
    fireEvent.click(module.getByRole("button", { name: /View all/i }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("nudges toward earning when the case is empty", () => {
    render(<ProfileHub onOpenTab={() => {}} />);
    const module = within(screen.getByText("Achievements").closest("section") as HTMLElement);
    expect(module.getByText(/earn medals/i)).toBeTruthy();
  });
});
