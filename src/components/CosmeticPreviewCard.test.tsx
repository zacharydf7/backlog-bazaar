import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CosmeticLookPreview } from "./CosmeticPreviewCard";
import { STALL_STYLES } from "../lib/shopCosmetics";
import type { ShopItem } from "../lib/shop";

const stall: ShopItem = {
  id: "stall",
  slug: "marquee",
  name: "Marquee",
  kind: "stall",
  description: null,
  price: 100,
  style: "marquee-lights",
  badgeId: null,
  tier: "premium",
  secret: false,
  active: true,
  setKey: null,
  availableFrom: null,
  availableUntil: null,
  sort: 0,
};
const props = {
  look: { title: null, frame: "frame", stall: "stall", coin: "coin" },
  items: [
    stall,
    { ...stall, id: "frame", kind: "frame" as const, style: "gilded" },
    { ...stall, id: "coin", kind: "coin" as const, style: "opal" },
  ],
  badges: [],
  identity: {
    name: "Reviewer",
    avatar: null,
    defaultCoin: "mint" as const,
    bannerUrl: "/banner.jpg",
    bg: "#ddeeff",
    accent: "#445566",
  },
};

describe("cosmetic display surfaces", () => {
  it("keeps the profile banner and palette free of stall classes and ornaments", () => {
    const { rerender } = render(<CosmeticLookPreview {...props} />);
    const profile = screen.getByTestId("look-preview");
    expect(profile.style.getPropertyValue("--canvas")).toBe("#ddeeff");
    expect(screen.getByAltText("Your profile banner").getAttribute("src")).toBe(
      "/banner.jpg",
    );
    expect(profile.querySelector('[data-frame="gilded"]')).toBeTruthy();
    expect(profile.querySelector('img[src="/coins/opal.svg"]')).toBeTruthy();
    const original = profile.innerHTML;
    const originalClasses = profile.className;
    rerender(
      <CosmeticLookPreview {...props} look={{ ...props.look, stall: null }} />,
    );
    expect(profile.innerHTML).toBe(original);
    expect(profile.className).toBe(originalClasses);
  });

  it("renders Community stall decoration without bringing over the profile banner or palette", () => {
    render(<CosmeticLookPreview {...props} surface="community" />);
    const community = screen.getByTestId("community-look-preview");
    for (const name of STALL_STYLES["marquee-lights"].cardClassName.split(" "))
      expect(community.classList.contains(name)).toBe(true);
    expect(
      community.querySelector('[aria-hidden="true"].pointer-events-none'),
    ).toBeTruthy();
    expect(community.style.getPropertyValue("--canvas")).toBe("");
    expect(screen.queryByAltText("Your profile banner")).toBeNull();
    expect(community.querySelector('img[src="/coins/opal.svg"]')).toBeNull();
  });

  it("leaves a bannerless profile undecorated too", () => {
    render(
      <CosmeticLookPreview
        {...props}
        identity={{ ...props.identity, bannerUrl: null }}
      />,
    );
    expect(screen.queryByAltText("Your profile banner")).toBeNull();
    expect(
      screen.getByTestId("look-preview").classList.contains("isolate"),
    ).toBe(false);
  });
});
