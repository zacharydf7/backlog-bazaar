import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MilestonesSection } from "./MilestonesSection";
import { useStore } from "../store";
import { todayISO, type GameMilestone } from "../lib/milestones";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Donkey Kong Bananza",
    status: "finished",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

const rows: GameMilestone[] = [
  { id: "m1", gameId: "g1", kind: "added", occurredOn: "2025-07-18", source: "backfill", createdAt: 1 },
  { id: "m2", gameId: "g1", kind: "started", occurredOn: "2025-08-04", source: "auto", createdAt: 2 },
  { id: "m3", gameId: "g1", kind: "beat", occurredOn: "2025-08-09", source: "auto", createdAt: 3 },
];

function setup(over: Partial<Parameters<typeof useStore.setState>[0]> = {}) {
  act(() =>
    useStore.setState({
      cloud: true,
      fetchGameMilestones: vi.fn(async () => rows),
      addGameMilestone: vi.fn(async (gameId: string, kind, occurredOn: string) => ({
        id: "new",
        gameId,
        kind,
        occurredOn,
        source: "manual" as const,
        createdAt: 99,
      })),
      updateGameMilestone: vi.fn(async () => true),
      removeGameMilestone: vi.fn(async () => true),
      ...over,
    }),
  );
}

beforeEach(() => setup());

async function open() {
  render(<MilestonesSection game={game()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Milestones/i }));
  await screen.findByLabelText("Added date");
}

describe("MilestonesSection", () => {
  it("collapsed header shows the count and a summary line", async () => {
    render(<MilestonesSection game={game()} />);
    expect(await screen.findByText(/Milestones/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/\(3\)/)).toBeTruthy());
    expect(screen.getByText(/Added 2025-07-18 · Started 2025-08-04 · Beat 2025-08-09/)).toBeTruthy();
  });

  it("expanded: renders sorted rows with labels, editable dates and an auto hint", async () => {
    await open();
    // One date input per row (the kind <select> also carries the label text,
    // so anchor on the inputs' aria-labels instead).
    expect(screen.getByLabelText("Added date")).toBeTruthy();
    expect(screen.getByLabelText("Started date")).toBeTruthy();
    expect((screen.getByLabelText("Beat date") as HTMLInputElement).value).toBe("2025-08-09");
    expect(screen.getAllByText("auto").length).toBe(3); // backfill + auto rows both hint
  });

  it("editing a date persists via updateGameMilestone", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Beat date"), { target: { value: "2025-08-10" } });
    const store = useStore.getState();
    await waitFor(() =>
      expect(store.updateGameMilestone).toHaveBeenCalledWith("m3", "2025-08-10"),
    );
  });

  it("rejects a future date edit (no store call)", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Beat date"), { target: { value: "2999-01-01" } });
    expect(useStore.getState().updateGameMilestone).not.toHaveBeenCalled();
  });

  it("removes a row via removeGameMilestone and drops it optimistically", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /Remove this Beat milestone/i }));
    await waitFor(() => expect(screen.queryByLabelText("Beat date")).toBeNull());
    expect(useStore.getState().removeGameMilestone).toHaveBeenCalledWith("m3");
  });

  it("adds a milestone with the drafted kind and date, appending the returned row", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Milestone kind"), { target: { value: "retired" } });
    fireEvent.change(screen.getByLabelText("Milestone date"), { target: { value: "2025-12-01" } });
    fireEvent.click(screen.getByRole("button", { name: /Add milestone/i }));
    await waitFor(() =>
      expect(useStore.getState().addGameMilestone).toHaveBeenCalledWith("g1", "retired", "2025-12-01"),
    );
    expect(await screen.findByLabelText("Retired date")).toBeTruthy();
  });

  it("disables Add while the draft date is invalid or future", async () => {
    await open();
    const dateInput = screen.getByLabelText("Milestone date") as HTMLInputElement;
    expect(dateInput.value).toBe(todayISO()); // defaults to today = valid
    fireEvent.change(dateInput, { target: { value: "2999-01-01" } });
    expect(
      (screen.getByRole("button", { name: /Add milestone/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows the explanatory footnote", async () => {
    await open();
    expect(screen.getByText(/recorded automatically the first time/i)).toBeTruthy();
    expect(screen.getByText(/backdate them/i)).toBeTruthy();
  });
});
