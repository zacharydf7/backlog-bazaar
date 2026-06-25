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

  it("lays out one thumbnail per screenshot", () => {
    render(<ScreenshotGallery urls={["https://x/a.jpg", "https://x/b.jpg", "https://x/c.jpg"]} />);
    expect(screen.getByLabelText("View screenshot 1")).toBeTruthy();
    expect(screen.getByLabelText("View screenshot 2")).toBeTruthy();
    expect(screen.getByLabelText("View screenshot 3")).toBeTruthy();
  });

  it("opens the lightbox at the clicked thumbnail and closes it", () => {
    render(<ScreenshotGallery urls={["https://x/a.jpg", "https://x/b.jpg"]} />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByLabelText("View screenshot 2"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("2 / 2")).toBeTruthy(); // opened at the second shot

    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("flips through the lightbox with next, looping around", () => {
    render(<ScreenshotGallery urls={["https://x/a.jpg", "https://x/b.jpg"]} />);
    fireEvent.click(screen.getByLabelText("View screenshot 1"));
    expect(screen.getByText("1 / 2")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Next screenshot"));
    expect(screen.getByText("2 / 2")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Next screenshot")); // loops to the first
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });

  it("shows no lightbox nav for a single screenshot", () => {
    render(<ScreenshotGallery urls={["https://x/only.jpg"]} />);
    fireEvent.click(screen.getByLabelText("View screenshot 1"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByLabelText("Next screenshot")).toBeNull();
  });
});
