// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Auth } from "./Auth";
import { persistentStorageAvailable } from "../lib/storageHealth";

// The probe result drives the warning banner; the probe itself is covered in
// storageHealth.test.ts.
vi.mock("../lib/storageHealth", () => ({ persistentStorageAvailable: vi.fn(() => true) }));
const probe = vi.mocked(persistentStorageAvailable);

describe("Auth landing page", () => {
  afterEach(cleanup);

  it("pitches the game alongside the form", () => {
    render(<Auth />);
    expect(screen.getByText("Backlog Bazaar")).toBeTruthy();
    expect(screen.getByText(/turned into an economy/i)).toBeTruthy();
    // The loop in three stamps…
    expect(screen.getByText("Buy")).toBeTruthy();
    expect(screen.getByText("Play")).toBeTruthy();
    expect(screen.getByText("Finish")).toBeTruthy();
    // …and the specimen ledger with sample entries.
    expect(screen.getByText(/specimen ledger/i)).toBeTruthy();
    expect(screen.getByText("Hades")).toBeTruthy();
  });

  it("starts on sign-in with Google and email options", () => {
    render(<Auth />);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeTruthy();
    expect(screen.getByText(/forgot password\?/i)).toBeTruthy();
  });

  it("switches to sign-up with a display name and ledger-flavoured CTA", () => {
    render(<Auth />);
    fireEvent.click(screen.getByText(/need an account\? sign up/i));
    expect(screen.getByText(/display name/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /open your ledger/i })).toBeTruthy();
  });

  it("stays quiet about storage when the browser persists it", () => {
    probe.mockReturnValue(true);
    render(<Auth />);
    expect(screen.queryByText(/blocking site storage/i)).toBeNull();
  });

  it("warns that sign-ins won't survive a refresh when storage is blocked (issue cebb6b74)", () => {
    probe.mockReturnValue(false);
    render(<Auth />);
    expect(screen.getByText(/blocking site storage/i)).toBeTruthy();
    expect(screen.getByText(/won.t survive a refresh/i)).toBeTruthy();
  });

  it("offers a reset mode without password or Google, and a way back", () => {
    render(<Auth />);
    fireEvent.click(screen.getByText(/forgot password\?/i));
    expect(screen.getByRole("button", { name: /email me a reset link/i })).toBeTruthy();
    expect(screen.queryByText(/^password$/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
    fireEvent.click(screen.getByText(/back to sign in/i));
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeTruthy();
  });
});
