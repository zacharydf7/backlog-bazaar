import { describe, it, expect } from "vitest";
import {
  validateBannerFile,
  validateBannerDimensions,
  coverRect,
  clampCropRect,
  BANNER_W,
  BANNER_H,
  BANNER_MAX_BYTES,
  BANNER_MIN_W,
  BANNER_MIN_H,
} from "./banner";

describe("validateBannerFile", () => {
  it("accepts a reasonable image", () => {
    expect(() => validateBannerFile({ type: "image/png", size: 1024 })).not.toThrow();
  });

  it("rejects a non-image", () => {
    expect(() => validateBannerFile({ type: "application/pdf", size: 1024 })).toThrow(/image file/i);
  });

  it("rejects an oversized file", () => {
    expect(() => validateBannerFile({ type: "image/jpeg", size: BANNER_MAX_BYTES + 1 })).toThrow(/too large/i);
  });
});

describe("validateBannerDimensions", () => {
  it("accepts an image at or above the minimum", () => {
    expect(() => validateBannerDimensions(BANNER_MIN_W, BANNER_MIN_H)).not.toThrow();
  });

  it("rejects an unreadable (zero-size) image", () => {
    expect(() => validateBannerDimensions(0, 0)).toThrow(/read that image/i);
  });

  it("rejects an image below the minimum dimensions", () => {
    expect(() => validateBannerDimensions(BANNER_MIN_W - 1, BANNER_MIN_H)).toThrow(/too small/i);
    expect(() => validateBannerDimensions(BANNER_MIN_W, BANNER_MIN_H - 1)).toThrow(/too small/i);
  });
});

describe("coverRect", () => {
  it("fills the target and centers a wider-than-target source (crops sides)", () => {
    // Source twice as wide as the banner ratio: height drives the scale, the
    // horizontal overflow splits evenly.
    const r = coverRect(BANNER_W * 2, BANNER_H, BANNER_W, BANNER_H);
    expect(r.dh).toBeCloseTo(BANNER_H);
    expect(r.dw).toBeCloseTo(BANNER_W * 2);
    expect(r.dx).toBeCloseTo((BANNER_W - BANNER_W * 2) / 2);
    expect(r.dy).toBeCloseTo(0);
  });

  it("fills the target and centers a taller-than-target source (crops top/bottom)", () => {
    const r = coverRect(BANNER_W, BANNER_W, BANNER_W, BANNER_H);
    expect(r.dw).toBeCloseTo(BANNER_W);
    expect(r.dh).toBeCloseTo(BANNER_W);
    expect(r.dx).toBeCloseTo(0);
    expect(r.dy).toBeCloseTo((BANNER_H - BANNER_W) / 2);
  });

  it("upscales a small source to cover the target", () => {
    const r = coverRect(BANNER_W / 2, BANNER_H / 2, BANNER_W, BANNER_H);
    expect(r.dw).toBeCloseTo(BANNER_W);
    expect(r.dh).toBeCloseTo(BANNER_H);
  });
});

describe("clampCropRect", () => {
  it("passes a well-formed selection through (rounded to integers)", () => {
    expect(clampCropRect({ x: 10.4, y: 20.6, width: 300.2, height: 100.5 }, 1000, 500)).toEqual({
      x: 10,
      y: 21,
      width: 300,
      height: 101,
    });
  });

  it("pulls a selection that drifted past the right/bottom edge back inside", () => {
    expect(clampCropRect({ x: 900, y: 450, width: 300, height: 100 }, 1000, 500)).toEqual({
      x: 700,
      y: 400,
      width: 300,
      height: 100,
    });
  });

  it("clamps negative origins to the top-left corner", () => {
    expect(clampCropRect({ x: -5, y: -5, width: 100, height: 50 }, 1000, 500)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
  });

  it("caps an oversized selection at the full source", () => {
    expect(clampCropRect({ x: 0, y: 0, width: 5000, height: 5000 }, 1000, 500)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 500,
    });
  });
});
