import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ClaimAllBanner, RewardClaim } from "./RewardClaim";
import { useStore } from "../store";
import type { BonusEvent } from "../lib/bonusEvents";

const EVENT: BonusEvent = {
  id: "e1",
  name: "Double Everything Weekend",
  description: "",
  startsAt: Date.now() - 3_600_000,
  endsAt: Date.now() + 86_400_000,
  repeat: null,
  bountyMult: 2,
  sessionMult: 2,
  rewardsMult: 2,
  startDiscountPct: 0,
  discountLimit: null,
  genres: [],
  platforms: [],
  offMainPlatform: false,
  minHours: null,
  maxHours: null,
  playerCap: null,
  capUsed: 0,
  discountUsed: 0,
};

beforeEach(() => {
  act(() => useStore.setState({ economyEnabled: true, bonusEvents: [] }));
});

describe("RewardClaim", () => {
  it("claims the plain reward with no event running", () => {
    const onClaim = vi.fn(async () => {});
    render(<RewardClaim reward={25} state="claimable" onClaim={onClaim} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim +25" }));
    expect(onClaim).toHaveBeenCalled();
  });

  it("shows a running rewards boost on the Claim button", () => {
    act(() => useStore.setState({ bonusEvents: [EVENT] }));
    render(<RewardClaim reward={25} state="claimable" onClaim={async () => {}} />);
    const button = screen.getByRole("button", { name: /Claim/ });
    expect(button.querySelector("s")?.textContent).toBe("+25");
    expect(button.textContent).toMatch(/\+50$/);
    expect(button.getAttribute("title")).toBe("Double Everything Weekend: claim now for ×2");
  });

  it("marks a reward still to earn as boosted while the event runs", () => {
    act(() => useStore.setState({ bonusEvents: [EVENT] }));
    render(<RewardClaim reward={25} state="locked" onClaim={async () => {}} />);
    expect(screen.getByText("×2 now")).toBeTruthy();
  });
});

describe("ClaimAllBanner", () => {
  it("names the event and the boosted total", () => {
    act(() => useStore.setState({ bonusEvents: [EVENT] }));
    render(<ClaimAllBanner count={3} coins={75} onClaimAll={async () => {}} />);
    expect(screen.getByText(/Double Everything Weekend: claim now for ×2, 150 coins/)).toBeTruthy();
  });

  it("stays plain with no event", () => {
    render(<ClaimAllBanner count={3} coins={75} onClaimAll={async () => {}} />);
    expect(screen.queryByText(/claim now/)).toBeNull();
  });
});
