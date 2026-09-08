import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";
import { StallOrnament } from "./CosmeticOrnaments";
import { TitleBadge } from "./TitleBadge";
import { coinSrc, isCoinVariant, COIN_VARIANTS } from "../lib/coins";

describe("grand opening cosmetics", () => {
  it.each([24, 32, 64, 96])("keeps the avatar and decorative ribbon at %ipx", (size) => {
    const { container } = render(<Avatar name="Collector" url="/avatar.png" size={size} frame="ribbon-of-welcome" />);
    expect(screen.getByRole("img", { name: "Collector" }).getAttribute("width")).toBe(String(size));
    const ornament = container.querySelector('img[src="/cosmetics/welcome-ribbon.svg"]');
    expect(ornament?.getAttribute("aria-hidden")).toBe("true");
    expect(ornament?.className).toContain("pointer-events-none");
  });

  it("places opening-night art behind Community content", () => {
    const { container } = render(<StallOrnament styleKey="opening-night" />);
    expect(container.firstElementChild?.className).toContain("-z-10");
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders the new paid title with its own treatment", () => {
    render(<TitleBadge badge={{ id: "preview", slug: "shop-title-grand-debut", name: "Grand Debut", description: "An opening-night title", icon: "sparkles", prestige: 3, kind: "shop", effect: "grand-debut" }} />);
    expect(screen.getByText("Grand Debut").parentElement?.className).toContain("bg-[#173b3d]");
  });

  it("ships local vector art and keeps the new mint out of free defaults", () => {
    expect(isCoinVariant("first-strike")).toBe(true);
    expect(COIN_VARIANTS.some(({ id }) => id === "first-strike")).toBe(false);
    for (const path of [coinSrc("first-strike"), "/cosmetics/welcome-ribbon.svg", "/cosmetics/opening-night.svg"]) {
      const svg = readFileSync(`public${path}`, "utf8");
      const document = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(document.querySelector("parsererror")).toBeNull();
      expect(document.documentElement.getAttribute("viewBox")).toBeTruthy();
      expect(document.querySelector("script, foreignObject, image")).toBeNull();
    }
  });

  it("gives Encore a distinct completion treatment", () => {
    render(<TitleBadge badge={{ id: "reward", slug: "shop-set-grand-debut", name: "Encore", description: "Complete the four-piece Grand Debut collection.", icon: "crown", prestige: 7, kind: "shop", effect: "encore" }} />);
    expect(screen.getByText("Encore").parentElement?.className).toContain("fx-shimmer");
    expect(screen.getByText("Encore").parentElement?.className).toContain("text-[#173b3d]");
  });
});
