import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders the status label", () => {
    render(<StatusBadge status="playing" />);
    expect(screen.getByText(/Now Playing/i)).toBeTruthy();
  });

  it("never wraps its label onto a second line (profile-tile regression)", () => {
    // On narrow profile game tiles "Now Playing" used to break into
    // "NOW / PLAYING"; the badge must stay a single-line slug and let the
    // neighbouring platform text truncate instead.
    render(<StatusBadge status="playing" />);
    const badge = screen.getByText(/Now Playing/i).closest("span");
    expect(badge?.className).toMatch(/whitespace-nowrap/);
  });

  it("appends caller-supplied classes", () => {
    render(<StatusBadge status="finished" className="ml-2" />);
    const badge = screen.getByText(/Finished/i).closest("span");
    expect(badge?.className).toMatch(/ml-2/);
  });

  it("stamps In Rotation for a playing live-service game (issue b4c6ac9d)", () => {
    render(<StatusBadge status="playing" rotation />);
    expect(screen.getByText("In Rotation")).toBeTruthy();
    expect(screen.queryByText("Now Playing")).toBeNull();
  });

  it("ignores the rotation flag off the playing status", () => {
    render(<StatusBadge status="backlog" rotation />);
    expect(screen.getByText("Bazaar")).toBeTruthy();
    expect(screen.queryByText("In Rotation")).toBeNull();
  });
});
