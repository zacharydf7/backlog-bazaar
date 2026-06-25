import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RoleManagement } from "./RoleManagement";
import { useStore } from "../store";
import type { Role } from "../types";

const ROLES: Role[] = [
  {
    id: "sys-mod",
    key: "moderator",
    name: "Moderator",
    description: "Reviews submissions",
    permissions: ["submissions.games.moderate", "issues.moderate"],
    isSystem: true,
    memberCount: 2,
  },
  {
    id: "custom-1",
    key: "support",
    name: "Support",
    description: null,
    permissions: ["users.view"],
    isSystem: false,
    memberCount: 0,
  },
];

const fetchRoles = vi.fn(async () => ROLES);
const upsertRole = vi.fn(async () => true);
const deleteRole = vi.fn(async () => true);

function setup(isAdmin: boolean) {
  act(() =>
    useStore.setState({ isAdmin, permissions: isAdmin ? [] : ["roles.assign"], fetchRoles, upsertRole, deleteRole }),
  );
}

beforeEach(() => {
  fetchRoles.mockClear();
  upsertRole.mockClear();
  deleteRole.mockClear();
});

afterEach(() => {
  act(() => useStore.setState({ isAdmin: false, permissions: [] }));
});

describe("RoleManagement", () => {
  it("lists roles with their permission chips, member counts and system flag", async () => {
    setup(true);
    render(<RoleManagement />);
    expect(await screen.findByText("Moderator")).toBeTruthy();
    expect(screen.getByText("Support")).toBeTruthy();
    // Permission chips render by their human label.
    expect(screen.getByText(/Moderate game submissions/i)).toBeTruthy();
    expect(screen.getByText(/View users/i)).toBeTruthy();
    // The system preset is flagged.
    expect(screen.getByText(/System/i)).toBeTruthy();
  });

  it("lets a super-admin create a role, sending the chosen permissions", async () => {
    setup(true);
    render(<RoleManagement />);
    await screen.findByText("Moderator");
    fireEvent.click(screen.getByRole("button", { name: /New role/i }));
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Moderator/i), {
      target: { value: "Helper" },
    });
    // Tick a single permission, then create.
    fireEvent.click(screen.getByLabelText(/View users/i));
    fireEvent.click(screen.getByRole("button", { name: /Create role/i }));
    await waitFor(() => expect(upsertRole).toHaveBeenCalled());
    const payload = upsertRole.mock.calls[0][0] as {
      id: string | null;
      name: string;
      permissions: string[];
    };
    expect(payload.id).toBeNull();
    expect(payload.name).toBe("Helper");
    expect(payload.permissions).toEqual(["users.view"]);
  });

  it("can delete a custom role but not a system role", async () => {
    setup(true);
    render(<RoleManagement />);
    await screen.findByText("Support");
    // System role: no delete affordance (only the custom role gets one).
    const deleteButtons = screen.getAllByTitle(/Delete role/i);
    expect(deleteButtons).toHaveLength(1); // only "Support"
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    await waitFor(() => expect(deleteRole).toHaveBeenCalledWith("custom-1"));
  });

  it("is read-only for a non-super-admin delegate (no create/edit/delete)", async () => {
    setup(false);
    render(<RoleManagement />);
    await screen.findByText("Moderator");
    expect(screen.queryByRole("button", { name: /New role/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit/i })).toBeNull();
    expect(screen.queryByTitle(/Delete role/i)).toBeNull();
  });
});
