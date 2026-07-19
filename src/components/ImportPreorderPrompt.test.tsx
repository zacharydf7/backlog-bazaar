import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ImportPreorderPrompt } from "./ImportPreorderPrompt";
import { useStore } from "../store";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "w1",
    title: "Silksong",
    status: "wishlist",
    released: "2099-06-01",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

beforeEach(() => {
  act(() =>
    useStore.setState({ preorderImportPromptId: null, games: [], viewing: null }),
  );
});

describe("ImportPreorderPrompt", () => {
  it("renders nothing while no import is intercepted", () => {
    const { container } = render(<ImportPreorderPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it("asks about the intercepted game with the catalog date prefilled", () => {
    act(() =>
      useStore.setState({ games: [game()], preorderImportPromptId: "w1" }),
    );
    render(<ImportPreorderPrompt />);
    expect(screen.getByText("Did you pre-order it?")).toBeTruthy();
    expect(screen.getByText("Silksong")).toBeTruthy();
    expect(screen.getByLabelText(/Expected release/)).toHaveProperty("value", "2099-06-01");
  });

  it("confirming imports as a pre-order with the (edited) date and what-you-paid on a copy", () => {
    const importWithCharter = vi.fn().mockResolvedValue(undefined);
    act(() =>
      useStore.setState({
        games: [game()],
        preorderImportPromptId: "w1",
        importWithCharter,
      }),
    );
    render(<ImportPreorderPrompt />);
    fireEvent.change(screen.getByLabelText(/Expected release/), {
      target: { value: "2099-07-04" },
    });
    fireEvent.change(screen.getByLabelText(/What you paid/), { target: { value: "59.99" } });
    fireEvent.click(screen.getByRole("button", { name: /Yes — import as a pre-order/ }));
    expect(importWithCharter).toHaveBeenCalledWith("w1", {
      preorder: {
        expectedOn: "2099-07-04",
        copies: [expect.objectContaining({ platform: "", cost: 59.99 })],
      },
    });
  });

  it("declining runs the plain import", () => {
    const importWithCharter = vi.fn().mockResolvedValue(undefined);
    act(() =>
      useStore.setState({
        games: [game()],
        preorderImportPromptId: "w1",
        importWithCharter,
      }),
    );
    render(<ImportPreorderPrompt />);
    fireEvent.click(screen.getByRole("button", { name: /No — just import it/ }));
    expect(importWithCharter).toHaveBeenCalledWith("w1", { preorder: "skip" });
  });

  it("closing dismisses without importing", () => {
    const importWithCharter = vi.fn();
    act(() =>
      useStore.setState({
        games: [game()],
        preorderImportPromptId: "w1",
        importWithCharter,
      }),
    );
    render(<ImportPreorderPrompt />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(importWithCharter).not.toHaveBeenCalled();
    expect(useStore.getState().preorderImportPromptId).toBeNull();
  });
});
