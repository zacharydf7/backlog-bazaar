// Report attachments: screenshots and small log/text files on a feature or bug
// report. Pure validation + a small prep step here so limits/types are unit-
// testable; the upload itself (Storage + DB row) lives in the store.

import { downscaleImage } from "./image";

/** Most files allowed on a single report. */
export const MAX_FILES = 5;

/** Per-file size cap (10 MB). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Longest side (px) screenshots are downscaled to before upload. */
export const MAX_IMAGE_DIM = 1600;

// Non-image types we accept (logs/text). Images are matched by their MIME prefix.
const ALLOWED_TEXT_TYPES = new Set(["text/plain", "text/csv", "application/json"]);

// Some browsers report .log/.txt with an empty MIME type, so allow by extension too.
const ALLOWED_EXTENSIONS = ["log", "txt", "csv", "json"];

interface FileLike {
  name: string;
  type: string;
  size: number;
}

export function isImage(file: { type: string }): boolean {
  return file.type.startsWith("image/");
}

function extension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** Merge newly chosen files into the current selection: drop unsupported/oversized
 *  ones and cap the total at MAX_FILES, collecting a user-facing reason for each
 *  rejection. Pure, so the picker's accept/reject behavior is unit-testable. */
export function mergeFiles<T extends FileLike>(
  current: T[],
  incoming: T[],
): { files: T[]; errors: string[] } {
  const errors: string[] = [];
  const accepted: T[] = [];
  for (const f of incoming) {
    const reason = validateFile(f);
    if (reason) errors.push(reason);
    else accepted.push(f);
  }
  let files = [...current, ...accepted];
  if (files.length > MAX_FILES) {
    errors.push(`You can attach up to ${MAX_FILES} files.`);
    files = files.slice(0, MAX_FILES);
  }
  return { files, errors };
}

/** Null if the file is an acceptable attachment, otherwise a user-facing reason. */
export function validateFile(file: FileLike): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`;
  }
  const ok =
    isImage(file) ||
    ALLOWED_TEXT_TYPES.has(file.type) ||
    ALLOWED_EXTENSIONS.includes(extension(file.name));
  if (!ok) {
    return `${file.name} isn't a supported file type (images, .txt, .log, .json, .csv).`;
  }
  return null;
}

/** Prepare a file for upload: downscale + re-encode images to keep them small;
 *  pass non-image files through unchanged. Returns the blob plus the content
 *  type and filename to store. */
export async function prepareUpload(
  file: File,
): Promise<{ blob: Blob; contentType: string; name: string }> {
  if (isImage(file)) {
    const blob = await downscaleImage(file, MAX_IMAGE_DIM);
    // We re-encode images to JPEG, so normalize the extension to match.
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return { blob, contentType: "image/jpeg", name: `${base}.jpg` };
  }
  return { blob: file, contentType: file.type || "text/plain", name: file.name };
}
