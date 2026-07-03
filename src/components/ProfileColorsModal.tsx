import { useState } from "react";
import { Palette, X, Check } from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { Avatar } from "./Avatar";
import { resolveAccent } from "../lib/accent";
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
