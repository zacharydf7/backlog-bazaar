import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SeasonalChallengesAdmin } from "./SeasonalChallengesAdmin";
import { useStore } from "../store";
import type { AdminSeasonalChallenge } from "../lib/challenges";

const EVENT: AdminSeasonalChallenge = {
  id: "s1",
  name: "Autumn Push",
  description: "",
  metric: "hours_logged",
  target: 10,
  startsAt: Date.now() - 86_400_000,
  endsAt: Date.now() + 86_400_000,
  reward: 40,
  badgeId: "b1",
  archivedAt: null,
  completions: 2,
};

beforeEach(() => {
  act(() =>
    useStore.setState({
      cloud: true,
      fetchSeasonalChallengesAdmin: vi.fn(async () => [EVENT]),
      fetchBadges: vi.fn(async () => [
        { id: "b1", slug: "autumn", name: "Autumn Champion", description: null, icon: "leaf", prestige: 1, kind: "granted" as const, effect: null },
        { id: "b2", slug: "shop", name: "Bought Title", description: null, icon: "star", prestige: 1, kind: "shop" as const, effect: null },
      ]),
      saveSeasonalChallenge: vi.fn(async () => true),
      archiveSeasonalChallenge: vi.fn(async () => true),
    }),
  );
});

describe("SeasonalChallengesAdmin", () => {
  it("lists events with their goal, reward, badge and completions", async () => {
    render(<SeasonalChallengesAdmin />);
    expect(await screen.findByText("Autumn Push")).toBeTruthy();
    expect(
      await screen.findByText(/Hours logged: 10 · 40 coins · Autumn Champion badge · completed by 2/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));
    expect(useStore.getState().archiveSeasonalChallenge).toHaveBeenCalledWith("s1", true);
  });

  it("creates an event once the form is valid, offering only granted badges", async () => {
    render(<SeasonalChallengesAdmin />);
    await screen.findByText("Autumn Push");
    fireEvent.click(screen.getByRole("button", { name: /New challenge/ }));
    expect(screen.getByText("Give the challenge a name.")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Bought Title" })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Winter Clear-Out"), { target: { value: "Winter Clear-Out" } });
    fireEvent.click(screen.getByRole("button", { name: "Create challenge" }));
    await waitFor(() =>
      expect(useStore.getState().saveSeasonalChallenge).toHaveBeenCalledWith(
        expect.objectContaining({ id: null, name: "Winter Clear-Out", metric: "games_finished" }),
      ),
    );
  });
});
