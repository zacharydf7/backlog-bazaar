import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { MyCosmetics } from "./MyCosmetics";
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
  });
});
async function open() {
  const onClose = vi.fn();
  render(<MyCosmetics onClose={onClose} />);
  await screen.findByText("Your saved outfit is loaded.");
  return onClose;
}
const tryFrame = () =>
  fireEvent.click(
    within(screen.getByRole("article", { name: "Retired Bronze" })).getByRole(
      "button",
      { name: "Try on" },
    ),
  );
describe("real wardrobe", () => {
  it("previews a saved look and applies it through the single outfit action", async () => {
    mocks.presets.mockResolvedValue([
      {
        id: "saved",
        name: "Favorite",
        version: 1,
        archived_at: null,
        look: { ...empty, frame: "frame" },
      },
    ]);
    await open();
    await screen.findByRole("article", { name: "Favorite" });
    fireEvent.click(screen.getByRole("button", { name: "Preview look" }));
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(
      screen.getAllByRole("button", { name: "Apply outfit" }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Apply outfit" }));
    await screen.findByText("Your outfit is saved.");
    expect(mocks.apply).toHaveBeenCalledWith(
      { ...empty, frame: "frame" },
      empty,
    );
  });
  it("asks before leaving with an unsaved preset name", async () => {
    const close = await open();
    await screen.findByText("No saved looks yet.");
    fireEvent.click(screen.getByRole("button", { name: "Save this look" }));
    fireEvent.change(screen.getByLabelText("Look name"), {
      target: { value: "Unfinished name" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Done" }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByText("Discard unapplied changes?")).toBeTruthy();
  });
  it("includes retired items and earned titles, and sends one complete outfit only on Apply", async () => {
    await open();
    expect(screen.getByRole("article", { name: "Earned Star" })).toBeTruthy();
    expect(screen.getAllByTestId("community-look-preview")).toHaveLength(1);
    tryFrame();
    expect(mocks.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply outfit" }));
    await screen.findByText("Your outfit is saved.");
    expect(mocks.apply).toHaveBeenCalledWith(
      { ...empty, frame: "frame" },
      empty,
    );
    expect(
      screen
        .getByRole("button", { name: "Apply outfit" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("filters the real inventory by collection and search", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Filter collection"), {
      target: { value: "classics" },
    });
    expect(screen.queryByRole("article", { name: "Earned Star" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Search cosmetics"), {
      target: { value: "no match" },
    });
    expect(screen.getByText("No cosmetics match these filters.")).toBeTruthy();
  });
  it("keeps the tried-on look after a rejected apply and can undo without writing", async () => {
    mocks.apply.mockRejectedValueOnce(
      new Error("Your outfit changed elsewhere."),
    );
    await open();
    tryFrame();
    fireEvent.click(screen.getByRole("button", { name: "Apply outfit" }));
    await screen.findByRole("alert");
    expect(
      within(screen.getByRole("article", { name: "Retired Bronze" })).getByRole(
        "button",
        { name: "Trying on" },
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo try-on" }));
    expect(
      screen
        .getByRole("button", { name: "Apply outfit" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(mocks.apply).toHaveBeenCalledTimes(1);
  });
  it("disables competing actions and duplicate submissions while saving", async () => {
    let resolve!: (value: unknown) => void;
    mocks.apply.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await open();
    tryFrame();
    fireEvent.click(screen.getByRole("button", { name: "Apply outfit" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply outfit" }));
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole("button", { name: "Reload wardrobe" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await act(async () => resolve({ ...empty, frame: "frame" }));
  });
  it("asks before discarding try-on and never saves on exit", async () => {
    const close = await open();
    tryFrame();
    fireEvent.click(
      screen.getByRole("button", { name: "Done" }),
    );
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Leave wardrobe" }));
    expect(close).toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
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
    expect(
      screen.queryByRole("article", { name: "Retired Bronze" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload wardrobe" }));
    await screen.findByRole("article", { name: "Retired Bronze" });
  });
});
