// Profile banner uploads: validate, crop to a wide banner, and downscale to a
// JPEG so banners stay uniform and storage stays tiny. Mirrors avatar.ts.
// The user picks the exact crop in BannerCropModal (drag/zoom/pinch); the rect
// it produces is rendered here. The geometry + file validation are pure
// (unit-tested); the <canvas> encode is the browser-only step (exercised in
// the app, not under jsdom).

import { loadBitmap } from "./image";

/** Output banner dimensions (3:1). */
export const BANNER_W = 2400;
export const BANNER_H = 800;

/** Max accepted upload size and the minimum source dimensions we'll accept (so a
 *  tiny image isn't stretched into a blurry banner). */
export const BANNER_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const BANNER_MIN_W = 600;
export const BANNER_MIN_H = 200;

/** Validate the chosen file's type and size before we ever decode it. Throws a
 *  user-friendly Error. Pure: takes just the bits it needs so it's directly testable. */
export function validateBannerFile(file: { type: string; size: number }): void {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > BANNER_MAX_BYTES) {
    throw new Error(`That image is too large — keep banners under ${BANNER_MAX_BYTES / (1024 * 1024)} MB.`);
  }
}

/** Validate decoded source dimensions are big enough to make a clean banner. Throws. */
export function validateBannerDimensions(w: number, h: number): void {
  if (!w || !h) throw new Error("Couldn't read that image.");
  if (w < BANNER_MIN_W || h < BANNER_MIN_H) {
    throw new Error(`That image is too small — use at least ${BANNER_MIN_W}×${BANNER_MIN_H}px.`);
  }
}

/** A crop selection in source-image pixels (what react-easy-crop reports). */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Snap a crop selection safely inside the source image: integer edges, at
 *  least 1×1, never past a border — rounding drift from the crop UI must not
 *  make drawImage sample outside the bitmap. Pure, so it's unit-tested. */
export function clampCropRect(rect: CropRect, srcW: number, srcH: number): CropRect {
  const width = Math.min(Math.max(1, Math.round(rect.width)), srcW);
  const height = Math.min(Math.max(1, Math.round(rect.height)), srcH);
  const x = Math.min(Math.max(0, Math.round(rect.x)), srcW - width);
  const y = Math.min(Math.max(0, Math.round(rect.y)), srcH - height);
  return { x, y, width, height };
}

export interface CoverRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** Cover-fit geometry: scale the source so it fills `dstW`×`dstH`, centered (the
 *  overflow is cropped). The no-crop fallback when no rect is supplied. Pure. */
export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number): CoverRect {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  return { dx: (dstW - dw) / 2, dy: (dstH - dh) / 2, dw, dh };
}

/** Validate, crop, downscale and re-encode a banner as JPEG. With `crop`, the
 *  user-chosen source rect fills the banner exactly; without it, fall back to
 *  the centered cover crop. */
export async function processBanner(file: File, crop?: CropRect): Promise<Blob> {
  validateBannerFile(file);
  const src = await loadBitmap(file);
  validateBannerDimensions(src.width, src.height);

  const canvas = document.createElement("canvas");
  canvas.width = BANNER_W;
  canvas.height = BANNER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image.");
  if (crop) {
    const c = clampCropRect(crop, src.width, src.height);
    ctx.drawImage(src, c.x, c.y, c.width, c.height, 0, 0, BANNER_W, BANNER_H);
  } else {
    const { dx, dy, dw, dh } = coverRect(src.width, src.height, BANNER_W, BANNER_H);
    ctx.drawImage(src, dx, dy, dw, dh);
  }
  if ("close" in src && typeof src.close === "function") src.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) throw new Error("Couldn't process that image.");
  return blob;
}
