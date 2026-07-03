import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

afterEach(() => {
  window.history.replaceState(null, "", "/"); // drop any hash a spec navigated to
});

describe("App", () => {
  it("mounts in local mode and shows the app shell", async () => {
    render(<App />);
    // The wordmark renders once the store finishes its initial (local) load. It
    // appears in both the desktop sidebar and the mobile top bar, so allow many.
    const headings = await screen.findAllByRole("heading", { name: /Backlog Bazaar/i });
    expect(headings.length).toBeGreaterThan(0);
  });

  it("hides cloud-only nav controls in local/guest mode", async () => {
    render(<App />);
    await screen.findAllByRole("heading", { name: /Backlog Bazaar/i });
    // Leaderboard, requests, and account are cloud-gated; only "What's new" shows.
    expect(screen.queryByRole("button", { name: /Leaderboard/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Requests & bugs/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sign out/i })).toBeNull();
  });

  it("restores a game deep link (#g/<id>) to the game page, with Back to the board", async () => {
    // An unknown id still lands on the page — its graceful not-found panel —
    // proving the route survives a cold load instead of bouncing to home.
    window.history.replaceState(null, "", "/#g/nope");
    render(<App />);
    expect(await screen.findByText(/isn’t in the library/i)).toBeTruthy();

    // A cold deep link has no in-app history behind it: the page's Back button
    // goes to the home board rather than leaving the site.
    fireEvent.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(await screen.findByText(/Your Bazaar is empty/i)).toBeTruthy();
    expect(window.location.hash === "" || window.location.hash === "#").toBe(true);
  });
});
