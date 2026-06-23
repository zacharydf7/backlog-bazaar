import { describe, it, expect } from "vitest";
import {
  validateFile,
  isImage,
  mergeFiles,
  filesFromClipboard,
  MAX_FILE_BYTES,
  MAX_FILES,
} from "./attachment";

const file = (name: string, type: string, size = 1024) => ({ name, type, size });

describe("isImage", () => {
  it("is true for image MIME types", () => {
    expect(isImage(file("a.png", "image/png"))).toBe(true);
    expect(isImage(file("a.jpg", "image/jpeg"))).toBe(true);
  });
  it("is false for non-images", () => {
    expect(isImage(file("a.log", "text/plain"))).toBe(false);
  });
});

describe("validateFile", () => {
  it("accepts images", () => {
    expect(validateFile(file("shot.png", "image/png"))).toBeNull();
  });

  it("accepts text/log files by MIME type", () => {
    expect(validateFile(file("console.log", "text/plain"))).toBeNull();
    expect(validateFile(file("data.json", "application/json"))).toBeNull();
    expect(validateFile(file("rows.csv", "text/csv"))).toBeNull();
  });

  it("accepts log/text files by extension when the MIME type is blank", () => {
    expect(validateFile(file("crash.log", ""))).toBeNull();
    expect(validateFile(file("notes.txt", ""))).toBeNull();
  });

  it("rejects unsupported types", () => {
    const reason = validateFile(file("malware.exe", "application/x-msdownload"));
    expect(reason).toMatch(/supported file type/);
  });

  it("rejects files over the size cap", () => {
    const reason = validateFile(file("huge.png", "image/png", MAX_FILE_BYTES + 1));
    expect(reason).toMatch(/too large/);
  });

  it("allows a file exactly at the size cap", () => {
    expect(validateFile(file("ok.png", "image/png", MAX_FILE_BYTES))).toBeNull();
  });
});

describe("limits", () => {
  it("caps files per report", () => {
    expect(MAX_FILES).toBeGreaterThan(0);
  });
});

describe("mergeFiles", () => {
  it("appends accepted files and reports rejected ones", () => {
    const current = [file("a.png", "image/png")];
    const { files, errors } = mergeFiles(current, [
      file("b.png", "image/png"),
      file("c.exe", "application/x-msdownload"),
    ]);
    expect(files.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/supported file type/);
  });

  it("caps the total at MAX_FILES and reports it", () => {
    const current = Array.from({ length: MAX_FILES }, (_, i) => file(`x${i}.png`, "image/png"));
    const { files, errors } = mergeFiles(current, [file("extra.png", "image/png")]);
    expect(files).toHaveLength(MAX_FILES);
    expect(errors.some((e) => /up to/.test(e))).toBe(true);
  });

  it("returns the current selection unchanged when nothing new is added", () => {
    const current = [file("a.png", "image/png")];
    const { files, errors } = mergeFiles(current, []);
    expect(files).toEqual(current);
    expect(errors).toEqual([]);
  });
});

describe("filesFromClipboard", () => {
  it("returns nothing when the clipboard has no files", () => {
    expect(filesFromClipboard(null)).toEqual([]);
    expect(filesFromClipboard({ files: [] })).toEqual([]);
    expect(filesFromClipboard({})).toEqual([]);
  });

  it("synthesizes a filename for a nameless pasted image", () => {
    const blob = new File([new Uint8Array([1, 2, 3])], "", { type: "image/png" });
    const [out] = filesFromClipboard({ files: [blob] });
    expect(out.name).toMatch(/^pasted-\d+\.png$/);
    expect(out.type).toBe("image/png");
  });

  it("keeps an existing filename", () => {
    const blob = new File([new Uint8Array([1])], "screenshot.png", { type: "image/png" });
    expect(filesFromClipboard({ files: [blob] })[0].name).toBe("screenshot.png");
  });
});
