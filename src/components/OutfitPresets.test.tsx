import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { OutfitPresets } from "./OutfitPresets";
import type { CosmeticsSession } from "../lib/cosmeticsPreview";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  archive: vi.fn(),
}));
vi.mock("../lib/outfitPresets", async (original) => ({
  ...(await original<typeof import("../lib/outfitPresets")>()),
  outfitPresetApi: mocks,
}));
const empty = { title: null, frame: null, stall: null, coin: null };
const preset = {
  id: "preset",
  name: "Evening",
  version: 1,
  look: empty,
  archived_at: null,
};
const session: CosmeticsSession = {
  items: [],
  sets: [],
  badges: [],
  ownedIds: [],
  heldBadgeIds: [],
  balance: 0,
  look: empty,
};
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ can: () => true, userId: "admin" });
  mocks.list.mockResolvedValue([preset]);
  mocks.save.mockImplementation(async (id, version, name, look) => ({
    id,
    version: version + 1,
    name,
    look,
    archived_at: null,
  }));
  mocks.archive.mockImplementation(async (row, archived) => ({
    ...row,
    version: row.version + 1,
    archived_at: archived ? "2026-09-08T00:00:00Z" : null,
  }));
});
async function open() {
  const onPreview = vi.fn();
  render(
    <OutfitPresets
      session={session}
      look={empty}
      disabled={false}
      onPreview={onPreview}
    />,
  );
  await screen.findByRole("article", { name: "Evening" });
  return onPreview;
}
describe("saved look panel", () => {
  it("saves a named snapshot without equipping or previewing it", async () => {
    const preview = await open();
    fireEvent.click(screen.getByRole("button", { name: "Save this look" }));
    fireEvent.change(screen.getByLabelText("Look name"), {
      target: { value: "  Weekend  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save named look" }));
    await screen.findByText("Saved look updated. Your equipment is unchanged.");
    expect(mocks.save).toHaveBeenCalledWith(
      expect.any(String),
      0,
      "  Weekend  ",
      empty,
    );
    expect(preview).not.toHaveBeenCalled();
  });
  it("loads a preset only into the existing try-on", async () => {
    const preview = await open();
    fireEvent.click(screen.getByRole("button", { name: "Preview look" }));
    expect(preview).toHaveBeenCalledWith(empty);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("retains rename edits after a version conflict", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Changed elsewhere"));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Look name"), {
      target: { value: "Keep my edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save named look" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Look name")).toHaveProperty(
      "value",
      "Keep my edit",
    );
  });
  it("archives and restores without deleting the look", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await screen.findByText("No saved looks yet.");
    fireEvent.click(
      screen.getByRole("button", { name: "Show archived looks" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await screen.findByText("Saved look restored.");
    expect(mocks.archive.mock.calls[1][0].version).toBe(2);
    expect(mocks.archive.mock.calls[1][1]).toBe(false);
  });
  it("keeps missing pieces and flags them instead of silently changing the preset", async () => {
    mocks.list.mockResolvedValueOnce([
      { ...preset, look: { ...empty, title: "revoked" } },
    ]);
    const preview = await open();
    expect(screen.getByText(/Needs attention: Title/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Preview look" }));
    expect(preview).toHaveBeenCalledWith({ ...empty, title: "revoked" });
  });
  it("requires a review confirmation before replacing saved pieces", async () => {
    mocks.list.mockResolvedValueOnce([
      { ...preset, look: { ...empty, title: "revoked" } },
    ]);
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Replace with try-on" }),
    );
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Replace saved look" }));
    await screen.findByText(
      "Saved look replaced. Your equipment is unchanged.",
    );
    expect(mocks.save).toHaveBeenCalledWith("preset", 1, "Evening", empty);
  });
  it("does not load presets without the assignable permission", () => {
    useStore.setState({ can: (key) => key !== "shop.presets" });
    render(
      <OutfitPresets
        session={session}
        look={empty}
        disabled={false}
        onPreview={vi.fn()}
      />,
    );
    expect(mocks.list).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Saved looks" })).toBeNull();
  });
});
