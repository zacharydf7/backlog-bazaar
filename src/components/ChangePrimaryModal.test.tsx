import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChangePrimaryModal } from "./ChangePrimaryModal";
import { useStore } from "../store";
import type { UnifiedFamily } from "../lib/familyGrouping";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    familyId: "F",
    ...over,
  } as Game;
}

function family(members: Game[], primary: Game): UnifiedFamily {
  return { familyId: "F", members, primary, board: primary.status, name: primary.title };
}

const setFamilyPrimary = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  act(() => useStore.setState({ setFamilyPrimary }));
});

describe("ChangePrimaryModal", () => {
  it("crowns the current primary and disables the confirm until a different pick", () => {
    const a = game({ id: "a", title: "Old Port" });
    const b = game({ id: "b", title: "Remaster" });
    render(<ChangePrimaryModal family={family([a, b], a)} onClose={() => {}} />);

    expect(screen.getByText("Primary")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: /Make primary/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Remaster/i }));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });

  it("promises the run handoff when the outgoing primary is Now Playing", () => {
    const a = game({ id: "a", title: "Old Port", status: "playing" });
    const b = game({ id: "b", title: "Remaster" });
    render(<ChangePrimaryModal family={family([a, b], a)} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("radio", { name: /Remaster/i }));
    expect(screen.getByText(/logged hours, progress note and journey milestones move/i)).toBeTruthy();
    expect(screen.getByText(/live Now Playing run/i)).toBeTruthy();
  });

  it("promises designation-only when the outgoing primary is Finished (archived)", () => {
    const a = game({ id: "a", title: "Old Port", status: "finished" });
    const b = game({ id: "b", title: "Remaster" });
    render(<ChangePrimaryModal family={family([a, b], a)} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("radio", { name: /Remaster/i }));
    expect(screen.getByText(/concluded playthrough stays archived/i)).toBeTruthy();
    expect(screen.queryByText(/milestones move/i)).toBeNull();
  });

  it("applies the pick and closes", async () => {
    const onClose = vi.fn();
    const a = game({ id: "a", title: "Old Port" });
    const b = game({ id: "b", title: "Remaster" });
    render(<ChangePrimaryModal family={family([a, b], a)} onClose={onClose} />);

    fireEvent.click(screen.getByRole("radio", { name: /Remaster/i }));
    fireEvent.click(screen.getByRole("button", { name: /Make primary/i }));
    await waitFor(() => expect(setFamilyPrimary).toHaveBeenCalledWith("F", "b"));
    expect(onClose).toHaveBeenCalled();
  });
});
