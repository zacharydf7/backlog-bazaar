import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";
import { StallOrnament } from "./CosmeticOrnaments";
import { TitleBadge } from "./TitleBadge";
import { COIN_VARIANTS, coinSrc, isCoinVariant } from "../lib/coins";
import { resolveBadgeIcon, TITLE_EFFECTS } from "../lib/badges";

// Hearthside, the fall 2026 collection (owner picks, 2026-10-23): the Hearthside
// Nook stall, the Falling Leaves frame, the round Cocoa Mint, and the Sweater
// Weather and Hearthkeeper titles.
describe("hearthside cosmetics", () => {
  it("lights the hearth behind Community content: fire, embers, steam and window leaves", () => {
    const { container } = render(<StallOrnament styleKey="hearthside-nook" />);
    const layer = container.firstElementChild!;
    expect(layer.className).toContain("-z-10");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    const svg = layer.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll(".fx-flame")).toHaveLength(3);
    expect(svg.querySelectorAll(".fx-spark")).toHaveLength(3);
    expect(svg.querySelectorAll(".fx-bubble")).toHaveLength(2);
    expect(svg.querySelectorAll(".fx-fall .fx-flutter")).toHaveLength(3);
    // Embers and steam scale as they rise: around themselves, not the
    // viewBox corner, or they'd streak across the room.
    for (const part of svg.querySelectorAll<SVGElement>(".fx-spark, .fx-bubble")) {
      expect(part.style.transformBox).toBe("fill-box");
    }
  });

  it("gives each hearth its own gradients, so a page of stalls never shares one", () => {
    const { container } = render(
      <>
        <StallOrnament styleKey="hearthside-nook" />
        <StallOrnament styleKey="hearthside-nook" />
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([32, 84])("drifts three leaves past the frame at %ipx, resting still in lists", (size) => {
    const { container } = render(<Avatar name="Collector" url="/avatar.png" size={size} frame="falling-leaves" calm />);
    expect(screen.getByRole("img", { name: "Collector" }).getAttribute("width")).toBe(String(size));
    const ring = container.querySelector('[data-frame="falling-leaves"]')!;
    expect(ring.className).toContain("fx-calm");
    const overlay = ring.querySelector("svg")!;
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.getAttribute("class")).toContain("pointer-events-none");
    expect(overlay.querySelectorAll(".fx-fall .fx-flutter")).toHaveLength(3);
  });

  it("stills the new motion for reduced-motion players", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.fx-flame,\s*\.fx-flutter \{\s*animation: none;/);
  });

  it("dresses both titles, the reward in firelight", () => {
    render(
      <>
        <TitleBadge badge={{ id: "t", slug: "shop-title-sweater-weather", name: "Sweater Weather", description: null, icon: "coffee", prestige: 3, kind: "shop", effect: "sweater-weather" }} />
        <TitleBadge badge={{ id: "r", slug: "shop-set-hearthside", name: "Hearthkeeper", description: null, icon: "flame", prestige: 7, kind: "shop", effect: "hearthkeeper" }} />
      </>,
    );
    expect(screen.getByText("Sweater Weather").parentElement?.className).toContain("bg-[#efe2c8]");
    expect(screen.getByText("Hearthkeeper").parentElement?.className).toContain("fx-flicker");
    expect(resolveBadgeIcon("flame")).not.toBe(resolveBadgeIcon("award"));
    expect(resolveBadgeIcon("coffee")).not.toBe(resolveBadgeIcon("award"));
  });

  it("ships the Cocoa Mint as a shop skin, kept out of the free faces", () => {
    expect(isCoinVariant("cocoa")).toBe(true);
    expect(COIN_VARIANTS.some(({ id }) => id === "cocoa")).toBe(false);
    const svg = new DOMParser().parseFromString(readFileSync(`public${coinSrc("cocoa")}`, "utf8"), "image/svg+xml");
    expect(svg.querySelector("parsererror")).toBeNull();
    expect(svg.documentElement.getAttribute("viewBox")).toBe("0 0 48 48");
    expect(svg.querySelector("script, foreignObject, image")).toBeNull();
  });

  it("seeds the Hearthkeeper reward title with its firelight effect", () => {
    const schema = readFileSync("supabase/schema.sql", "utf8");
    expect(schema).toContain("values('shop-set-hearthside','Hearthkeeper','Complete the Hearthside collection.','flame','shop',7,'hearthkeeper')");
    expect(TITLE_EFFECTS.hearthkeeper).toBeTruthy();
  });
});
