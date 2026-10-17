import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ReleaseNotes } from "./ReleaseNotes";
import { EXPANDED_RELEASES, RELEASES } from "../lib/changelog";

describe("ReleaseNotes", () => {
  it("opens the newest releases, marking the latest", () => {
    render(<ReleaseNotes onNavigate={() => {}} />);
    const latest = screen.getByRole("heading", { name: RELEASES[0].title });
    expect(within(latest.parentElement!).getByText("Latest")).toBeTruthy();
    for (const r of RELEASES.slice(0, EXPANDED_RELEASES)) {
      expect(screen.getByText(r.summary)).toBeTruthy();
    }
  });

  it("folds older releases into months, each with its count", () => {
    const { container } = render(<ReleaseNotes onNavigate={() => {}} />);
    const months = container.querySelectorAll("details");
    expect(months.length).toBeGreaterThan(0);
    expect(months[0].querySelector("summary")!.textContent).toMatch(/\d+ updates?/);
    // Every release appears exactly once on the page.
    for (const r of RELEASES) expect(screen.getAllByText(r.summary)).toHaveLength(1);
  });

  it("takes a Try it link to its page", () => {
    const onNavigate = vi.fn();
    render(<ReleaseNotes onNavigate={onNavigate} />);
    const withLink = RELEASES.slice(0, EXPANDED_RELEASES).find((r) => r.link)!;
    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(withLink.link!.label) })[0]);
    expect(onNavigate).toHaveBeenCalledWith(withLink.link!.view);
  });
});
