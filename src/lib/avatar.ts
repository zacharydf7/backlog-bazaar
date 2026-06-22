// Avatar helpers: client-side image processing for uploads, plus an initials
// fallback used when a user has no picture.

/** The square size (px) avatars are normalized to before upload. */
export const AVATAR_SIZE = 256;

/** Up to two initials for a display name, e.g. "The Big Bad Hippo" -> "TH". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Validate, center-crop to a square, and downscale an uploaded image to a small
 * JPEG so avatars stay uniform and storage stays tiny. Throws a user-friendly
 * Error on anything unusable.
 */
export async function processAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  const src = await loadBitmap(file);
  const w = src.width;
  const h = src.height;
  if (!w || !h) throw new Error("Couldn't read that image.");

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image.");

  // Cover-fit: scale so the shorter side fills the square, then center it.
  const scale = Math.max(AVATAR_SIZE / w, AVATAR_SIZE / h);
  const dw = w * scale;
  const dh = h * scale;
  ctx.drawImage(src, (AVATAR_SIZE - dw) / 2, (AVATAR_SIZE - dh) / 2, dw, dh);
  if ("close" in src && typeof src.close === "function") src.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) throw new Error("Couldn't process that image.");
  return blob;
}
