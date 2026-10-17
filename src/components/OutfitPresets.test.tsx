import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { OutfitPresets } from "./OutfitPresets";
import type { CosmeticLook, CosmeticsSession } from "../lib/cosmeticsPreview";
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
  useStore.setState({ can: () => false, cloud: true, userId: "user" });
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
/** Open the panel while wearing `wearing` (a different outfit from the
 *  "Evening" preset unless a test says otherwise). */
async function open(wearing: CosmeticLook = { ...empty, frame: "other" }) {
  const onWear = vi.fn();
  render(
    <OutfitPresets
      session={session}
      look={wearing}
      disabled={false}
      onWear={onWear}
    />,
  );
  await screen.findByRole("article", { name: "Evening" });
  return onWear;
}
describe("saved look panel", () => {
  it("saves the outfit you're wearing as a named look without changing it", async () => {
    const wear = await open(empty);
    fireEvent.click(screen.getByRole("button", { name: "Save this outfit" }));
    fireEvent.change(screen.getByLabelText("Look name"), {
      target: { value: "  Weekend  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save named look" }));
    await screen.findByText("Look saved.");
    expect(mocks.save).toHaveBeenCalledWith(
      expect.any(String),
      0,
      "  Weekend  ",
      empty,
    );
    expect(wear).not.toHaveBeenCalled();
  });
  it("wears a saved look in one tap, and marks the one you're wearing", async () => {
    const wear = await open();
    fireEvent.click(screen.getByRole("button", { name: "Wear" }));
    expect(wear).toHaveBeenCalledWith(empty, "Evening");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("disables Wear for the look you already have on", async () => {
    await open(empty);
    expect(screen.getByText("Wearing")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wear" }).hasAttribute("disabled")).toBe(true);
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
    await screen.findByText(/Save outfits you like/);
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
    const wear = await open();
    expect(screen.getByText(/No longer yours: Title/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Wear" }));
    expect(wear).toHaveBeenCalledWith({ ...empty, title: "revoked" }, "Evening");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires a review confirmation before replacing saved pieces", async () => {
    mocks.list.mockResolvedValueOnce([
      { ...preset, look: { ...empty, title: "revoked" } },
    ]);
    await open(empty);
    fireEvent.click(
      screen.getByRole("button", { name: "Update to this outfit" }),
    );
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Replace saved look" }));
    await screen.findByText("Saved look updated.");
    expect(mocks.save).toHaveBeenCalledWith("preset", 1, "Evening", empty);
  });
  it("does not load presets when signed out", () => {
    useStore.setState({ userId: null });
    render(
      <OutfitPresets
        session={session}
        look={empty}
        disabled={false}
        onWear={vi.fn()}
      />,
    );
    expect(mocks.list).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Saved looks" })).toBeNull();
  });
});
