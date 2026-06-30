import { describe, it, expect } from "vitest";
import {
  validateBannerFile,
  validateBannerDimensions,
  coverRect,
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
    // 3000x500 into 1500x500: scale 1, dw 3000, centered → dx negative, dy 0.
    const r = coverRect(3000, 500, BANNER_W, BANNER_H);
    expect(r.dw).toBeCloseTo(3000);
    expect(r.dh).toBeCloseTo(500);
    expect(r.dx).toBeCloseTo((BANNER_W - 3000) / 2);
    expect(r.dy).toBeCloseTo(0);
  });

  it("fills the target and centers a taller-than-target source (crops top/bottom)", () => {
    // 1500x1500 into 1500x500: scale 1, dh 1500, centered vertically.
    const r = coverRect(1500, 1500, BANNER_W, BANNER_H);
    expect(r.dw).toBeCloseTo(1500);
    expect(r.dh).toBeCloseTo(1500);
    expect(r.dx).toBeCloseTo(0);
    expect(r.dy).toBeCloseTo((BANNER_H - 1500) / 2);
  });

  it("upscales a small source to cover the target", () => {
    const r = coverRect(750, 250, BANNER_W, BANNER_H);
    expect(r.dw).toBeCloseTo(BANNER_W);
    expect(r.dh).toBeCloseTo(BANNER_H);
  });
});
