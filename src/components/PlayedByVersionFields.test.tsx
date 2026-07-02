// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayedByVersionFields, resolvedRowHours } from "./PlayedByVersionFields";
import type { PlaytimeRow } from "../lib/platformPlaytime";

function row(over: Partial<PlaytimeRow> & { key: string }): PlaytimeRow {
  return {
    platform: null,
    format: null,
    label: "Played",
    hours: 0,
    absorbs: [],
    ...over,
  };
}

describe("resolvedRowHours", () => {
  it("treats blank as zero, junk as unchanged, and parses everything else", () => {
    const r = row({ key: "a", hours: 4 });
    expect(resolvedRowHours(r, "")).toBe(0);
    expect(resolvedRowHours(r, "junk")).toBe(4);
    expect(resolvedRowHours(r, "1h 30m")).toBe(1.5);
  });
});

describe("PlayedByVersionFields", () => {
  afterEach(cleanup);

  it("collapses a single bucket to a plain Played field", () => {
    const onChange = vi.fn();
    render(
      <PlayedByVersionFields
        rows={[row({ key: "only" })]}
        drafts={{}}
        onChange={onChange}
        trackEditions={false}
      />,
    );
    fireEvent.change(screen.getByLabelText(/played/i), { target: { value: "2h" } });
    expect(onChange).toHaveBeenCalledWith("only", "2h");
    expect(screen.queryByText(/played by platform/i)).toBeNull();
  });

  it("renders one labelled input per version with a live total", () => {
    render(
      <PlayedByVersionFields
        rows={[
          row({ key: "pc", platform: "PC", label: "PC" }),
          row({ key: "switch", platform: "Nintendo Switch", label: "Nintendo Switch" }),
        ]}
        drafts={{ pc: "2h", switch: "1h 30m" }}
        onChange={() => {}}
        trackEditions={false}
      />,
    );
    expect(screen.getByText(/played by platform/i)).toBeTruthy();
    expect(screen.getByLabelText("Hours played on PC")).toBeTruthy();
    expect(screen.getByLabelText("Hours played on Nintendo Switch")).toBeTruthy();
    expect(screen.getByText("3h 30m")).toBeTruthy(); // the Total
  });

  it("says 'by version' when edition tracking is on", () => {
    render(
      <PlayedByVersionFields
        rows={[
          row({ key: "a", platform: "PC", label: "PC" }),
          row({ key: "b", platform: "PC", label: "PC (Physical)", format: "physical" }),
        ]}
        drafts={{}}
        onChange={() => {}}
        trackEditions
      />,
    );
    expect(screen.getByText(/played by version/i)).toBeTruthy();
  });
});
