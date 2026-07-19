import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { JumpToTopButton, jumpToTopThreshold } from "./JumpToTopButton";

function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, writable: true, configurable: true });
}

beforeEach(() => {
  setScrollY(0);
});

describe("jumpToTopThreshold", () => {
  it("is a screenful, with a sane fallback when the viewport reports 0 (jsdom)", () => {
    expect(jumpToTopThreshold(900)).toBe(900);
    expect(jumpToTopThreshold(0)).toBe(600);
  });
});

describe("JumpToTopButton", () => {
  it("stays hidden near the top of the page", () => {
    render(<JumpToTopButton />);
    const btn = screen.getByLabelText("Jump to top");
    expect(btn.className).toContain("opacity-0");

    setScrollY(200);
    fireEvent.scroll(window);
    expect(btn.className).toContain("opacity-0");
  });

  it("appears once scrolled a screenful deep and hides again back at the top", () => {
    render(<JumpToTopButton />);
    const btn = screen.getByLabelText("Jump to top");

    setScrollY(2000);
    fireEvent.scroll(window);
    expect(btn.className).toContain("opacity-100");

    setScrollY(0);
    fireEvent.scroll(window);
    expect(btn.className).toContain("opacity-0");
  });

  it("scrolls the window back to the top on tap", () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    render(<JumpToTopButton />);

    setScrollY(2000);
    fireEvent.scroll(window);
    fireEvent.click(screen.getByLabelText("Jump to top"));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});
