import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { CollectionDraftManager } from "./CollectionDraftManager";
import type { CollectionDraft } from "../lib/collectionDrafts";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  start: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  collections: vi.fn(),
}));
vi.mock("../lib/collectionDraftApi", () => ({ collectionDraftApi: mocks }));
const draft: CollectionDraft = {
  draft_id: "draft",
  revision: 2,
  source_key: "b",
  state: "draft",
  created_at: "2026-09-08T12:00:00Z",
  base_catalog: {
    sets: [
      { key: "a", name: "Alpha", badge_id: null },
      { key: "b", name: "Beta", badge_id: null },
    ],
    badges: [],
    items: [
      {
        id: "one",
        slug: "one",
        name: "Active One",
        kind: "frame",
        style: "bronze-ring",
        active: true,
        set_key: "a",
        price: 100,
      },
      {
        id: "two",
        slug: "two",
        name: "Retired Two",
        kind: "frame",
        style: "bronze-ring",
        active: false,
        set_key: "b",
        price: 100,
      },
    ],
  },
  payload: {
    set: { key: "b", name: "Beta Revised", description: null, badge_id: null },
    member_ids: ["one"],
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ userId: "admin", can: () => true });
  mocks.list.mockResolvedValue([draft]);
  mocks.save.mockImplementation(async (_draft, payload) => ({
    ...draft,
    revision: 3,
    payload,
  }));
  mocks.publish.mockResolvedValue({
    ...draft,
    revision: 3,
    state: "published",
  });
  mocks.collections.mockResolvedValue(draft.base_catalog.sets);
});
async function open() {
  render(<CollectionDraftManager onClose={vi.fn()} />);
  await screen.findByText(/Revision 2/);
}
describe("saved collection manager", () => {
  it("reopens saved membership instead of substituting live membership", async () => {
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit collection draft" }),
    );
    expect(screen.getByRole("checkbox", { name: /Active One/ })).toHaveProperty(
      "checked",
      true,
    );
    expect(
      screen.getByRole("checkbox", { name: /Retired Two/ }),
    ).toHaveProperty("checked", false);
    fireEvent.change(screen.getByLabelText("Collection name"), {
      target: { value: "New name" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save collection revision" }),
    );
    await screen.findByText(
      "Collection revision 3 saved. Nothing has been published.",
    );
    expect(mocks.save.mock.calls[0][1].member_ids).toEqual(["one"]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("requires acknowledgment and confirmation before publishing the reviewed revision", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Review collection" }));
    expect(screen.getByText("Alpha: 1 → 0")).toBeTruthy();
    expect(screen.getByText("Beta Revised: 1 → 1")).toBeTruthy();
    expect(screen.getByText("Pieces required, including off-sale items")).toBeTruthy();
    expect(screen.queryByText(/not part of the active requirement/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Publish collection revision" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Publish collection revision" }),
    );
    expect(mocks.publish).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish collection now" }),
    );
    await screen.findByText(
      "Collection published. Existing purchases and reward grants are unchanged.",
    );
    expect(mocks.publish).toHaveBeenCalledWith(draft, true);
  });
  it("keeps unsaved edits after a save conflict", async () => {
    mocks.save.mockRejectedValueOnce(new Error("A newer revision exists."));
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit collection draft" }),
    );
    fireEvent.change(screen.getByLabelText("Collection story"), {
      target: { value: "My unsaved story" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save collection revision" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Collection story")).toHaveProperty(
      "value",
      "My unsaved story",
    );
  });
  it("does not expose publication without its specific permission", async () => {
    useStore.setState({
      can: (key) => key === "shop.manage" || key === "shop.collections.drafts",
    });
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Review collection" }));
    expect(
      screen.queryByRole("button", { name: "Publish collection revision" }),
    ).toBeNull();
  });
  it("gates loading and unmounts on permission removal", async () => {
    useStore.setState({ can: () => false });
    const view = render(<CollectionDraftManager onClose={vi.fn()} />);
    expect(mocks.list).not.toHaveBeenCalled();
    view.unmount();
    useStore.setState({ can: () => true });
    await open();
    act(() => useStore.setState({ can: () => false }));
    expect(
      screen.queryByRole("region", { name: "Saved collection drafts" }),
    ).toBeNull();
  });
});
