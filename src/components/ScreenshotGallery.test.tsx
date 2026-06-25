import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScreenshotGallery, wrapIndex } from "./ScreenshotGallery";

describe("wrapIndex", () => {
  it("wraps around both ends and handles empty", () => {
    expect(wrapIndex(0, 3)).toBe(0);
    expect(wrapIndex(3, 3)).toBe(0); // past the end loops to start
    expect(wrapIndex(-1, 3)).toBe(2); // before the start loops to end
    expect(wrapIndex(5, 3)).toBe(2);
    expect(wrapIndex(0, 0)).toBe(0); // empty list
  });
});

describe("ScreenshotGallery", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<ScreenshotGallery urls={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("flips through screenshots with the next control, looping around", () => {
    render(<ScreenshotGallery urls={["https://x/a.jpg", "https://x/b.jpg"]} />);
    expect(screen.getByText("1 / 2")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Next screenshot"));
    expect(screen.getByText("2 / 2")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Next screenshot")); // loops back to the first
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });

  it("hides nav controls for a single screenshot", () => {
    render(<ScreenshotGallery urls={["https://x/only.jpg"]} />);
    expect(screen.queryByLabelText("Next screenshot")).toBeNull();
  });
});
