import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddGameModal } from "./AddGameModal";

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
