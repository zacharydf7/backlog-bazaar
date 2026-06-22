import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

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
});
