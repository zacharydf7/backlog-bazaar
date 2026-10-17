import { useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { MAX_PERSONAL_SCREENSHOTS } from "../../lib/personalScreenshots";
import { ScreenshotGallery } from "../ScreenshotGallery";

/** A bundled game's own screenshots (issue 86fc0b4b): a game inside a
 *  compilation has no catalog link, so instead of the shared screenshots the
 *  player adds their own. Owner-only and cloud-only (the files live in
 *  storage), like a custom cover; renders nothing offline. */
export function PersonalScreenshots({ game }: { game: Game }) {
  const cloud = useStore((s) => s.cloud);
  const addPersonalScreenshot = useStore((s) => s.addPersonalScreenshot);
  const removePersonalScreenshot = useStore((s) => s.removePersonalScreenshot);
  const [editing, setEditing] = useState(false);
  if (!cloud) return null;

  const shots = game.personalScreenshots ?? [];
  const full = shots.length >= MAX_PERSONAL_SCREENSHOTS;
  return (
    <div className="rounded-xl border border-line bg-panel/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-subtle">
          <Camera size={12} className="text-accent/70" /> Your screenshots
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {shots.length > 0 && (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="rounded-lg px-2 py-1 text-xs text-muted transition hover:text-ink"
            >
              {editing ? "Done" : "Edit"}
            </button>
          )}
          {!full && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink transition hover:border-brand/50">
              <ImagePlus size={14} className="text-accent" /> Add screenshot
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void addPersonalScreenshot(game.id, f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </div>
      {shots.length === 0 ? (
        <p className="text-[11px] text-subtle">
          Add your own — only you see them, and the PlayStation and Game Boy Color versions of a
          game each keep their own.
        </p>
      ) : editing ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {shots.map((url, n) => (
            <li key={url} className="relative">
              <img src={url} alt="" className="aspect-video w-full rounded-md object-cover" />
              <button
                type="button"
                onClick={() => void removePersonalScreenshot(game.id, url)}
                aria-label={`Remove screenshot ${n + 1}`}
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-danger"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ScreenshotGallery urls={shots} />
      )}
    </div>
  );
}
