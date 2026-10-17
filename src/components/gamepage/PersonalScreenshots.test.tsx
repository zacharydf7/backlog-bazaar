import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { PersonalScreenshots } from "./PersonalScreenshots";
import { useStore } from "../../store";
import type { Game } from "../../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Toy Story 3",
    status: "backlog",
    genres: [],
    addedAt: 1,
    compilationId: "C",
    ...over,
  } as Game;
}

const addPersonalScreenshot = vi.fn(async () => {});
const removePersonalScreenshot = vi.fn(async () => {});

beforeEach(() => {
  addPersonalScreenshot.mockClear();
  removePersonalScreenshot.mockClear();
  act(() => useStore.setState({ cloud: true, addPersonalScreenshot, removePersonalScreenshot }));
});

describe("PersonalScreenshots (86fc0b4b)", () => {
  it("adds a picked image to the game", () => {
    render(<PersonalScreenshots game={game()} />);
    const input = screen.getByText(/Add screenshot/).parentElement!.querySelector("input")!;
    const file = new File(["x"], "shot.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(addPersonalScreenshot).toHaveBeenCalledWith("g1", file);
  });

  it("shows the game's screenshots and removes one in edit mode", () => {
    render(<PersonalScreenshots game={game({ personalScreenshots: ["a.jpg", "b.jpg"] })} />);
    expect(screen.queryByRole("button", { name: /Remove screenshot/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove screenshot 2" }));
    expect(removePersonalScreenshot).toHaveBeenCalledWith("g1", "b.jpg");
  });

  it("stops offering Add at the limit", () => {
    const full = Array.from({ length: 12 }, (_, i) => `s${i}.jpg`);
    render(<PersonalScreenshots game={game({ personalScreenshots: full })} />);
    expect(screen.queryByText(/Add screenshot/)).toBeNull();
  });

  it("renders nothing offline (the files live in storage)", () => {
    act(() => useStore.setState({ cloud: false }));
    const { container } = render(<PersonalScreenshots game={game()} />);
    expect(container.firstChild).toBeNull();
  });
});
