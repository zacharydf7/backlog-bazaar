import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompilationSubmissionCard } from "./CompilationSubmissionQueue";
import { useStore } from "../store";
import type { CompilationTemplateSubmission } from "../lib/compilationTemplates";

const base: CompilationTemplateSubmission = {
  id: "s1",
  submitter: "u1",
  submitterName: "Zoe",
  kind: "new",
  templateId: null,
  title: "Super Mario 3D All-Stars",
  platform: "Nintendo Switch",
  format: "physical",
  games: [
    { name: "Super Mario 64", hours: 12, image: "a.png" },
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
const deleteMock = vi.fn(async (_id: string) => true);
const onResolved = vi.fn(async () => {});

beforeEach(() => {
  approveMock.mockClear();
  rejectMock.mockClear();
  deleteMock.mockClear();
  onResolved.mockClear();
  act(() =>
    useStore.setState({
      isAdmin: true,
      submissionReward: 15,
      approveCompilationSubmission: approveMock,
      rejectCompilationSubmission: rejectMock,
      deleteCompilationTemplate: deleteMock,
    }),
  );
});

describe("CompilationSubmissionCard", () => {
  it("shows the platform/format label and approves", async () => {
    render(<CompilationSubmissionCard submission={base} onResolved={onResolved} />);
    expect(screen.getByText(/Nintendo Switch · physical/i)).toBeTruthy();
    expect(screen.getByText("Super Mario 3D All-Stars")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Approve ·/i }));
    });
    expect(approveMock).toHaveBeenCalledWith("s1", "");
  });

  it("offers to delete the shared template once approved", async () => {
    const approved: CompilationTemplateSubmission = {
      ...base,
      status: "approved",
      templateId: "tmpl-1",
      reviewerName: "Admin",
      reviewedAt: 2,
      reward: 15,
    };
    render(<CompilationSubmissionCard submission={approved} onResolved={onResolved} />);
    fireEvent.click(screen.getByRole("button", { name: /Delete shared template/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    });
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("tmpl-1"));
  });
});
