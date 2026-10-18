import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { DropInSessionsSection } from "./DropInSessionsSection";
import { useStore } from "../../store";
import type { Game } from "../../types";

const GAME = { id: "g1", title: "Monster Hunter Wilds", status: "finished", playedHours: 42 } as Game;

describe("DropInSessionsSection", () => {
  it("lists each drop-in with its time and note, and no other session", async () => {
    const at = Date.parse("2026-10-18T12:00:00Z");
    act(() =>
      useStore.setState({
        fetchPlaySessions: vi.fn(async () => [
          { platform: null, format: null, hours: 1.5, createdAt: at, dropIn: true, note: "Harvest Festival event" },
          { platform: null, format: null, hours: 3, createdAt: at - 3_600_000, dropIn: false, note: null },
          { platform: null, format: null, hours: 0.5, createdAt: at - 86_400_000, dropIn: true, note: null },
        ]),
      }),
    );
    render(<DropInSessionsSection game={GAME} />);
    expect(await screen.findByText("Drop-in sessions")).toBeTruthy();
    expect(screen.getByText("Harvest Festival event")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows nothing until there's a drop-in", async () => {
    const fetchPlaySessions = vi.fn(async () => []);
    act(() => useStore.setState({ fetchPlaySessions }));
    const { container } = render(<DropInSessionsSection game={GAME} />);
    await act(async () => {});
    expect(fetchPlaySessions).toHaveBeenCalledWith("g1");
    expect(container.firstChild).toBeNull();
  });
});
