import { useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { ImagePlus, X } from "lucide-react";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { BANNER_W, BANNER_H, type CropRect } from "../lib/banner";

/** Interactive banner cropping: drag to position, scroll/pinch (or the slider)
 *  to zoom, locked to the banner's 3:1 frame. Hands the chosen source-pixel
 *  rect back to the caller — rendering/encoding stays in lib/banner.ts. */
export function BannerCropModal({
  file,
  onCancel,
  onSave,
}: {
  file: File;
  onCancel: () => void;
  onSave: (crop: CropRect) => void;
}) {
  useScrollLock(true);
  useHistoryDismiss(true, onCancel);

  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState<Area | null>(null);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <ImagePlus size={18} className="text-accent" /> Position your banner
          </h2>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-muted transition hover:bg-panel hover:text-ink"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="relative h-52 w-full overflow-hidden rounded-xl bg-black/60 sm:h-72">
            <Cropper
              image={url}
              crop={crop}
              zoom={zoom}
              maxZoom={5}
              aspect={BANNER_W / BANNER_H}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_area, px) => setAreaPx(px)}
            />
          </div>
          <label className="flex items-center gap-3 text-xs text-muted">
            Zoom
            <input
              type="range"
              min={1}
              max={5}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-[var(--brand)]"
            />
          </label>
          <p className="text-xs text-subtle">
            Drag to position, scroll or pinch to zoom. The frame is what everyone sees on your
            profile.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line p-4">
          <button
            onClick={onCancel}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => areaPx && onSave(areaPx)}
            disabled={!areaPx}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save banner
          </button>
        </div>
      </div>
    </div>
  );
}
