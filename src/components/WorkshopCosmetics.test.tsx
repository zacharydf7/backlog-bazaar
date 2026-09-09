import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";
import { StallOrnament } from "./CosmeticOrnaments";
import { badgeChipClass, TITLE_EFFECTS } from "../lib/badges";

const frames = ["maple-crown", "alchemist-sigil", "crescent-cradle", "captains-knot", "escapement", "origami-halo", "windrose"];
const stalls = ["amber-orchard", "midnight-apothecary", "lunar-conservatory", "cartographers-quay", "clockwork-exchange", "paper-lantern-lane", "cloudport"];
const titles = ["autumn-archivist", "potion-peddler", "moonlit-curator", "wayfinder", "secondhand-sage", "wishkeeper", "skybound", "horizon-keeper"];

function checkArt(container: HTMLElement, key: string) {
  const image = container.querySelector(`img[src="/cosmetics/${key}.svg"]`);
  expect(image?.getAttribute("aria-hidden")).toBe("true");
  expect(image?.className).toContain("pointer-events-none");
  const svg = readFileSync(`public/cosmetics/${key}.svg`, "utf8");
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(document.querySelector("parsererror")).toBeNull();
  expect(document.querySelector("script, foreignObject, image")).toBeNull();
  expect(document.documentElement.getAttribute("viewBox")).toBeTruthy();
}

describe("new workshop cosmetics", () => {
  it.each(frames)("keeps %s art decorative and preserves the avatar", (frame) => {
    const { container } = render(<Avatar name="Collector" url="/avatar.png" size={32} frame={frame} />);
    expect(screen.getByRole("img", { name: "Collector" }).getAttribute("width")).toBe("32");
    checkArt(container, frame);
  });
  it.each(stalls)("keeps %s behind Community content", (styleKey) => {
    const { container } = render(<StallOrnament styleKey={styleKey} />);
    expect(container.firstElementChild?.className).toContain("-z-10");
    checkArt(container, styleKey);
  });
  it.each(titles)("resolves the %s treatment instead of a fallback", (effect) => {
    expect(badgeChipClass({ kind: "shop", prestige: 3, effect })).toBe(TITLE_EFFECTS[effect].chipClassName);
  });
});
