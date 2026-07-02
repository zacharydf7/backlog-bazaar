// @vitest-environment jsdom
import { render, screen, act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportCelebration } from "./ImportCelebration";
import { useStore } from "../store";

// The animation itself is CSS (untestable under jsdom); these cover the
// component's logic: what renders on the ticket, and the auto-clear timer.
describe("ImportCelebration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    act(() => useStore.setState({ celebration: null }));
  });

  it("renders nothing when no celebration is pending", () => {
    act(() => useStore.setState({ celebration: null }));
    const { container } = render(<ImportCelebration />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the stamped import ticket for the imported game", () => {
    act(() => useStore.setState({ celebration: { id: 1, title: "Chrono Trigger" } }));
    render(<ImportCelebration />);
    expect(screen.getByText("Chrono Trigger")).toBeTruthy();
    expect(screen.getByText(/imported/i)).toBeTruthy();
    expect(screen.getByText(/admitted to the bazaar/i)).toBeTruthy();
    expect(screen.getByText(/import charter · redeemed/i)).toBeTruthy();
  });

  it("clears the celebration after the animation runs its course", () => {
    act(() => useStore.setState({ celebration: { id: 2, title: "Celeste" } }));
    render(<ImportCelebration />);
    expect(useStore.getState().celebration).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(2300);
    });
    expect(useStore.getState().celebration).toBeNull();
  });
});
