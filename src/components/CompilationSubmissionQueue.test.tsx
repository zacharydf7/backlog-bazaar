import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompilationSubmissionQueue } from "./CompilationSubmissionQueue";
import { useStore } from "../store";
import type { CompilationTemplateSubmission } from "../lib/compilationTemplates";

const pending: CompilationTemplateSubmission = {
  id: "s1",
  submitter: "u1",
  submitterName: "Zoe",
  kind: "new",
  templateId: null,
  title: "Super Mario 3D All-Stars",
  games: [
    { name: "Super Mario 64", hours: 12 },
    { name: "Super Mario Sunshine", hours: 14 },
  ],
  before: null,
  current: null,
  status: "pending",
  reviewerName: null,
  reviewedAt: null,
  reviewNote: null,
  reward: null,
  createdAt: 1,
};

const approveMock = vi.fn(async (_id: string, _note: string) => true);
const rejectMock = vi.fn(async (_id: string, _note: string) => true);

beforeEach(() => {
  approveMock.mockClear();
  rejectMock.mockClear();
  act(() =>
    useStore.setState({
      isAdmin: true,
      submissionReward: 15,
      fetchCompilationSubmissions: async () => [pending],
      refreshSubmissionCount: async () => {},
      approveCompilationSubmission: approveMock,
      rejectCompilationSubmission: rejectMock,
    }),
  );
});

describe("CompilationSubmissionQueue", () => {
  it("lists a pending submission with its games and approves it", async () => {
    render(<CompilationSubmissionQueue />);
    expect(await screen.findByText("Super Mario 3D All-Stars")).toBeTruthy();
    expect(screen.getByText(/Super Mario 64/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Approve ·/i }));
    });
    expect(approveMock).toHaveBeenCalledWith("s1", "");
  });

  it("rejects a submission with a note", async () => {
    render(<CompilationSubmissionQueue />);
    await screen.findByText("Super Mario 3D All-Stars");
    fireEvent.change(screen.getByPlaceholderText(/note to the submitter/i), {
      target: { value: "Duplicate" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Reject$/i }));
    });
    await waitFor(() => expect(rejectMock).toHaveBeenCalledWith("s1", "Duplicate"));
  });
});
