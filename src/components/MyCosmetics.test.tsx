import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { MyCosmetics } from "./MyCosmetics";
import type { CosmeticsSession } from "../lib/cosmeticsPreview";
const mocks = vi.hoisted(() => ({ load: vi.fn(), apply: vi.fn() }));
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
  mocks.load.mockResolvedValue(session);
  mocks.apply.mockImplementation(async (look) => look);
  useStore.setState({
    can: () => true,
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
      screen.getByRole("button", { name: "Back to shop management" }),
    );
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Leave wardrobe" }));
    expect(close).toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("blocks loading without the gate and unmounts on permission removal", async () => {
    useStore.setState({ can: () => false });
    const view = render(<MyCosmetics onClose={vi.fn()} />);
    expect(mocks.load).not.toHaveBeenCalled();
    view.unmount();
    useStore.setState({ can: () => true });
    await open();
    act(() => useStore.setState({ can: () => false }));
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
