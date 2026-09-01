import { useId } from "react";
import { CloudOff, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { AcquisitionType, CopyFormat, GameCopy } from "../types";
import { newCopyId, ACQUISITIONS, isModifierAcquisition } from "../lib/copies";
import { parseAmount } from "../lib/mathInput";
import { useStore } from "../store";

/** A copy being edited in a form (cost kept as a string; format "" = unset;
 *  acquisition "owned" is the default; lapsedAt "" = access intact). */
export interface CopyRowDraft {
  id: string;
  platform: string;
  format: "" | CopyFormat;
  acquisition: AcquisitionType;
  provider: string;
  cost: string;
  note: string;
  lapsedAt: string;
}

export function emptyCopyRow(platform = ""): CopyRowDraft {
  return {
    id: newCopyId(),
    platform,
    format: "",
    acquisition: "owned",
    provider: "",
    cost: "",
    note: "",
    lapsedAt: "",
  };
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
    lapsedAt: c.lapsedAt ?? "",
  };
}

/** Turn form rows back into stored copies, dropping rows with no platform. A
 *  provider — and the access-lost marker — is kept only for a modifier copy
 *  (an owned copy can't lapse and needs no service), and a plain "owned"
 *  acquisition stays implicit (undefined). A Player 2 copy is someone else's —
 *  any cost is dropped so it can never inflate the library's spend metrics
 *  (issue 3eb956ff; the server mirrors all of this in normalize_copies). */
export function rowsToCopies(rows: CopyRowDraft[]): GameCopy[] {
  return rows
    .filter((r) => r.platform.trim())
    .map((r) => {
      const cost = parseAmount(r.cost);
      const modifier = isModifierAcquisition(r.acquisition);
      const costless = r.acquisition === "player2";
      return {
        id: r.id,
        platform: r.platform.trim(),
        format: r.format || undefined,
        acquisition: modifier ? r.acquisition : undefined,
        provider: modifier && r.provider.trim() ? r.provider.trim() : undefined,
        cost: !costless && cost != null && cost >= 0 ? cost : undefined,
        note: r.note.trim() || undefined,
        lapsedAt: modifier && r.lapsedAt ? r.lapsedAt : undefined,
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
  allowLapse = false,
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
  /** Offer the "I lost access" toggle on modifier copies — the game left the
   *  service, the loan went back, the seat closed. Only for copies already in
   *  the library (the game page), never at add time or on wishlist versions. */
  allowLapse?: boolean;
  /** When set, every platform dropdown ends with a "Missing platform? Choose
   *  from all platforms…" option (issue 9aacac99). Picking it calls this —
   *  the caller widens platformOptions to the full master list — and leaves
   *  the row's platform unchanged. Pass only while the choices are actually
   *  restricted to a verified release list. */
  onShowAllPlatforms?: () => void;
}) {
  // Subscription-service suggestions for the provider field (admin-curated,
  // suggestion-only — any free-text value still saves, so legacy providers and
  // off-list services keep working). One shared datalist per mounted editor.
  const serviceList = useStore((s) => s.serviceList);
  const servicesDlId = useId();

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
            {/* A Player 2 copy is someone else's — it never carries a cost
                (issue 3eb956ff), so the field disappears (rowsToCopies drops
                any previously-typed amount on save too). */}
            {showCost && r.acquisition !== "player2" && (
              <div className="relative w-24 shrink-0">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-subtle">
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={r.cost}
                  onChange={(e) => update(r.id, { cost: e.target.value })}
                  placeholder="Cost"
                  aria-label="Cost"
                  title="Math works here — try 59.99+8.25%"
                  className="w-full rounded-lg border border-line bg-surface py-1.5 pl-5 pr-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                />
              </div>
            )}
            {/* How you have it: owned (default), a subscription, borrowed, or a
                Player 2 seat on someone else's copy. Each option carries its
                explanation as a native tooltip. */}
            <select
              value={r.acquisition}
              onChange={(e) =>
                update(r.id, { acquisition: e.target.value as AcquisitionType })
              }
              aria-label="Acquisition"
              title={ACQUISITIONS.find((a) => a.value === r.acquisition)?.blurb}
              className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
            >
              {ACQUISITIONS.map((a) => (
                <option key={a.value} value={a.value} title={a.blurb}>
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
          {/* A subscription/borrowed/Player 2 copy names its service, lender,
              or whose copy the seat is on. A subscription copy gets the curated
              service suggestions (datalist); borrowed/Player 2 providers are
              people, so those stay plain free text. */}
          {isModifierAcquisition(r.acquisition) && (
            <input
              value={r.provider}
              onChange={(e) => update(r.id, { provider: e.target.value })}
              list={r.acquisition === "subscription" ? servicesDlId : undefined}
              placeholder={
                r.acquisition === "subscription"
                  ? "Service (e.g. Game Pass Ultimate, PS Plus)"
                  : r.acquisition === "player2"
                    ? "Whose copy? (e.g. Sam's — couch co-op, screen share)"
                    : "Lender (e.g. borrowed from Sam, library)"
              }
              aria-label="Provider"
              className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          )}
          {/* Access lost / regained (modifier copies only): the game left the
              service, the loan went back, the seat closed. One tap each way —
              nothing is deleted, and playtime/history stay put. With every
              base copy lapsed the game locks from starting (ACCESS_LOST). */}
          {allowLapse && isModifierAcquisition(r.acquisition) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {r.lapsedAt ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-danger/40 bg-panel px-1.5 py-0.5 text-[10px] font-medium text-danger">
                    <CloudOff size={11} className="shrink-0" />
                    Access lost{" "}
                    {new Date(r.lapsedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => update(r.id, { lapsedAt: "" })}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink transition hover:border-brand/50"
                  >
                    <RotateCcw size={11} /> I can play it again
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => update(r.id, { lapsedAt: new Date().toISOString() })}
                  title={
                    r.acquisition === "subscription"
                      ? "It left the service (or you cancelled) — mark this copy unplayable. One tap to undo."
                      : r.acquisition === "borrowed"
                        ? "You returned it — mark this copy unplayable. One tap to undo."
                        : "The seat closed — mark this copy unplayable. One tap to undo."
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-muted transition hover:border-danger/50 hover:text-danger"
                >
                  <CloudOff size={11} /> I lost access
                </button>
              )}
            </div>
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

      {/* Shared service suggestions for every subscription row's provider input. */}
      <datalist id={servicesDlId}>
        {serviceList.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
