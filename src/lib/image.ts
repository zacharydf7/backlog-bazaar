// Shared client-side image helpers, used by both avatar uploads (square crop)
// and report attachments (downscale). Kept separate so neither imports the other.

/** Decode a File into something drawable on a canvas. Prefers createImageBitmap
 *  (which honours EXIF orientation), falling back to an <img> element. */
export async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
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

/** Downscale an image File so neither side exceeds `maxDim` (preserving aspect
 *  ratio) and re-encode it as a JPEG. Images already within bounds are still
 *  re-encoded, which keeps uploads small and strips metadata. Throws a
 *  user-friendly Error on anything unusable. */
export async function downscaleImage(file: File, maxDim: number, quality = 0.85): Promise<Blob> {
  const src = await loadBitmap(file);
  const w = src.width;
  const h = src.height;
  if (!w || !h) throw new Error("Couldn't read that image.");

  const scale = Math.min(1, maxDim / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image.");
  ctx.drawImage(src, 0, 0, dw, dh);
  if ("close" in src && typeof src.close === "function") src.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Couldn't process that image.");
  return blob;
}
