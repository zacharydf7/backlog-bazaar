import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Wrap an index into [0, length) so prev/next loop around the gallery. Returns 0
 *  for an empty list. Pure — unit-tested. */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

/** A flip-through gallery of a game's catalog screenshots: a 16:9 frame with
 *  prev/next controls and dots. Renders nothing when there are no screenshots, so
 *  callers can drop it in unconditionally. Mobile-first; semantic tokens. */
export function ScreenshotGallery({ urls }: { urls: string[] }) {
  const [i, setI] = useState(0);
  if (urls.length === 0) return null;

  const idx = wrapIndex(i, urls.length);
  const go = (delta: number) => setI(wrapIndex(idx + delta, urls.length));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-line bg-panel">
        <img src={urls[idx]} alt={`Screenshot ${idx + 1}`} className="h-full w-full object-cover" />
        {urls.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous screenshot"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-1.5 text-white transition hover:bg-black/75"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next screenshot"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-1.5 text-white transition hover:bg-black/75"
            >
              <ChevronRight size={18} />
            </button>
            <span className="absolute bottom-1.5 right-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {idx + 1} / {urls.length}
            </span>
          </>
        )}
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
    </div>
  );
}
