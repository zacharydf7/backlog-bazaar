import { useMemo, useRef, useState } from "react";
import { Palette, Pipette, X, Check, Wand2 } from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { Avatar } from "./Avatar";
import { resolveAccent } from "../lib/accent";
import { paletteFromImageEl, samplePixel } from "../lib/bannerSampling";
import { smartBannerThemes } from "../lib/smartBannerColors";
import {
  PROFILE_PRESETS,
  matchPreset,
  normalizeHex,
  profileColorVars,
} from "../lib/profileColors";

/** The theme's current value for a CSS variable, as a picker-safe hex (the
 *  native color input needs a concrete #rrggbb). Falls back when unreadable
 *  (jsdom, or a non-hex token value). */
function themeDefaultHex(varName: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName);
    return normalizeHex(v) ?? fallback;
  } catch {
    return fallback;
  }
}

/** One color row: a swatch that opens the native picker (visual selection /
 *  RGB) plus a hex field. `value` null = theme default (shown as such). */
function ColorField({
  label,
  value,
  themeVar,
  themeFallback,
  onChange,
}: {
  label: string;
  value: string | null;
  themeVar: string;
  themeFallback: string;
  onChange: (hex: string | null) => void;
}) {
  // The hex field tolerates partial typing; only a valid hex propagates.
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value ?? "";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-subtle">{label}</span>
      <div className="flex items-center gap-2">
        <label
          title={`Pick a ${label.toLowerCase()}`}
          className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line"
          style={{ backgroundColor: value ?? `var(${themeVar})` }}
        >
          <input
            type="color"
            aria-label={`${label} picker`}
            value={value ?? themeDefaultHex(themeVar, themeFallback)}
            onChange={(e) => {
              setText(null);
              onChange(e.target.value);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <input
          type="text"
          inputMode="text"
          aria-label={`${label} hex`}
          value={shown}
          placeholder="Theme default"
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const hex = normalizeHex(raw);
            if (hex) onChange(hex);
            else if (raw.trim() === "") onChange(null);
          }}
          onBlur={() => setText(null)}
          className="w-32 rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
        {value && (
          <button
            onClick={() => {
              setText(null);
              onChange(null);
            }}
            className="text-[11px] text-subtle underline-offset-2 transition hover:text-ink hover:underline"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

type MatchTarget = "bg" | "accent";

/** Match your colors to your banner: "Match my banner" auto-picks a whole
 *  complementary pair (tap again to cycle other good matches); for manual
 *  control, the image renders with auto-extracted dominant-color swatches, and
 *  clicking anywhere on it samples that exact pixel. Picks land on Background
 *  or Accent per the toggle. Degrades quietly (no auto button or swatches,
 *  clicks ignored) when the image can't be read from a canvas. */
function BannerColorMatcher({
  url,
  onPick,
  onMatch,
}: {
  url: string;
  onPick: (hex: string, target: MatchTarget) => void;
  onMatch: (bg: string, accent: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [target, setTarget] = useState<MatchTarget>("bg");
  const [swatches, setSwatches] = useState<string[]>([]);
  const [matchIdx, setMatchIdx] = useState(0);
  const themes = useMemo(() => smartBannerThemes(swatches), [swatches]);

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-subtle">
        <Pipette size={13} className="text-accent" /> Match your banner
      </span>
      {themes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              const t = themes[matchIdx % themes.length];
              onMatch(t.bg, t.accent);
              setMatchIdx((i) => i + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105"
          >
            <Wand2 size={14} /> {matchIdx === 0 ? "Match my banner" : "Try another match"}
          </button>
          <span className="text-[11px] text-subtle">
            Auto-picks a background &amp; accent that complement it.
          </span>
        </div>
      )}
      <div className="flex items-center gap-1 text-[11px]">
        <span className="text-subtle">Picks set:</span>
        {(["bg", "accent"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTarget(t)}
            aria-pressed={target === t}
            className={
              "rounded-full border px-2 py-0.5 transition " +
              (target === t
                ? "border-brand bg-brand text-brand-fg"
                : "border-line text-muted hover:text-ink")
            }
          >
            {t === "bg" ? "Background" : "Accent"}
          </button>
        ))}
      </div>
      <img
        ref={imgRef}
        src={url}
        alt="Your banner — click to sample a color"
        crossOrigin="anonymous"
        onLoad={() => {
          if (!imgRef.current) return;
          setSwatches(paletteFromImageEl(imgRef.current));
          setMatchIdx(0);
        }}
        onClick={(e) => {
          const img = imgRef.current;
          if (!img) return;
          const rect = img.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const hex = samplePixel(
            img,
            (e.clientX - rect.left) / rect.width,
            (e.clientY - rect.top) / rect.height,
          );
          if (hex) onPick(hex, target);
        }}
        className="aspect-[3/1] w-full cursor-crosshair rounded-xl border border-line object-cover"
      />
      {swatches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {swatches.map((hex) => (
            <button
              key={hex}
              title={hex}
              aria-label={`Use ${hex}`}
              onClick={() => onPick(hex, target)}
              className="h-6 w-6 rounded-full border border-line transition hover:scale-110"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Pick a background + accent for your profile page, with presets and a live
 *  preview. Saves both to the profile; visitors then see your page in your
 *  colors (scoped to the profile page — the app shell keeps their theme). */
export function ProfileColorsModal({ onClose }: { onClose: () => void }) {
  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  const bg = useStore((s) => s.bg);
  const accent = useStore((s) => s.accent);
  const displayName = useStore((s) => s.displayName);
  const avatarUrl = useStore((s) => s.avatarUrl);
  const bannerUrl = useStore((s) => s.bannerUrl);
  const setProfileColors = useStore((s) => s.setProfileColors);

  // Drafts are normalized 6-digit hexes (the native picker needs #rrggbb), so a
  // legacy curated id or 3-digit accent is resolved up front.
  const [draftBg, setDraftBg] = useState<string | null>(normalizeHex(bg));
  const [draftAccent, setDraftAccent] = useState<string | null>(
    normalizeHex(resolveAccent(accent))
  );

  const preset = matchPreset(draftBg, draftAccent);
  const dirty =
    draftBg !== normalizeHex(bg) || draftAccent !== normalizeHex(resolveAccent(accent));
  const name = displayName ?? "You";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <Palette size={18} className="text-accent" /> Profile colors
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted transition hover:bg-panel hover:text-ink"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 sm:grid-cols-2">
          {/* ── Controls ──────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-subtle">Preset colors</span>
              <select
                value={preset?.id ?? "custom"}
                onChange={(e) => {
                  const p = PROFILE_PRESETS.find((x) => x.id === e.target.value);
                  if (!p) return;
                  setDraftBg(normalizeHex(p.bg));
                  setDraftAccent(normalizeHex(p.accent));
                }}
                className="w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
              >
                {!preset && (
                  <option value="custom" disabled>
                    Custom
                  </option>
                )}
                {PROFILE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <ColorField
              label="Background color"
              value={draftBg}
              themeVar="--canvas"
              themeFallback="#131a2b"
              onChange={setDraftBg}
            />
            <ColorField
              label="Accent color"
              value={draftAccent}
              themeVar="--accent"
              themeFallback="#e56a52"
              onChange={setDraftAccent}
            />

            <p className="text-xs text-subtle">
              Classic keeps each visitor&rsquo;s own theme. Anything else paints your profile
              page in your colors for everyone who drops by.
            </p>

            {bannerUrl && (
              <BannerColorMatcher
                url={bannerUrl}
                onPick={(hex, target) =>
                  target === "bg" ? setDraftBg(hex) : setDraftAccent(hex)
                }
                onMatch={(matchedBg, matchedAccent) => {
                  setDraftBg(matchedBg);
                  setDraftAccent(matchedAccent);
                }}
              />
            )}
          </div>

          {/* ── Live preview ──────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-subtle">Preview</span>
            <div
              data-testid="colors-preview"
              style={profileColorVars(draftBg, draftAccent)}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar url={avatarUrl} name={name} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{name}</p>
                  <p className="text-xs text-muted">Your profile, in your colors</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg"
                >
                  Preview
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-accent px-3 py-1.5 text-sm text-accent"
                >
                  Buttons
                </button>
              </div>
              <div className="rounded-xl border border-line bg-surface p-3">
                <p className="text-xs font-medium text-subtle">Backlog Breakdown</p>
                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">
                  <span className="bg-subtle/60" style={{ width: "45%" }} />
                  <span className="bg-accent" style={{ width: "20%" }} />
                  <span className="bg-success" style={{ width: "25%" }} />
                  <span className="bg-brand" style={{ width: "10%" }} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  Backlog · Playing · Beaten · Completed
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line p-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              void setProfileColors(draftBg, draftAccent);
              onClose();
            }}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check size={14} /> Save colors
          </button>
        </div>
      </div>
    </div>
  );
}
