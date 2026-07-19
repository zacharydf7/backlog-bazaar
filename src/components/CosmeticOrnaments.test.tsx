import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  FRAME_ORNAMENT_KEYS,
  FrameOrnament,
  STALL_ORNAMENT_KEYS,
  StallOrnament,
} from "./CosmeticOrnaments";
import { STALL_STYLES } from "../lib/shopCosmetics";

// The ornaments are pure decoration: they must render for every registered key,
// stay out of the accessibility tree, and degrade to nothing on unknown input
// (a DB row can never crash a host).

describe("FrameOrnament", () => {
  it("renders every registered frame ornament as hidden decoration", () => {
    for (const key of FRAME_ORNAMENT_KEYS) {
      const { container, unmount } = render(<FrameOrnament ornament={key} size={44} />);
      expect(container.firstChild, key).not.toBeNull();
      expect(container.querySelector('[aria-hidden="true"]'), key).not.toBeNull();
      unmount();
    }
  });

  it("renders nothing for an unknown key", () => {
    const { container } = render(<FrameOrnament ornament="not-an-ornament" size={44} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("StallOrnament", () => {
  it("renders for every ornamented stall style, nothing for plain ones", () => {
    for (const [key, style] of Object.entries(STALL_STYLES)) {
      const { container, unmount } = render(<StallOrnament styleKey={key} />);
      if (style.ornament) {
        expect(container.innerHTML, key).not.toBe("");
        expect(container.querySelector('[aria-hidden="true"]'), key).not.toBeNull();
      } else {
        expect(container.firstChild, key).toBeNull();
      }
      unmount();
    }
  });

  it("covers every registered stall ornament with at least one style", () => {
    const used = new Set(
      Object.values(STALL_STYLES)
        .map((s) => s.ornament)
        .filter(Boolean),
    );
    for (const key of STALL_ORNAMENT_KEYS) expect(used, key).toContain(key);
  });

  it("renders nothing for unknown or missing style keys", () => {
    expect(render(<StallOrnament styleKey="not-a-style" />).container.firstChild).toBeNull();
    expect(render(<StallOrnament styleKey={null} />).container.firstChild).toBeNull();
  });
});
