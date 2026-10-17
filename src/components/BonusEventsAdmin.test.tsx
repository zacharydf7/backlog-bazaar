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
  repeatFrom: null,
  repeatTo: null,
  repeatWeek: null,
  prepTip: "",
  runs: [],
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
      skipBonusEventRun: vi.fn(async () => true),
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

  it("schedules an event on a monthly pattern, with no end date to pick", async () => {
    render(<BonusEventsAdmin />);
    await screen.findByText("Weekend Bounties");
    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    fireEvent.change(screen.getByPlaceholderText("Double Bounty Weekend"), { target: { value: "Collector's Week" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Repeats" }), { target: { value: "month_days" } });
    expect(screen.queryByLabelText("Ends")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Count days from" }), { target: { value: "end" } });
    fireEvent.change(screen.getByLabelText("Last how many days"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("How to prepare (optional)"), { target: { value: "Save your claims." } });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    await waitFor(() =>
      expect(useStore.getState().saveBonusEvent).toHaveBeenCalledWith(
        expect.objectContaining({ repeat: "month_days", repeatFrom: -7, repeatTo: -1, prepTip: "Save your claims." }),
      ),
    );
  });

  it("skips one run of a repeating event, and brings a skipped one back", async () => {
    const start = Date.now() + 7 * 86_400_000;
    act(() =>
      useStore.setState({
        fetchBonusEventsAdmin: vi.fn(async () => [
          {
            ...EVENT,
            runs: [
              { start, end: start + 2 * 86_400_000, skipped: false },
              { start: start + 7 * 86_400_000, end: start + 9 * 86_400_000, skipped: true },
            ],
          },
        ]),
      }),
    );
    render(<BonusEventsAdmin />);
    await screen.findByText("Weekend Bounties");
    fireEvent.click(screen.getByRole("button", { name: /^Skip the .* run$/ }));
    expect(useStore.getState().skipBonusEventRun).toHaveBeenCalledWith("e1", start, true);
    fireEvent.click(screen.getByRole("button", { name: /^Bring back the .* run$/ }));
    expect(useStore.getState().skipBonusEventRun).toHaveBeenCalledWith("e1", start + 7 * 86_400_000, false);
  });
});
