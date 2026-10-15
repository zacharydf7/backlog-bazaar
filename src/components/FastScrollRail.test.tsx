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

/** jsdom rects are all zeros — give the track a real geometry: 456px tall, so
 *  the 56px thumb's centre travels 400px (y = 28 … 428). */
function stubTrackRect() {
  screen.getByTestId("rail-track").getBoundingClientRect = () =>
    ({ top: 0, left: 0, bottom: 456, right: 44, width: 44, height: 456, x: 0, y: 0 }) as DOMRect;
}

// jsdom has no PointerEvent, and fireEvent.pointerDown's fallback drops the
// coordinates — dispatch MouseEvents with the pointer type instead (React
// listens by event NAME, so these reach onPointerDown & co. with clientY
// intact).
function pointer(el: Element, type: "pointerdown" | "pointermove" | "pointerup", clientY = 0) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, clientY }));
}

/** Scroll the window to `y` (jsdom's scrollY is a plain value we can redefine). */
function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
  fireEvent.scroll(window);
}

/** A sustained scroll — well past the two-screen reveal threshold. */
function huntScroll() {
  const vh = window.innerHeight;
  for (let i = 1; i <= 6; i++) scrollTo(i * vh * 0.5);
}

const thumb = () => screen.getByTestId("rail-thumb");

beforeEach(() => {
  scrollTo(0);
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

  it("never takes taps on the track — only the thumb is touchable, and only once shown", () => {
    render(<FastScrollRail cards={board(200)} sort="alpha" onJump={() => {}} />);
    expect(screen.getByTestId("rail-track").className).toContain("pointer-events-none");
    expect(thumb().className).toContain("pointer-events-none"); // hidden at rest
    huntScroll();
    expect(thumb().className).toContain("pointer-events-auto");
  });

  it("stays hidden through an ordinary flick and appears on a sustained scroll", () => {
    render(<FastScrollRail cards={board(200)} sort="alpha" onJump={() => {}} />);
    scrollTo(300);
    scrollTo(700);
    expect(thumb().className).toContain("opacity-0");
    huntScroll();
    expect(thumb().className).toContain("opacity-100");
  });

  it("grabbing the thumb names the position without jumping; dragging scrubs to a card", () => {
    const cards = board(260);
    const onJump = vi.fn();
    render(<FastScrollRail cards={cards} sort="alpha" onJump={onJump} />);
    huntScroll();
    stubTrackRect();

    pointer(thumb(), "pointerdown", 28);
    expect(onJump).not.toHaveBeenCalled();
    expect(screen.getByText(/^[A-Z]$/)).toBeTruthy(); // the bubble

    pointer(thumb(), "pointermove", 228); // centre of the travel
    expect(onJump).toHaveBeenCalledTimes(1);
    const target = cards[onJump.mock.calls[0][0] as number];
    expect(target.kind === "game" && target.game.title.startsWith("N")).toBe(true);
    expect(screen.getByText("N")).toBeTruthy();

    pointer(thumb(), "pointermove", 229); // same card — no re-jump
    expect(onJump).toHaveBeenCalledTimes(1);

    pointer(thumb(), "pointerup");
    expect(screen.queryByText("N")).toBeNull(); // bubble gone on release
  });

  it("captions the active sort's value under a metric sort", () => {
    const cards = board(200);
    const onJump = vi.fn();
    render(<FastScrollRail cards={cards} sort="playtime-asc" onJump={onJump} />);
    huntScroll();
    stubTrackRect();
    pointer(thumb(), "pointerdown", 228);
    pointer(thumb(), "pointermove", 428); // bottom of the travel
    expect(onJump).toHaveBeenCalledWith(199);
    expect(screen.getByText(/^~\d+h/)).toBeTruthy();
  });

  it("fades back out after a moment of stillness", () => {
    vi.useFakeTimers();
    try {
      render(<FastScrollRail cards={board(200)} sort="alpha" onJump={() => {}} />);
      huntScroll();
      expect(thumb().className).toContain("opacity-100");
      act(() => vi.advanceTimersByTime(1600));
      expect(thumb().className).toContain("opacity-0");
    } finally {
      vi.useRealTimers();
    }
  });
});
