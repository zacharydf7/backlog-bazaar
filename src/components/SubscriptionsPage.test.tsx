import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SubscriptionsPage } from "./SubscriptionsPage";
import { useStore } from "../store";
import type { Game, GameCopy } from "../types";
import type { MembershipSession, Subscription } from "../lib/subscriptions";

const plan = (over: Partial<Subscription> = {}): Subscription => ({
  id: "s1",
  provider: "PlayStation Plus Premium",
  price: 100,
  cadence: "yearly",
  startedOn: "2020-01-01",
  endedOn: null,
  note: "",
  ...over,
});

const copy = (over: Partial<GameCopy> = {}): GameCopy => ({
  id: Math.random().toString(36).slice(2),
  platform: "PlayStation 5",
  ...over,
});

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Need for Speed Unbound",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [copy({ acquisition: "subscription", provider: "PlayStation Plus Premium" })],
    addedAt: Date.parse("2020-02-01T12:00:00"),
    familyId: null,
    ...over,
  } as Game;
}

const sessionsOf = (rows: MembershipSession[]) => vi.fn(async () => rows);

beforeEach(() => {
  act(() =>
    useStore.setState({
      cloud: true,
      viewing: null,
      targetCostPerHour: 2,
      subscriptions: [],
      games: [],
      fetchSubscriptions: async () => {},
      fetchMembershipSessions: sessionsOf([]),
    }),
  );
});

describe("SubscriptionsPage", () => {
  it("asks guests to sign in", () => {
    act(() => useStore.setState({ cloud: false }));
    render(<SubscriptionsPage />);
    expect(screen.getByText(/sign in to track/i)).toBeTruthy();
  });

  it("shows the empty state with a call to add the first plan", () => {
    render(<SubscriptionsPage />);
    expect(screen.getByRole("button", { name: /Add your first plan/i })).toBeTruthy();
    expect(screen.queryByText("Well spent")).toBeNull();
  });

  it("opens the plan form from the header button", () => {
    render(<SubscriptionsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Add a plan$/i }));
    expect(screen.getByLabelText("Service")).toBeTruthy();
    expect(screen.getByLabelText("Price")).toBeTruthy();
    expect(screen.getByLabelText("Started on")).toBeTruthy();
  });

  it("judges a membership from its linked games' sessions and wears the badge once paid off", async () => {
    // One yearly plan started long ago: many periods paid — keep the maths
    // simple with a cheap plan and a fetch that pays it off many times over.
    const fetchMembershipSessions = sessionsOf([
      {
        gameId: "g1",
        platform: "PlayStation 5",
        hours: 5000,
        createdAt: Date.parse("2021-06-01T12:00:00"),
        live: true,
      },
    ]);
    act(() =>
      useStore.setState({
        subscriptions: [plan({ price: 10 })],
        games: [game(), game({ id: "g2", title: "Core Keeper" })],
        fetchMembershipSessions,
      }),
    );
    render(<SubscriptionsPage />);
    expect(screen.getByText("PlayStation Plus Premium")).toBeTruthy();
    expect(await screen.findByText("Well spent")).toBeTruthy();
    // Only the linked games' ids are fetched.
    expect(fetchMembershipSessions).toHaveBeenCalledWith(["g1", "g2"]);
    expect(screen.getByText(/2 games · 1 never played/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Details/i }));
    expect(screen.getByText("Need for Speed Unbound")).toBeTruthy();
    expect(screen.getByText("Core Keeper")).toBeTruthy();
    expect(screen.getByText("never played")).toBeTruthy();
    expect(screen.getByText(/Renewal periods/i)).toBeTruthy();
  });

  it("stays unjudged (no badge, a hint instead) without a target rate", async () => {
    act(() =>
      useStore.setState({
        targetCostPerHour: null,
        subscriptions: [plan()],
        games: [game()],
        fetchMembershipSessions: sessionsOf([
          { gameId: "g1", platform: null, hours: 999, createdAt: Date.now(), live: true },
        ]),
      }),
    );
    render(<SubscriptionsPage />);
    expect(await screen.findByText(/target cost per hour/i)).toBeTruthy();
    expect(screen.queryByText("Well spent")).toBeNull();
  });

  it("marks an ended membership and counts member discounts on purchases", async () => {
    act(() =>
      useStore.setState({
        subscriptions: [plan({ endedOn: "2021-01-01" })],
        games: [
          game({
            id: "bought",
            title: "Nine Sols",
            copies: [
              copy({ cost: 20, memberSavings: 15, savingsProvider: "playstation plus premium" }),
            ],
          }),
        ],
      }),
    );
    render(<SubscriptionsPage />);
    expect(screen.getByText("Ended")).toBeTruthy();
    expect(await screen.findByText("$15")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Details/i }));
    expect(screen.getByText("Nine Sols")).toBeTruthy();
    expect(screen.getByText("purchased")).toBeTruthy();
  });
});
