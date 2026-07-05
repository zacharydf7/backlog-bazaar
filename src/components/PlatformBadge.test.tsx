import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlatformBadge } from "./PlatformBadge";

describe("PlatformBadge format glyphs (issue 84f5f046)", () => {
  it("shows a glyph for each owned format, all three when present", () => {
    render(<PlatformBadge label="Nintendo Switch" formats={["physical", "digital", "dlc"]} />);
    expect(screen.getByLabelText("Physical")).toBeTruthy();
    expect(screen.getByLabelText("Digital")).toBeTruthy();
    expect(screen.getByLabelText("DLC")).toBeTruthy();
  });

  it("shows only the formats owned (a digital-only platform gets one glyph)", () => {
    render(<PlatformBadge label="PC" formats={["digital"]} />);
    expect(screen.getByLabelText("Digital")).toBeTruthy();
    expect(screen.queryByLabelText("Physical")).toBeNull();
    expect(screen.queryByLabelText("DLC")).toBeNull();
  });

  it("renders no glyphs when formats is omitted (plain platform chip)", () => {
    render(<PlatformBadge label="PC" />);
    expect(screen.getByText("PC")).toBeTruthy();
    expect(screen.queryByLabelText("Digital")).toBeNull();
  });

  it("becomes a button that stops propagation when onClick is given", () => {
    const onClick = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <PlatformBadge label="PC" formats={["physical"]} onClick={onClick} title="Open PC" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
    expect(parentClick).not.toHaveBeenCalled();
  });
});
