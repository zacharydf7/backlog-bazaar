import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FastScrollRail, RAIL_MIN_CARDS } from "./FastScrollRail";
import { useStore } from "../store";
import { DEFAULT_PRICE_FORMULA, DEFAULT_BOUNTY_FORMULA } from "../lib/economy";
import type { Game } from "../types";
import type { StackedBoardCard } from "../lib/gameStacks";

function game(over: Partial<Game> = {}): Game {
  return {
    id: Math.random().toString(36),
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

/** A board of `n` cards with titles spread A…Z so the letter index has rungs. */
function board(n: number): StackedBoardCard[] {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: n }, (_, i) => ({
    kind: "game" as const,
    game: game({
      title: `${letters[Math.floor((i / n) * letters.length)]} Game ${String(i).padStart(3, "0")}`,
      hours: 10 + i,
      addedAt: new Date(2026, 0, 1 + i).getTime(),
    }),
  }));
}

/** jsdom rects are all zeros — give the rail track a real geometry so pointer
 *  fractions mean something. */
function stubTrackRect(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({ top: 0, left: 0, bottom: 400, right: 28, width: 28, height: 400, x: 0, y: 0 }) as DOMRect;
}

// jsdom has no PointerEvent, and fireEvent.pointerDown's fallback drops the
// coordinates — dispatch MouseEvents with the pointer type instead (React
// listens by event NAME, so these reach onPointerDown & co. with clientY
// intact).
function pointer(el: Element, type: "pointerdown" | "pointermove" | "pointerup", clientY = 0) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, clientY }));
}

beforeEach(() => {
  act(() =>
    useStore.setState({
      economy: { price: DEFAULT_PRICE_FORMULA, bounty: DEFAULT_BOUNTY_FORMULA },
      replayBonusPct: 50,
      games: [],
    }),
  );
});

describe("FastScrollRail", () => {
  it("renders nothing for a short board", () => {
    const { container } = render(
      <FastScrollRail cards={board(RAIL_MIN_CARDS - 1)} sort="alpha" onJump={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the letter index under the A–Z sort and jumps to a letter's first card", () => {
    const cards = board(260);
    const onJump = vi.fn();
    render(<FastScrollRail cards={cards} sort="alpha" onJump={onJump} />);
    const rail = screen.getByLabelText("Letter index");
    // Every board letter is a rung.
    expect(rail.textContent).toContain("A");
    expect(rail.textContent).toContain("Z");

    stubTrackRect(rail);
    // Half-way down the 26-rung track ≈ the 14th letter ("N").
    pointer(rail, "pointerdown", 200);
    expect(onJump).toHaveBeenCalledTimes(1);
    const target = cards[onJump.mock.calls[0][0] as number];
    expect(target.kind === "game" && target.game.title.startsWith("N")).toBe(true);
    // The center overlay anchors the position with the active letter.
    expect(screen.getAllByText("N").length).toBeGreaterThan(1);
  });

  it("dragging across letters jumps once per new letter, and release drops the overlay", () => {
    const cards = board(260);
    const onJump = vi.fn();
    render(<FastScrollRail cards={cards} sort="alpha" onJump={onJump} />);
    const rail = screen.getByLabelText("Letter index");
    stubTrackRect(rail);

    pointer(rail, "pointerdown", 0);
    pointer(rail, "pointermove", 4); // still "A" — no re-jump
    expect(onJump).toHaveBeenCalledTimes(1);
    pointer(rail, "pointermove", 399); // bottom — "Z"
    expect(onJump).toHaveBeenCalledTimes(2);

    pointer(rail, "pointerup");
    // Overlay letters are gone (the rail's own rungs remain).
    expect(document.querySelectorAll(".fixed.inset-0").length).toBe(0);
  });

  it("shows a scrubber handle (no letters) under a metric sort and maps the drag to an index", () => {
    const cards = board(200);
    const onJump = vi.fn();
    render(<FastScrollRail cards={cards} sort="playtime-asc" onJump={onJump} />);
    const rail = screen.getByLabelText("Fast scroll");
    expect(screen.getByTestId("rail-handle")).toBeTruthy();

    stubTrackRect(rail);
    pointer(rail, "pointerdown", 200); // middle of the track
    expect(onJump).toHaveBeenCalledWith(100); // round(0.5 × 199)
    // The overlay captions the landing card's metric — hours for this sort.
    expect(screen.getByText(/^~\d+h/)).toBeTruthy();
  });

  it("fades in on page scroll and back out after two idle seconds", () => {
    vi.useFakeTimers();
    try {
      render(<FastScrollRail cards={board(200)} sort="alpha" onJump={() => {}} />);
      const rail = screen.getByLabelText("Letter index");
      expect(rail.className).toContain("opacity-0"); // at rest: hidden

      fireEvent.scroll(window);
      expect(rail.className).toContain("opacity-100");

      act(() => vi.advanceTimersByTime(2100));
      expect(rail.className).toContain("opacity-0");
    } finally {
      vi.useRealTimers();
    }
  });
});
