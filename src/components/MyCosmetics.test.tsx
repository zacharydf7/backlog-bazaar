import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { MyCosmetics } from "./MyCosmetics";
import { useToasts } from "../lib/toast";
import type { CosmeticsSession } from "../lib/cosmeticsPreview";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  apply: vi.fn(),
  presets: vi.fn(),
}));
vi.mock("../lib/outfitPresets", async (original) => ({
  ...(await original<typeof import("../lib/outfitPresets")>()),
  outfitPresetApi: { list: mocks.presets },
}));
vi.mock("../lib/wardrobe", async (original) => ({
  ...(await original<typeof import("../lib/wardrobe")>()),
  wardrobeApi: mocks,
}));
const empty = { title: null, frame: null, stall: null, coin: null };
const session: CosmeticsSession = {
  items: [
    {
      id: "frame",
      slug: "bronze",
      kind: "frame",
      name: "Retired Bronze",
      description: "A classic frame",
      price: 100,
      style: "bronze-ring",
      badgeId: null,
      tier: "standard",
      secret: false,
      active: false,
      availableFrom: null,
      availableUntil: null,
      setKey: "classics",
      sort: 0,
    },
  ],
  sets: [
    {
      key: "classics",
      name: "Classics",
      description: "Old favorites",
      badgeId: null,
    },
  ],
  badges: [
    {
      id: "earned",
      slug: "earned",
      name: "Earned Star",
      description: "An earned title",
      kind: "granted",
      icon: "award",
      prestige: 3,
      effect: null,
    },
  ],
  ownedIds: ["frame"],
  heldBadgeIds: ["earned"],
  balance: 700,
  look: empty,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.presets.mockResolvedValue([]);
  mocks.load.mockResolvedValue(session);
  mocks.apply.mockImplementation(async (look) => look);
  useStore.setState({
    can: () => false,
    userId: "admin",
    cloud: true,
    displayName: "Reviewer",
    avatarUrl: null,
    bannerUrl: null,
    defaultCoin: "mint",
    bg: null,
    accent: null,
    selectedTitleId: null,
    equippedFrameId: null,
    equippedStallId: null,
    equippedCoinId: null,
  });
});
async function open() {
  const onClose = vi.fn();
  render(<MyCosmetics onClose={onClose} />);
  await screen.findByRole("tablist", { name: "Cosmetic slots" });
  return onClose;
}
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${name}`) }));
const tile = (name: string) => screen.getByRole("button", { name });
describe("dressing room", () => {
  it("lists earned titles and retired pieces under their slots", async () => {
    await open();
    expect(tile("Earned Star")).toBeTruthy();
    tab("Frame");
    expect(tile("Retired Bronze")).toBeTruthy();
    expect(screen.getAllByTestId("community-look-preview").length).toBeGreaterThan(0);
  });
  it("wears a piece in one tap, saves it at once, and offers Undo", async () => {
    useToasts.setState({ toasts: [] });
    await open();
    tab("Frame");
    fireEvent.click(tile("Retired Bronze"));
    expect(mocks.apply).toHaveBeenCalledWith({ ...empty, frame: "frame" }, empty);
    await waitFor(() => expect(tile("Retired Bronze").getAttribute("aria-pressed")).toBe("true"));
    // The real save mirrors the outfit into the store; Undo reads it from there.
    act(() => useStore.setState({ equippedFrameId: "frame" }));
    const toast = useToasts.getState().toasts.at(-1)!;
    expect(toast.message).toBe("Wearing Retired Bronze");
    await act(async () => toast.action!.onAction());
    expect(mocks.apply).toHaveBeenLastCalledWith(empty, { ...empty, frame: "frame" });
  });
  it("undoes against what's worn now, even after the page closed and reopened", async () => {
    useToasts.setState({ toasts: [] });
    const first = render(<MyCosmetics onClose={vi.fn()} />);
    await screen.findByRole("tablist", { name: "Cosmetic slots" });
    tab("Frame");
    fireEvent.click(tile("Retired Bronze"));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    // The real save mirrors the outfit into the store.
    act(() => useStore.setState({ equippedFrameId: "frame" }));
    const undo = useToasts.getState().toasts.at(-1)!.action!;
    first.unmount();
    mocks.load.mockResolvedValue({ ...session, look: { ...empty, frame: "frame" } });
    await open();
    await act(async () => undo.onAction());
    expect(mocks.apply).toHaveBeenLastCalledWith(empty, { ...empty, frame: "frame" });
    expect(useToasts.getState().toasts.at(-1)!.message).toBe("Back to your previous outfit");
  });

  it("takes a slot back to None", async () => {
    mocks.load.mockResolvedValue({ ...session, look: { ...empty, frame: "frame" } });
    await open();
    tab("Frame");
    fireEvent.click(tile("No frame"));
    expect(mocks.apply).toHaveBeenCalledWith(empty, { ...empty, frame: "frame" });
  });
  it("puts the outfit back and explains when a save fails", async () => {
    mocks.apply.mockRejectedValueOnce(new Error("Your outfit changed on another device."));
    await open();
    tab("Frame");
    fireEvent.click(tile("Retired Bronze"));
    expect((await screen.findByRole("alert")).textContent).toContain("changed on another device");
    expect(tile("Retired Bronze").getAttribute("aria-pressed")).toBe("false");
  });
  it("saves one change at a time", async () => {
    let resolve!: (value: unknown) => void;
    mocks.apply.mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    await open();
    tab("Frame");
    fireEvent.click(tile("Retired Bronze"));
    fireEvent.click(tile("No frame"));
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(tile("No frame").hasAttribute("disabled")).toBe(true);
    await act(async () => resolve({ ...empty, frame: "frame" }));
  });
  it("offers to take off a piece you no longer own", async () => {
    mocks.load.mockResolvedValue({ ...session, look: { ...empty, coin: "gone" } });
    await open();
    expect(screen.getByText(/Coin \(Unavailable piece\) is no longer yours/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Take it off" }));
    expect(mocks.apply).toHaveBeenCalledWith(empty, { ...empty, coin: "gone" });
  });
  it("wears a saved look in one tap", async () => {
    mocks.presets.mockResolvedValue([
      { id: "saved", name: "Favorite", version: 1, archived_at: null, look: { ...empty, frame: "frame" } },
    ]);
    await open();
    await screen.findByRole("article", { name: "Favorite" });
    fireEvent.click(screen.getByRole("button", { name: "Wear" }));
    expect(mocks.apply).toHaveBeenCalledWith({ ...empty, frame: "frame" }, empty);
  });
  it("asks before leaving with an unsaved look name", async () => {
    const close = await open();
    await screen.findByText(/Save outfits you like/);
    fireEvent.click(screen.getByRole("button", { name: "Save this outfit" }));
    fireEvent.change(screen.getByLabelText("Look name"), { target: { value: "Unfinished name" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(close).toHaveBeenCalled();
  });
  it("leaves straight away otherwise, since everything is already saved", async () => {
    const close = await open();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(close).toHaveBeenCalled();
  });
  it("blocks loading when signed out and unmounts on sign-out", async () => {
    useStore.setState({ cloud: false });
    const view = render(<MyCosmetics onClose={vi.fn()} />);
    expect(mocks.load).not.toHaveBeenCalled();
    view.unmount();
    useStore.setState({ cloud: true });
    await open();
    act(() => useStore.setState({ cloud: false }));
    expect(screen.queryByRole("region", { name: "My Cosmetics" })).toBeNull();
  });
  it("shows a recoverable load error without substituting simulated items", async () => {
    mocks.load.mockRejectedValueOnce(new Error("Unavailable"));
    render(<MyCosmetics onClose={vi.fn()} />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await screen.findByRole("tablist", { name: "Cosmetic slots" });
  });
});
