import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BonusEventsAdmin } from "./BonusEventsAdmin";
import { useStore } from "../store";
import type { AdminBonusEvent } from "../lib/bonusEvents";

const NOW = Date.now();

const EVENT: AdminBonusEvent = {
  id: "e1",
  name: "Weekend Bounties",
  description: "",
  startsAt: NOW - 86_400_000,
  endsAt: NOW + 86_400_000,
  repeat: "weekly",
  repeatUntil: null,
  nextStart: NOW - 86_400_000,
  nextEnd: NOW + 86_400_000,
  live: true,
  bountyMult: 2,
  sessionMult: 1,
  rewardsMult: 1,
  startDiscountPct: 0,
  discountLimit: null,
  genres: [],
  platforms: ["Switch"],
  offMainPlatform: false,
  minHours: null,
  maxHours: null,
  playerCap: 300,
  archivedAt: null,
  paidCoins: 450,
  players: 3,
};

beforeEach(() => {
  act(() =>
    useStore.setState({
      cloud: true,
      genreList: ["RPG", "Puzzle"],
      platformList: ["PS5", "Switch"],
      fetchBonusEventsAdmin: vi.fn(async () => [EVENT]),
      saveBonusEvent: vi.fn(async () => true),
      archiveBonusEvent: vi.fn(async () => true),
    }),
  );
});

describe("BonusEventsAdmin", () => {
  it("lists events with status, repeat, boosts, targets and payouts", async () => {
    render(<BonusEventsAdmin />);
    expect(await screen.findByText("Weekend Bounties")).toBeTruthy();
    expect(screen.getByText(/^Live · until .* · Every week$/)).toBeTruthy();
    expect(screen.getByText(/Bounties ×2 · for on Switch · cap 300 · paid 450 coins to 3 players/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));
    expect(useStore.getState().archiveBonusEvent).toHaveBeenCalledWith("e1", true);
  });

  it("creates a repeating, targeted event that starts now", async () => {
    render(<BonusEventsAdmin />);
    await screen.findByText("Weekend Bounties");
    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    expect(screen.getByText("Give the event a name.")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Double Bounty Weekend"), { target: { value: "RPG Rush" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Repeats" }), { target: { value: "weekly" } });
    fireEvent.click(screen.getByRole("button", { name: "RPG" }));
    fireEvent.click(screen.getByRole("button", { name: /Now/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    await waitFor(() =>
      expect(useStore.getState().saveBonusEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: null, name: "RPG Rush", repeat: "weekly", genres: ["RPG"], bountyMult: 2 }),
      ),
    );
    const draft = vi.mocked(useStore.getState().saveBonusEvent).mock.calls[0][0];
    expect(Math.abs(draft.startsAt - Date.now())).toBeLessThan(10_000);
    expect(draft.endsAt - draft.startsAt).toBe(2 * 86_400_000);
  });

  it("asks how many discounted starts once there's a discount, defaulting to 2", async () => {
    render(<BonusEventsAdmin />);
    await screen.findByText("Weekend Bounties");
    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    expect(screen.queryByLabelText("Discounted starts per player")).toBeNull();
    fireEvent.change(screen.getByLabelText("Start discount %"), { target: { value: "50" } });
    const limit = screen.getByLabelText("Discounted starts per player") as HTMLInputElement;
    expect(limit.value).toBe("2");
    fireEvent.change(limit, { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText("Double Bounty Weekend"), { target: { value: "Half Off" } });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    await waitFor(() =>
      expect(useStore.getState().saveBonusEvent).toHaveBeenCalledWith(
        expect.objectContaining({ startDiscountPct: 50, discountLimit: null }),
      ),
    );
  });

  it("notes that reward boosts ignore game filters", async () => {
    render(<BonusEventsAdmin />);
    await screen.findByText("Weekend Bounties");
    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    expect(screen.queryByText(/aren't tied to a game/)).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Goal & medal rewards" }), { target: { value: "2" } });
    expect(screen.getByText(/aren't tied to a game/)).toBeTruthy();
  });
});
