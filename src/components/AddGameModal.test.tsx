import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddGameModal } from "./AddGameModal";

// Keep the autocomplete deterministic and offline: a typed query resolves to one
// fake suggestion, and the detail/length lookups are no-ops.
vi.mock("../lib/gamedata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/gamedata")>();
  return {
    ...actual,
    usingRawg: false,
    searchGames: vi.fn(async () => [
      { title: "Zelda Tears of the Kingdom", genres: [], rawgId: 1, released: "2023-05-12", hours: 50 },
    ]),
    fetchGameDetails: vi.fn(async () => ({})),
    fetchHltbTimes: vi.fn(async () => null),
  };
});

// The destination chips have exact accessible names ("Bazaar"/"Wishlist"/
// "Finished") — matched precisely so we don't also catch the "Add to Bazaar"
// submit button.
function pressed(name: string): string | null {
  return screen.getByRole("button", { name }).getAttribute("aria-pressed");
}

describe("AddGameModal default destination", () => {
  it("defaults to the Bazaar when no context is given", () => {
    render(<AddGameModal onClose={() => {}} />);
    expect(pressed("Bazaar")).toBe("true");
    expect(pressed("Wishlist")).toBe("false");
  });

  it("honours the context-derived default destination", () => {
    render(<AddGameModal onClose={() => {}} defaultDestination="wishlist" />);
    expect(pressed("Wishlist")).toBe("true");
    expect(pressed("Bazaar")).toBe("false");
  });
});

describe("AddGameModal closing", () => {
  it("does not close when the backdrop is clicked (only the ✕ should)", () => {
    const onClose = vi.fn();
    const { container } = render(<AddGameModal onClose={onClose} />);
    fireEvent.click(container.firstChild as Element); // the backdrop
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the ✕ is clicked", () => {
    const onClose = vi.fn();
    render(<AddGameModal onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("AddGameModal suggestions", () => {
  it("lets you dismiss the suggestions to keep a custom title", async () => {
    render(<AddGameModal onClose={() => {}} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Zelda" } });

    // Suggestion shows up after the debounced search resolves.
    await screen.findByText("Zelda Tears of the Kingdom");

    // Tapping the "add as custom game" escape hatch clears the dropdown without
    // wiping what was typed.
    fireEvent.mouseDown(screen.getByText(/as a custom game/i));
    expect(screen.queryByText("Zelda Tears of the Kingdom")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("Zelda");
  });
});
