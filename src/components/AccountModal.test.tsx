import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountModal } from "./AccountModal";
import { useStore } from "../store";
import { STARTING_COINS } from "../lib/pricing";

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    cloud: false,
    displayName: "You",
    providers: [],
    myPlatforms: [],
    customPlatforms: [],
    privacy: {},
    myBadges: [],
    games: [],
    error: null,
  });
});

describe("AccountModal Danger Zone", () => {
  it("shows Fresh Start in guest mode but hides Delete account (cloud only)", () => {
    render(<AccountModal />);
    expect(screen.getByRole("button", { name: "Fresh Start…" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete account…" })).toBeNull();
  });

  it("shows both actions for signed-in users", () => {
    useStore.setState({ cloud: true });
    render(<AccountModal />);
    expect(screen.getByRole("button", { name: "Fresh Start…" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete account…" })).toBeTruthy();
  });

  it("runs a guest Fresh Start only after the full typed confirmation", async () => {
    useStore.setState({ coins: 7, charters: 4 });
    render(<AccountModal />);

    fireEvent.click(screen.getByRole("button", { name: "Fresh Start…" }));
    const confirm = screen.getByRole("button", {
      name: "Wipe my data and start over",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /cannot be undone/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /to confirm/i }), {
      target: { value: "fresh start" },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(useStore.getState().coins).toBe(STARTING_COINS));
    expect(useStore.getState().charters).toBe(0);
    // The modal closes once the reset succeeds.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Wipe my data and start over" })).toBeNull(),
    );
  });
});
