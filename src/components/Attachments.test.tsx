import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttachmentGrid } from "./Attachments";
import type { IssueAttachment } from "../types";

function att(over: Partial<IssueAttachment> = {}): IssueAttachment {
  return {
    id: "a1",
    requestId: "r1",
    userId: "u1",
    url: "https://x/attachments/u1/r1/file",
    path: "u1/r1/file",
    name: "file",
    contentType: "image/jpeg",
    size: 100,
    createdAt: 1,
    ...over,
  };
}

describe("AttachmentGrid — video (b83c9e21)", () => {
  it("plays an mp4 attachment inline with controls", () => {
    const { container } = render(
      <AttachmentGrid
        attachments={[att({ contentType: "video/mp4", name: "repro.mp4", url: "https://x/repro.mp4" })]}
      />,
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe("https://x/repro.mp4");
    expect(video?.hasAttribute("controls")).toBe(true);
    // Not treated as a downloadable file chip.
    expect(screen.queryByTitle(/Download/i)).toBeNull();
  });

  it("still renders images as thumbnails and other files as downloads", () => {
    const { container } = render(
      <AttachmentGrid
        attachments={[
          att({ id: "img", contentType: "image/jpeg", name: "shot.jpg" }),
          att({ id: "log", contentType: "text/plain", name: "crash.log" }),
        ]}
      />,
    );
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByTitle("Download crash.log")).toBeTruthy();
  });
});
