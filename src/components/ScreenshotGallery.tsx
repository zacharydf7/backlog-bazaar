import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";

/** Wrap an index into [0, length) so prev/next loop around the gallery. Returns 0
 *  for an empty list. Pure — unit-tested. */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

/** Prev/next controls + a count badge, shared by the inline gallery and the
 *  expanded lightbox. `size` tunes the chevron buttons for each context. */
function NavControls({
  count,
  idx,
  onGo,
  size,
}: {
  count: number;
  idx: number;
  onGo: (delta: number, e: React.MouseEvent) => void;
  size: "sm" | "lg";
}) {
  if (count <= 1) return null;
  const pad = size === "lg" ? "p-2" : "p-1.5";
  const icon = size === "lg" ? 24 : 18;
  return (
    <>
      <button
        type="button"
        onClick={(e) => onGo(-1, e)}
        aria-label="Previous screenshot"
        className={`absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/55 ${pad} text-white transition hover:bg-black/75`}
      >
        <ChevronLeft size={icon} />
      </button>
      <button
        type="button"
        onClick={(e) => onGo(1, e)}
        aria-label="Next screenshot"
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/55 ${pad} text-white transition hover:bg-black/75`}
      >
        <ChevronRight size={icon} />
      </button>
      <span className="absolute bottom-1.5 right-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {idx + 1} / {count}
      </span>
    </>
  );
}

/** A compact flip-through gallery of a game's catalog screenshots: a small 16:9
 *  frame with prev/next + dots that a player can click to expand into a full-screen
 *  lightbox. Renders nothing when there are no screenshots, so callers can drop it
 *  in unconditionally. Mobile-first; semantic tokens. */
export function ScreenshotGallery({ urls }: { urls: string[] }) {
  const [i, setI] = useState(0);
  const [expanded, setExpanded] = useState(false);
  if (urls.length === 0) return null;

  const idx = wrapIndex(i, urls.length);
  const go = (delta: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setI(wrapIndex(idx + delta, urls.length));
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Kept small so it doesn't dominate the modal; click to expand for detail.
          A div (not button) so the nav buttons can nest validly; keyboard-operable
          via role/tabIndex. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(true);
          }
        }}
        aria-label="Expand screenshots"
        className="group relative mx-auto block aspect-[16/9] w-full max-w-md cursor-zoom-in overflow-hidden rounded-xl border border-line bg-panel"
      >
        <img src={urls[idx]} alt={`Screenshot ${idx + 1}`} className="h-full w-full object-cover" />
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white opacity-0 transition group-hover:opacity-100">
          <Maximize2 size={14} />
        </span>
        <NavControls count={urls.length} idx={idx} onGo={go} size="sm" />
      </div>
      {urls.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {urls.map((url, n) => (
            <button
              key={url}
              type="button"
              onClick={() => setI(n)}
              aria-label={`Go to screenshot ${n + 1}`}
              aria-current={n === idx}
              className={
                "h-1.5 w-1.5 rounded-full transition " + (n === idx ? "bg-brand" : "bg-line hover:bg-subtle")
              }
            />
          ))}
        </div>
      )}

      {expanded &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
            onClick={() => setExpanded(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Screenshot viewer"
          >
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-full bg-black/55 p-2 text-white transition hover:bg-black/75"
            >
              <X size={20} />
            </button>
            <div
              className="relative flex max-h-full max-w-5xl items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={urls[idx]}
                alt={`Screenshot ${idx + 1}`}
                className="max-h-[85vh] w-auto rounded-lg object-contain"
              />
              <NavControls count={urls.length} idx={idx} onGo={go} size="lg" />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
