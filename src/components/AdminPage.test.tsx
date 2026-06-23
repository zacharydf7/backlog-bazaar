import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { AdminPage } from "./AdminPage";
import { useStore } from "../store";

afterEach(() => {
  act(() => useStore.setState({ isAdmin: false, submissionCount: 0 }));
});

describe("AdminPage", () => {
  it("gates the page to admins", () => {
    act(() => useStore.setState({ isAdmin: false }));
    render(<AdminPage view="admin" onNavigate={() => {}} />);
    expect(screen.getByText(/admin-only/i)).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("renders the tab bar and the Settings panel on the admin view", () => {
    act(() => useStore.setState({ isAdmin: true, submissionCount: 0 }));
    render(<AdminPage view="admin" onNavigate={() => {}} />);
    expect(screen.getByRole("tab", { name: /Users/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Economy/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Submissions/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Settings/i })).toBeTruthy();
    // Settings tab is active → its relocated levers render inline.
    expect(screen.getByRole("heading", { name: /Economy levers/i })).toBeTruthy();
  });

  it("marks the current view's tab selected", () => {
    act(() => useStore.setState({ isAdmin: true }));
    render(<AdminPage view="admin" onNavigate={() => {}} />);
    expect(screen.getByRole("tab", { name: /Settings/i }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("tab", { name: /Users/i }).getAttribute("aria-selected")).toBe("false");
  });

  it("navigates when a tab is clicked", () => {
    const onNavigate = vi.fn();
    act(() => useStore.setState({ isAdmin: true }));
    render(<AdminPage view="admin" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("tab", { name: /Users/i }));
    expect(onNavigate).toHaveBeenCalledWith("users");
  });

  it("shows the pending-submissions badge on the Submissions tab", () => {
    act(() => useStore.setState({ isAdmin: true, submissionCount: 3 }));
    render(<AdminPage view="admin" onNavigate={() => {}} />);
    expect(screen.getByText("3")).toBeTruthy();
  });
});
