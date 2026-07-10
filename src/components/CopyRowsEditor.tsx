import { Plus, Trash2 } from "lucide-react";
import type { AcquisitionType, CopyFormat, GameCopy } from "../types";
import { newCopyId, ACQUISITIONS, isModifierAcquisition } from "../lib/copies";

/** A copy being edited in a form (cost kept as a string; format "" = unset;
 *  acquisition "owned" is the default). */
export interface CopyRowDraft {
  id: string;
  platform: string;
  format: "" | CopyFormat;
  acquisition: AcquisitionType;
  provider: string;
  cost: string;
  note: string;
}

export function emptyCopyRow(platform = ""): CopyRowDraft {
  return { id: newCopyId(), platform, format: "", acquisition: "owned", provider: "", cost: "", note: "" };
}

export function copyToRow(c: GameCopy): CopyRowDraft {
  return {
    id: c.id,
    platform: c.platform,
    format: c.format ?? "",
    acquisition: c.acquisition ?? "owned",
    provider: c.provider ?? "",
    cost: c.cost != null ? String(c.cost) : "",
    note: c.note ?? "",
  };
}

/** Turn form rows back into stored copies, dropping rows with no platform. A
 *  provider is kept only for a subscription/borrowed copy (it's meaningless for
 *  an owned one), and a plain "owned" acquisition stays implicit (undefined). */
export function rowsToCopies(rows: CopyRowDraft[]): GameCopy[] {
  return rows
    .filter((r) => r.platform.trim())
    .map((r) => {
      const cost = Number(r.cost);
      const modifier = isModifierAcquisition(r.acquisition);
      return {
        id: r.id,
        platform: r.platform.trim(),
        format: r.format || undefined,
        acquisition: modifier ? r.acquisition : undefined,
        provider: modifier && r.provider.trim() ? r.provider.trim() : undefined,
        cost: r.cost.trim() && Number.isFinite(cost) && cost >= 0 ? cost : undefined,
        note: r.note.trim() || undefined,
      };
    });
}

const FORMATS: { value: CopyFormat; label: string }[] = [
  { value: "physical", label: "Physical" },
  { value: "digital", label: "Digital" },
  { value: "dlc", label: "DLC" },
];

/** Sentinel option value for the in-dropdown "Missing platform?" escape hatch —
 *  never a real platform name, so picking it can't be mistaken for a choice. */
export const SHOW_ALL_PLATFORMS = "__show-all-platforms__";

/** Editable list of the copies you own for a game: platform (with suggestions),
 *  an optional Physical/Digital/DLC toggle, cost, and note. Add as many as you
 *  like, including multiple copies on the same platform (e.g. physical +
 *  digital, or the base game plus a DLC purchase). */
export function CopyRowsEditor({
  rows,
  onChange,
  platformOptions,
  showCost = true,
  addLabel = "Add a copy",
  onShowAllPlatforms,
}: {
  rows: CopyRowDraft[];
  onChange: (rows: CopyRowDraft[]) => void;
  /** The controlled master list of platform names — the only allowed choices. */
  platformOptions: string[];
  /** Hide the per-copy cost field — used for wishlist "versions you want",
   *  which you don't own yet so there's no real-world spend to record. */
  showCost?: boolean;
  addLabel?: string;
  /** When set, every platform dropdown ends with a "Missing platform? Choose
   *  from all platforms…" option (issue 9aacac99). Picking it calls this —
   *  the caller widens platformOptions to the full master list — and leaves
   *  the row's platform unchanged. Pass only while the choices are actually
   *  restricted to a verified release list. */
  onShowAllPlatforms?: () => void;
}) {
  function update(id: string, patch: Partial<CopyRowDraft>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }
  function add() {
    onChange([...rows, emptyCopyRow()]);
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        // Platforms come from the controlled master list (passed as platformOptions);
        // free text is no longer allowed. Keep any legacy value selectable so an
        // existing copy never loses its platform just because it's off the list.
        const options =
          r.platform && !platformOptions.some((p) => p.toLowerCase() === r.platform.toLowerCase())
            ? [r.platform, ...platformOptions]
            : platformOptions;
        return (
        <div key={r.id} className="rounded-xl border border-line bg-panel/50 p-2">
          <div className="flex items-center gap-2">
            <select
              value={r.platform}
              onChange={(e) => {
                // The escape-hatch option widens the list; it is never a pick.
                if (e.target.value === SHOW_ALL_PLATFORMS) onShowAllPlatforms?.();
                else update(r.id, { platform: e.target.value });
              }}
              aria-label="Platform"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
            >
              <option value="">Select a platform…</option>
              {options.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              {onShowAllPlatforms && (
                <option value={SHOW_ALL_PLATFORMS}>
                  Missing platform? Choose from all platforms…
                </option>
              )}
            </select>
            <button
              type="button"
              onClick={() => remove(r.id)}
              aria-label="Remove copy"
              className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-danger"
            >
              <Trash2 size={15} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Physical / Digital — optional; click the active one to clear it. */}
            <div className="inline-flex overflow-hidden rounded-lg border border-line">
              {FORMATS.map((f) => {
                const active = r.format === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => update(r.id, { format: active ? "" : f.value })}
                    className={
                      "px-2.5 py-1.5 text-xs font-medium transition " +
                      (active ? "bg-brand text-brand-fg" : "bg-surface text-muted hover:text-ink")
                    }
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            {showCost && (
              <div className="relative w-24 shrink-0">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-subtle">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={r.cost}
                  onChange={(e) => update(r.id, { cost: e.target.value })}
                  placeholder="Cost"
                  aria-label="Cost"
                  className="w-full rounded-lg border border-line bg-surface py-1.5 pl-5 pr-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                />
              </div>
            )}
            {/* How you have it: owned (default), a subscription, or borrowed. */}
            <select
              value={r.acquisition}
              onChange={(e) =>
                update(r.id, { acquisition: e.target.value as AcquisitionType })
              }
              aria-label="Acquisition"
              className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
            >
              {ACQUISITIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <input
              value={r.note}
              onChange={(e) => update(r.id, { note: e.target.value })}
              placeholder="Note (e.g. launch, sale)"
              aria-label="Note"
              className="min-w-0 flex-1 basis-32 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          </div>
          {/* A subscription/borrowed copy names its service or lender. */}
          {isModifierAcquisition(r.acquisition) && (
            <input
              value={r.provider}
              onChange={(e) => update(r.id, { provider: e.target.value })}
              placeholder={
                r.acquisition === "subscription"
                  ? "Service (e.g. Game Pass Ultimate, PS Plus)"
                  : "Lender (e.g. borrowed from Sam, library)"
              }
              aria-label="Provider"
              className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          )}
        </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 self-start rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-ink transition hover:border-brand/50"
      >
        <Plus size={15} className="text-accent" /> {addLabel}
      </button>
    </div>
  );
}
