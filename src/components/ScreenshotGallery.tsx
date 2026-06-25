import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/** Wrap an index into [0, length) so prev/next loop around the gallery. Returns 0
 *  for an empty list. Pure — unit-tested. */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

/** A compact row of a game's catalog screenshots: small 16:9 thumbnails laid out
 *  side by side. When they overflow, left/right buttons scroll more into view.
 *  Clicking a thumbnail opens a full-screen lightbox (uncropped, with prev/next).
 *  Renders nothing when empty, so callers can drop it in unconditionally.
 *  Mobile-first; semantic tokens. */
export function ScreenshotGallery({ urls }: { urls: string[] }) {
  const [i, setI] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  // Which scroll buttons to show: hidden at each edge / when everything fits.
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });

  function measure() {
    const el = rowRef.current;
    if (!el) return;
    setEdges({
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }

  useEffect(() => {
    measure();
    const el = rowRef.current;
    el?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.length]);

  if (urls.length === 0) return null;

  const idx = wrapIndex(i, urls.length);
  const scrollRow = (dir: number) => {
    rowRef.current?.scrollBy({ left: dir * rowRef.current.clientWidth * 0.8, behavior: "smooth" });
  };
  const openAt = (n: number) => {
    setI(n);
    setExpanded(true);
  };
  const lightboxGo = (delta: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setI(wrapIndex(idx + delta, urls.length));
  };

  return (
    <div className="relative">
      {!edges.atStart && (
        <button
          type="button"
          onClick={() => scrollRow(-1)}
          aria-label="Scroll screenshots left"
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-1 text-white transition hover:bg-black/75"
        >
          <ChevronLeft size={16} />
        </button>
      )}
      <div
        ref={rowRef}
        className="flex gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {urls.map((url, n) => (
          <button
            type="button"
            key={url}
            onClick={() => openAt(n)}
            aria-label={`View screenshot ${n + 1}`}
            className="aspect-[16/9] w-24 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-line bg-panel transition hover:border-brand/50"
          >
            <img src={url} alt={`Screenshot ${n + 1}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {!edges.atEnd && (
        <button
          type="button"
          onClick={() => scrollRow(1)}
          aria-label="Scroll screenshots right"
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-1 text-white transition hover:bg-black/75"
        >
          <ChevronRight size={16} />
        </button>
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
              {urls.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => lightboxGo(-1, e)}
                    aria-label="Previous screenshot"
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition hover:bg-black/75"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => lightboxGo(1, e)}
                    aria-label="Next screenshot"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition hover:bg-black/75"
                  >
                    <ChevronRight size={24} />
                  </button>
                  <span className="absolute bottom-1.5 right-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {idx + 1} / {urls.length}
                  </span>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
