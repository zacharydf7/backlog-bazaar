import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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
    games: [],
    ...over,
  };
}

beforeEach(() => {
  act(() => useStore.setState({ viewing: null, cloud: true, games: [] }));
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
    expect(screen.queryByText(/^Accent$/)).toBeNull();
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

describe("ProfileHub — own profile (editable)", () => {
  it("shows the accent picker and bio editor for your own profile", () => {
    act(() =>
      useStore.setState({
        viewing: null,
        cloud: true,
        displayName: "Me",
        aboutMe: null,
        accent: null,
        games: [game({ title: "My Game", status: "backlog" })],
      }),
    );
    render(<ProfileHub onOpenTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Me", level: 1 })).toBeTruthy();
    // Editing affordances present (accent picker label + banner upload).
    expect(screen.getByText(/^Accent$/)).toBeTruthy();
    expect(screen.getByText(/Add an .About Me/i)).toBeTruthy();
  });
});
