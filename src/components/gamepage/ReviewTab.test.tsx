import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ReviewTab } from "./ReviewTab";
import { useStore } from "../../store";
import type { Game } from "../../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Chrono Trigger",
    status: "finished",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

const setGameReview = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  setGameReview.mockClear();
  act(() => useStore.setState({ setGameReview }));
});

describe("ReviewTab — editor", () => {
  it("saves a full-star tap immediately", () => {
    render(<ReviewTab game={game()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rate 4 stars" }));
    expect(setGameReview).toHaveBeenCalledWith("g1", "", 8);
    expect(screen.getByText("4 / 5")).toBeTruthy();
  });

  it("saves a half-star tap (left zone)", () => {
    render(<ReviewTab game={game()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rate 3.5 stars" }));
    expect(setGameReview).toHaveBeenCalledWith("g1", "", 7);
    expect(screen.getByText("3.5 / 5")).toBeTruthy();
  });

  it("clears an existing score", () => {
    render(<ReviewTab game={game({ reviewScore: 9 })} />);
    expect(screen.getByText("4.5 / 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    expect(setGameReview).toHaveBeenCalledWith("g1", "", null);
  });

  it("saves the write-up on blur, carrying the current score", () => {
    render(<ReviewTab game={game({ reviewScore: 8, review: "Old take." })} />);
    const box = screen.getByLabelText(/Your review/);
    fireEvent.change(box, { target: { value: "A timeless classic." } });
    fireEvent.blur(box);
    expect(setGameReview).toHaveBeenCalledWith("g1", "A timeless classic.", 8);
  });
});

describe("ReviewTab — read-only (visitors)", () => {
  it("renders their stars, score and text", () => {
    render(
      <ReviewTab
        game={game({ review: "Loved every minute.", reviewScore: 9, reviewedAt: 1719900000000 })}
        readOnly
      />,
    );
    expect(screen.getByText("Their review")).toBeTruthy();
    expect(screen.getByRole("img", { name: "4.5 out of 5 stars" })).toBeTruthy();
    expect(screen.getByText("Loved every minute.")).toBeTruthy();
    // No editing affordances.
    expect(screen.queryByRole("button", { name: /Rate/ })).toBeNull();
    expect(screen.queryByLabelText(/Your review/)).toBeNull();
  });

  it("handles a score-only review", () => {
    render(<ReviewTab game={game({ reviewScore: 6 })} readOnly />);
    expect(screen.getByText("Scored, no write-up.")).toBeTruthy();
  });
});
