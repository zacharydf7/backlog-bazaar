import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { AdminPage } from "./AdminPage";
import { useStore } from "../store";

afterEach(() => {
  act(() => useStore.setState({ isAdmin: false, permissions: [], submissionCount: 0 }));
});

describe("AdminPage", () => {
  it("gates the page to admins", () => {
    act(() => useStore.setState({ isAdmin: false }));
    render(<AdminPage view="admin" onNavigate={() => {}} />);
    expect(screen.getByText(/don't have access/i)).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("renders the tab bar (incl. Roles) and the Settings panel on the admin view", () => {
    act(() => useStore.setState({ isAdmin: true, submissionCount: 0 }));
    render(<AdminPage view="admin" onNavigate={() => {}} />);
    expect(screen.getByRole("tab", { name: /Users/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Slots/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Economy/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Submissions/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Catalog/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Stats/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Roles/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Settings/i })).toBeTruthy();
    // Settings tab is active → the Site + Appearance cards render inline. (The
    // economy levers now live on the Economy tab.)
    expect(screen.getByRole("heading", { name: /^Site$/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Appearance/i })).toBeTruthy();
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

  it("shows only the permitted tab for a granular delegate", () => {
    // A stats.view delegate (not a super-admin) sees only the Stats tab.
    act(() => useStore.setState({ isAdmin: false, permissions: ["stats.view"] }));
    render(<AdminPage view="admin" onNavigate={() => {}} />);
    expect(screen.getByRole("tab", { name: /Stats/i })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Users/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Roles/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Settings/i })).toBeNull();
  });

  it("falls back to the first permitted tab when the requested view is off-limits", () => {
    // Requests the Users view but only holds economy.edit → lands on Economy.
    act(() => useStore.setState({ isAdmin: false, permissions: ["economy.edit"] }));
    render(<AdminPage view="users" onNavigate={() => {}} />);
    expect(screen.getByRole("tab", { name: /Economy/i }).getAttribute("aria-selected")).toBe("true");
  });
});
