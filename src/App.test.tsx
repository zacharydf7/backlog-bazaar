import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("mounts in local mode and shows the app shell", async () => {
    render(<App />);
    // The header <h1> renders once the store finishes its initial (local) load.
    expect(await screen.findByRole("heading", { name: /Backlog Bazaar/i })).toBeTruthy();
  });

  it("hides cloud-only header controls in local/guest mode", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /Backlog Bazaar/i });
    // Feature requests, leaderboard, and account are cloud-gated.
    expect(screen.queryByTitle(/Feature requests/i)).toBeNull();
    expect(screen.queryByTitle(/Leaderboard/i)).toBeNull();
  });
});
