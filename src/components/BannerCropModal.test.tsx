// The banner crop step. react-easy-crop's gesture surface is pointer/touch
// work jsdom can't drive, so the library is stubbed with a control that
// reports a crop selection — these specs cover OUR flow around it: the modal
// gating, the save/cancel wiring, and the file-pick → crop → setBanner path.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";

vi.mock("react-easy-crop", () => ({
  default: (props: { onCropComplete?: (area: unknown, px: unknown) => void }) => (
    <button
      type="button"
      onClick={() => props.onCropComplete?.({}, { x: 40, y: 20, width: 1200, height: 400 })}
    >
      simulate crop
    </button>
  ),
}));

import { BannerCropModal } from "./BannerCropModal";
import { ProfileHub } from "./ProfileHub";
import { useStore } from "../store";

const file = () => new File(["x"], "banner.png", { type: "image/png" });

beforeEach(() => {
  // jsdom has no object URLs; the modal only needs stable strings.
  URL.createObjectURL = vi.fn(() => "blob:banner");
  URL.revokeObjectURL = vi.fn();
});

describe("BannerCropModal", () => {
  it("keeps Save disabled until a crop is reported, then hands back the pixel rect", () => {
    const onSave = vi.fn();
    render(<BannerCropModal file={file()} onCancel={() => {}} onSave={onSave} />);
    const save = screen.getByRole("button", { name: /Save banner/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(screen.getByText("simulate crop"));
    expect((screen.getByRole("button", { name: /Save banner/i }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ x: 40, y: 20, width: 1200, height: 400 });
  });

  it("cancel closes without saving", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<BannerCropModal file={file()} onCancel={onCancel} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders in a portal on document.body so page content can't stack above it", () => {
    const { container } = render(
      <BannerCropModal file={file()} onCancel={() => {}} onSave={() => {}} />,
    );
    // Nothing in the render container — the dialog lives directly under <body>.
    expect(container.firstChild).toBeNull();
    const backdrop = screen.getByText(/Position your banner/i).closest(".fixed");
    expect(backdrop?.parentElement).toBe(document.body);
  });

  it("clicking the backdrop does NOT cancel (a crop drag released outside must not discard work)", () => {
    const onCancel = vi.fn();
    render(<BannerCropModal file={file()} onCancel={onCancel} onSave={() => {}} />);
    const backdrop = screen.getByText(/Position your banner/i).closest(".fixed") as HTMLElement;
    fireEvent.click(backdrop);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("ProfileHub banner flow", () => {
  it("picking a file opens the crop step, and saving passes the file + rect to setBanner", () => {
    const setBanner = vi.fn(
      async (_file: File, _crop?: { x: number; y: number; width: number; height: number }) => {},
    );
    act(() =>
      useStore.setState({ viewing: null, cloud: true, displayName: "Me", games: [], setBanner }),
    );
    const { container } = render(<ProfileHub onOpenTab={() => {}} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file()] } });
    expect(screen.getByText(/Position your banner/i)).toBeTruthy();

    fireEvent.click(screen.getByText("simulate crop"));
    fireEvent.click(screen.getByRole("button", { name: /Save banner/i }));
    expect(setBanner).toHaveBeenCalledOnce();
    expect(setBanner.mock.calls[0][1]).toEqual({ x: 40, y: 20, width: 1200, height: 400 });
    // The modal closes once the save is handed off.
    expect(screen.queryByText(/Position your banner/i)).toBeNull();
  });

  it("rejects a non-image before the crop step ever opens", () => {
    const setBanner = vi.fn(
      async (_file: File, _crop?: { x: number; y: number; width: number; height: number }) => {},
    );
    act(() =>
      useStore.setState({ viewing: null, cloud: true, displayName: "Me", games: [], setBanner }),
    );
    const { container } = render(<ProfileHub onOpenTab={() => {}} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "notes.pdf", { type: "application/pdf" })] },
    });
    expect(screen.queryByText(/Position your banner/i)).toBeNull();
    expect(setBanner).not.toHaveBeenCalled();
  });
});
