import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
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

  it("never renders an unmoderated custom cover for a visitor", () => {
    act(() =>
      useStore.setState({
        viewing: visit({
          games: [
            game({ title: "Secret Cover", status: "playing", image: "https://x/covers/uid/abc.jpg" }),
          ],
        }),
      }),
    );
    const { container } = render(<ProfileHub onOpenTab={() => {}} />);
    // The tile shows (title present) but the custom /covers/ image is not rendered.
    expect(screen.getByText("Secret Cover")).toBeTruthy();
    const imgs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(imgs.some((src) => src?.includes("/covers/"))).toBe(false);
  });

  it("applies the profile accent as a scoped CSS variable", () => {
    act(() => useStore.setState({ viewing: visit({ accent: "violet" }) }));
    const { container } = render(<ProfileHub onOpenTab={() => {}} />);
    const root = container.firstChild as HTMLElement;
    expect(root.style.getPropertyValue("--accent")).toBe("#a855f7");
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
