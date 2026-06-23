import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { AdminPage } from "./AdminPage";
import { useStore } from "../store";

afterEach(() => {
  act(() => useStore.setState({ isAdmin: false, submissionCount: 0 }));
});

const noop = { onUsers: () => {}, onEconomy: () => {}, onSubmissions: () => {} };

describe("AdminPage", () => {
  it("gates the page to admins", () => {
    act(() => useStore.setState({ isAdmin: false }));
    render(<AdminPage {...noop} />);
    expect(screen.getByText(/admin-only/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Manage Users/i })).toBeNull();
  });

  it("shows the tool hub and the settings for admins", () => {
    act(() => useStore.setState({ isAdmin: true, submissionCount: 0 }));
    render(<AdminPage {...noop} />);
    expect(screen.getByRole("heading", { name: /Manage Users/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Economy$/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Submissions/i })).toBeTruthy();
    // The relocated settings render too.
    expect(screen.getByRole("heading", { name: /Economy levers/i })).toBeTruthy();
  });

  it("routes the Submissions card to its handler and shows the pending badge", () => {
    const onSubmissions = vi.fn();
    act(() => useStore.setState({ isAdmin: true, submissionCount: 3 }));
    render(<AdminPage {...noop} onSubmissions={onSubmissions} />);
    expect(screen.getByText("3")).toBeTruthy(); // pending badge
    fireEvent.click(screen.getByRole("heading", { name: /Submissions/i }));
    expect(onSubmissions).toHaveBeenCalledTimes(1);
  });
});
