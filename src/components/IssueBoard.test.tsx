import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IssueBoard } from "./IssueBoard";

// A mocked store that hands back a single fake issue, so the board has something
// to open when a notification deep-links to it. No network, no real store.
const { store, issue } = vi.hoisted(() => {
  const issue = {
    id: "r1",
    kind: "feature",
    title: "Deep-linked request",
    description: null,
    status: "submitted",
    userId: "someone-else",
    requesterName: "Pat",
    isAdminItem: false,
    createdAt: 0,
    editedAt: null,
    voteCount: 0,
    votedByMe: false,
    commentCount: 0,
    attachmentCount: 0,
    tags: [] as string[],
    priority: "medium",
  };
  const store = {
    isAdmin: false,
    userId: "me",
    fetchIssues: vi.fn(async () => [issue]),
    submitIssue: vi.fn(),
    voteIssue: vi.fn(),
    setRequestStatus: vi.fn(async () => true),
    deleteIssue: vi.fn(),
    editIssue: vi.fn(),
    respondIssue: vi.fn(),
    fetchRequestComments: vi.fn(async () => []),
    fetchRequestAttachments: vi.fn(async () => []),
    uploadAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
    addComment: vi.fn(),
    editComment: vi.fn(),
    deleteComment: vi.fn(),
    toggleReaction: vi.fn(),
    fetchRequestRelations: vi.fn(async () => []),
    addRequestRelation: vi.fn(async () => true),
    removeRequestRelation: vi.fn(async () => true),
    openUserBazaar: vi.fn(),
  };
  return { store, issue };
});

vi.mock("../store", () => ({ useStore: () => store }));

// The comment composer only exists inside the open request detail, so its
// placeholder is a reliable signal that the detail panel is showing.
const detailOpen = () => screen.queryByPlaceholderText("Add a comment…");

describe("IssueBoard notification deep-linking", () => {
  it("opens the linked request's detail on mount", async () => {
    render(<IssueBoard initialRequestId="r1" />);
    expect(await screen.findByPlaceholderText("Add a comment…")).toBeTruthy();
  });

  it("opens the detail when the link changes while already mounted (regression)", async () => {
    // Mirrors tapping a notification from the top bar while already on the
    // Requests page: only the prop changes, the board never remounts.
    const { rerender } = render(<IssueBoard initialRequestId={undefined} />);
    // Wait for the list to load, with no detail open yet.
    await screen.findByText("Deep-linked request");
    expect(detailOpen()).toBeNull();

    rerender(<IssueBoard initialRequestId="r1" />);
    expect(await screen.findByPlaceholderText("Add a comment…")).toBeTruthy();
  });

  it("re-opens the same request after the detail was closed (regression)", async () => {
    // Clicking the notification a second time keeps the same id but bumps
    // focusKey, so the detail must re-open even though initialRequestId is equal.
    const { rerender } = render(<IssueBoard initialRequestId="r1" focusKey={1} />);
    expect(await screen.findByPlaceholderText("Add a comment…")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(detailOpen()).toBeNull();

    rerender(<IssueBoard initialRequestId="r1" focusKey={2} />);
    expect(await screen.findByPlaceholderText("Add a comment…")).toBeTruthy();
  });
});

describe("IssueBoard linked issues", () => {
  const issue2 = { ...issue, id: "r2", title: "Other issue", status: "planned" };
  const origFetch = store.fetchIssues;
  const origRel = store.fetchRequestRelations;
  afterEach(() => {
    store.fetchIssues = origFetch;
    store.fetchRequestRelations = origRel;
  });

  it("lists a linked issue with its relation label and navigates to it", async () => {
    store.fetchIssues = vi.fn(async () => [issue, issue2]);
    store.fetchRequestRelations = vi.fn(async () => [
      { id: "rel1", fromRequest: "r1", toRequest: "r2", kind: "blocks", createdAt: 0 },
    ]);
    render(<IssueBoard initialRequestId="r1" />);
    await screen.findByPlaceholderText("Add a comment…"); // detail is open

    expect(screen.getByText(/Linked issues/)).toBeTruthy();
    expect(screen.getByText("Blocks")).toBeTruthy(); // from-side label for a "blocks" link
    const link = screen.getByRole("button", { name: "Other issue" });

    // Clicking the linked issue switches the detail to it.
    fireEvent.click(link);
    expect(await screen.findByRole("heading", { name: /Other issue/ })).toBeTruthy();
  });
});

describe("IssueBoard admin status control in the detail", () => {
  afterEach(() => {
    store.isAdmin = false;
  });

  it("lets an admin change status from the detail without leaving the view", async () => {
    store.isAdmin = true;
    render(<IssueBoard initialRequestId="r1" />);
    await screen.findByPlaceholderText("Add a comment…");

    const select = screen.getByLabelText("Change status") as HTMLSelectElement;
    expect(select.value).toBe("submitted");
    fireEvent.change(select, { target: { value: "in_progress" } });
    expect(store.setRequestStatus).toHaveBeenCalledWith("r1", "in_progress");
  });

  it("shows a plain status badge (no status select) to non-admins", async () => {
    render(<IssueBoard initialRequestId="r1" />);
    await screen.findByPlaceholderText("Add a comment…");
    expect(screen.queryByLabelText("Change status")).toBeNull();
  });
});
