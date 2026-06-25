import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SubmissionCard } from "./SubmissionQueue";
import { useStore } from "../store";
import type { GameSubmission } from "../types";

const base: GameSubmission = {
  id: "s1",
  submitter: "u1",
  submitterName: "Alice",
  kind: "edit",
  catalogId: "c1",
  rawgId: null,
  proposed: {
    title: "Hollow Knight",
    image: "https://x/new.jpg",
    platforms: ["PC", "Switch"],
    genres: ["Metroidvania"],
    developers: ["Team Cherry"],
    released: "2017-02-24",
    hours: 27,
  },
  before: {
    title: "Hollow Knight",
    image: "https://x/old.jpg",
    platforms: ["PC"],
    genres: ["Metroidvania"],
    developers: ["Team Cherry"],
    released: "2017-02-24",
    hours: 27,
  },
  current: null,
  status: "approved",
  reviewer: "admin1",
  reviewerName: "Mod Bob",
  reviewedAt: 2,
  reviewNote: null,
  reward: 15,
  approvedFields: ["image", "platforms"],
  createdAt: 1,
  deletedAt: null,
  revertedAt: null,
  revertedByName: null,
  revertedFields: null,
};

const revertMock = vi.fn(async (_id: string) => true);
const deleteMock = vi.fn(async (_id: string) => true);
const onResolved = vi.fn(async () => {});

beforeEach(() => {
  revertMock.mockClear();
  deleteMock.mockClear();
  onResolved.mockClear();
  act(() =>
    useStore.setState({
      isAdmin: true,
      submissionReward: 15,
      approveSubmission: vi.fn(async () => true),
      rejectSubmission: vi.fn(async () => true),
      deleteSubmission: deleteMock,
      revertSubmission: revertMock,
    }),
  );
});

describe("SubmissionCard — Undo edit", () => {
  it("offers Undo edit on an approved edit and reverts after confirming", async () => {
    render(<SubmissionCard submission={base} onResolved={onResolved} />);
    fireEvent.click(screen.getByRole("button", { name: /Undo edit/i }));
    await act(async () => {
      // The confirm step's Undo edit button.
      fireEvent.click(screen.getAllByRole("button", { name: /Undo edit/i })[0]);
    });
    await waitFor(() => expect(revertMock).toHaveBeenCalledWith("s1"));
  });

  it("does not offer Undo edit on a NEW-game approval", () => {
    render(<SubmissionCard submission={{ ...base, kind: "new" }} onResolved={onResolved} />);
    expect(screen.queryByRole("button", { name: /Undo edit/i })).toBeNull();
  });

  it("does not offer Undo edit while still pending", () => {
    render(
      <SubmissionCard
        submission={{ ...base, status: "pending", reviewerName: null, reviewedAt: null, reward: null, approvedFields: null }}
        onResolved={onResolved}
      />,
    );
    expect(screen.queryByRole("button", { name: /Undo edit/i })).toBeNull();
  });

  it("shows a Reverted chip and no Undo control once reverted", () => {
    render(
      <SubmissionCard
        submission={{ ...base, revertedAt: 3, revertedByName: "Mod Bob", revertedFields: ["image"] }}
        onResolved={onResolved}
      />,
    );
    expect(screen.getByText(/^Reverted$/)).toBeTruthy();
    expect(screen.getByText(/Reverted by Mod Bob/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Undo edit/i })).toBeNull();
  });
});
