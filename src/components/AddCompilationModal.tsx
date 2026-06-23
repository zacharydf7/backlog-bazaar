import { useMemo, useState } from "react";
import { X, Plus, Trash2, Package, Store, Heart, Trophy, Scale, type LucideIcon } from "lucide-react";
import type { Compilation, CopyFormat, GameMeta } from "../types";
import { useStore } from "../store";
import { ownedPlatformLabels } from "../lib/platforms";
import { parsePlaytime, formatLength } from "../lib/playtime";
import { fetchHltbTimes } from "../lib/gamedata";
import { formatUsd, newCopyId, totalCost } from "../lib/copies";
import {
  toCents,
  fromCents,
  splitEvenly,
  splitByLength,
  sharesMatchTotal,
  type CompilationChildDraft,
} from "../lib/compilations";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { toast } from "../lib/toast";
import { GameSearchBox } from "./GameSearchBox";
import { type AddDestination, destinationNoun } from "./AddGameModal";

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

const rowInputClass =
  "w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

const DESTINATIONS: { value: AddDestination; label: string; icon: LucideIcon }[] = [
  { value: "backlog", label: "Bazaar", icon: Store },
  { value: "wishlist", label: "Wishlist", icon: Heart },
  { value: "finished", label: "Finished", icon: Trophy },
];

const FORMATS: { value: CopyFormat; label: string }[] = [
  { value: "physical", label: "Physical" },
  { value: "digital", label: "Digital" },
];

/** The catalog metadata a picked search result carries onto a child's card. */
type PickedMeta = Partial<
  Pick<
    GameMeta,
    | "rawgId"
    | "image"
    | "released"
    | "genres"
    | "metacritic"
    | "platforms"
    | "developers"
    | "esrb"
    | "catalogId"
  >
>;

/** One row in the batch game list: name, optional length, manually-assigned cost
 *  (when editing the breakdown), and any metadata from a picked search result.
 *  `gameId` links the row to an existing child game when editing. */
interface ChildRow {
  id: string;
  gameId?: string;
  name: string;
  length: string;
  cost: string;
  meta: PickedMeta;
}

function emptyRow(): ChildRow {
  return { id: newCopyId(), name: "", length: "", cost: "", meta: {} };
}

function pickedToMeta(m: GameMeta): PickedMeta {
  return {
    rawgId: m.rawgId,
    image: m.image,
    released: m.released,
    genres: m.genres,
    metacritic: m.metacritic,
    platforms: m.platforms,
    developers: m.developers,
    esrb: m.esrb,
    catalogId: m.catalogId,
  };
}

/** Create or edit a Game Compilation: a single purchase (e.g. a remaster
 *  collection) bundling several distinct games. The window is the financial
 *  container — title, total cost, platform, format — and each listed game becomes
 *  its own standalone card. The total cost is split across the children (evenly,
 *  by length, or a manual breakdown). Pass `compilation` to edit an existing one;
 *  it pre-fills from the live store and reconciles the games on save. */
export function AddCompilationModal({
  onClose,
  defaultDestination = "backlog",
  compilation,
}: {
  onClose: () => void;
  defaultDestination?: AddDestination;
  compilation?: Compilation;
}) {
  const { addCompilation, editCompilation, games, myPlatforms, customPlatforms } = useStore();
  const platformOptions = ownedPlatformLabels(myPlatforms, customPlatforms);
  const isEdit = compilation != null;

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  // Existing children (edit mode) — read once to seed the form.
  const initialRows = useMemo<ChildRow[]>(() => {
    if (!compilation) return [emptyRow(), emptyRow()];
    const children = games.filter((g) => g.compilationId === compilation.id);
    if (children.length === 0) return [emptyRow()];
    return children.map((g) => ({
      id: newCopyId(),
      gameId: g.id,
      name: g.title,
      length: g.hours ? formatLength(g.hours) : "",
      cost: String(totalCost(g.copies)),
      meta: {},
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [title, setTitle] = useState(compilation?.title ?? "");
  const [total, setTotal] = useState(compilation ? String(compilation.totalCost) : "");
  const [platform, setPlatform] = useState(compilation?.platform ?? "");
  const [format, setFormat] = useState<"" | CopyFormat>(compilation?.format ?? "");
  const [destination, setDestination] = useState<AddDestination>(defaultDestination);
  const [rows, setRows] = useState<ChildRow[]>(initialRows);
  // When on, the per-game cost fields unlock and must sum exactly to the total.
  // Editing starts on it so existing (possibly uneven) costs are shown + preserved.
  const [customSplit, setCustomSplit] = useState(isEdit);

  const totalCents = toCents(Number(total) || 0);
  const named = rows.filter((r) => r.name.trim());

  const evenShares = useMemo(
    () => splitEvenly(totalCents, named.length),
    [totalCents, named.length],
  );
  const evenByRowId = useMemo(() => {
    const map = new Map<string, number>();
    named.forEach((r, i) => map.set(r.id, evenShares[i] ?? 0));
    return map;
  }, [named, evenShares]);

  const assignedCents = customSplit
    ? named.reduce((sum, r) => sum + toCents(Number(r.cost) || 0), 0)
    : totalCents;
  const matches = sharesMatchTotal([assignedCents], totalCents);

  function update(id: string, patch: Partial<ChildRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }
  function removeRow(id: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  }

  function onPick(id: string, meta: GameMeta) {
    update(id, {
      name: meta.title,
      length: meta.hours ? formatLength(meta.hours) : "",
      meta: pickedToMeta(meta),
    });
    // Best-effort: refine the length from HowLongToBeat, like Add Game does.
    fetchHltbTimes(meta.title)
      .then((times) => {
        const best = times?.main ?? times?.mainExtra ?? times?.completionist;
        if (best) update(id, { length: formatLength(best) });
      })
      .catch(() => {});
  }

  function balanceByLength() {
    const lengths = named.map((r) => parsePlaytime(r.length) ?? undefined);
    const shares = splitByLength(totalCents, lengths);
    const byId = new Map<string, number>();
    named.forEach((r, i) => byId.set(r.id, shares[i] ?? 0));
    setRows((rs) =>
      rs.map((r) => (byId.has(r.id) ? { ...r, cost: String(fromCents(byId.get(r.id)!)) } : r)),
    );
    if (!named.some((r) => parsePlaytime(r.length))) {
      toast("Add game lengths to weight the split — using an even split for now", Scale);
    }
  }

  const canSubmit = title.trim() !== "" && named.length > 0 && (!customSplit || matches);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const children: CompilationChildDraft[] = named.map((r, i) => ({
      gameId: r.gameId,
      name: r.name.trim(),
      hours: parsePlaytime(r.length) ?? undefined,
      cost: customSplit ? Number(r.cost) || 0 : fromCents(evenShares[i] ?? 0),
      ...r.meta,
    }));
    const container = {
      title: title.trim(),
      totalCost: Number(total) || 0,
      platform: platform.trim() || undefined,
      format: format || undefined,
    };
    if (compilation) await editCompilation(compilation.id, container, children);
    else await addCompilation(container, children, destination);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8">
      {/* Like the Add Game modal, no backdrop-click-to-close: it holds in-progress
          work, so it only closes via ✕ or Back. */}
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
            <Package size={20} className="text-accent" /> {isEdit ? "Edit compilation" : "Add a compilation"}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 p-4">
          {!isEdit && (
            <p className="text-xs text-muted">
              A compilation is one purchase that bundles several games (e.g. a remaster
              collection). Record what you paid once here; each game below gets its own card,
              with the cost split across them.
            </p>
          )}

          <label className="text-sm text-muted">
            Compilation title
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Super Mario 3D All-Stars"
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm text-muted">
              Total cost
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-line bg-panel py-2 pl-6 pr-3 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                />
              </div>
            </label>
            <label className="text-sm text-muted">
              Platform
              <input
                list="compilation-platforms"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                placeholder="e.g. Nintendo Switch"
                className={inputClass}
              />
              <datalist id="compilation-platforms">
                {platformOptions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <div className="text-sm text-muted">
              Format
              <div className="mt-1 inline-flex w-full overflow-hidden rounded-lg border border-line">
                {FORMATS.map((f) => {
                  const active = format === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFormat(active ? "" : f.value)}
                      className={
                        "flex-1 px-2.5 py-2 text-xs font-medium transition " +
                        (active ? "bg-brand text-brand-fg" : "bg-panel text-muted hover:text-ink")
                      }
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Batch game entry */}
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted">
                Games in this compilation{" "}
                <span className="text-xs text-subtle">— search or type a name</span>
              </span>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={customSplit}
                  onChange={(e) => setCustomSplit(e.target.checked)}
                  className="accent-brand"
                />
                Edit breakdown
              </label>
            </div>

            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl border border-line bg-panel/50 p-2">
                  <div className="flex items-center gap-2">
                    <GameSearchBox
                      value={r.name}
                      onChange={(v) => update(r.id, { name: v })}
                      onPick={(meta) => onPick(r.id, meta)}
                      placeholder="Search a game, or type a name"
                      ariaLabel="Game name"
                      className={rowInputClass}
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(r.id)}
                      aria-label="Remove game"
                      className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={r.length}
                      onChange={(e) => update(r.id, { length: e.target.value })}
                      placeholder="Length (e.g. 12h)"
                      aria-label="Length"
                      className="w-28 shrink-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                    />
                    {customSplit ? (
                      <div className="relative w-28 shrink-0">
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
                          aria-label="Assigned cost"
                          disabled={!r.name.trim()}
                          className="w-full rounded-lg border border-line bg-surface py-1.5 pl-5 pr-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:opacity-50"
                        />
                      </div>
                    ) : (
                      r.name.trim() && (
                        <span className="text-xs text-accent">
                          {formatUsd(fromCents(evenByRowId.get(r.id) ?? 0))}
                          <span className="text-subtle"> (even split)</span>
                        </span>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-ink transition hover:border-brand/50"
              >
                <Plus size={15} className="text-accent" /> Add a game
              </button>
              {customSplit && (
                <button
                  type="button"
                  onClick={balanceByLength}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-ink transition hover:border-brand/50"
                >
                  <Scale size={15} className="text-accent" /> Balance by length
                </button>
              )}
            </div>

            {customSplit && (
              <p className={"text-xs " + (matches ? "text-success" : "text-danger")}>
                Assigned {formatUsd(fromCents(assignedCents))} of {formatUsd(fromCents(totalCents))}
                {matches ? " — balanced ✓" : ` — ${formatUsd(fromCents(Math.abs(totalCents - assignedCents)))} ${assignedCents > totalCents ? "over" : "left"}`}
              </p>
            )}
            {isEdit && (
              <p className="text-xs text-subtle">
                Removing a game here deletes its card when you save.
              </p>
            )}
          </div>

          {/* Where the child cards land — creation only (edit keeps each game's status). */}
          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">Add games to</span>
              <div className="grid grid-cols-3 gap-2">
                {DESTINATIONS.map((d) => {
                  const Icon = d.icon;
                  const active = destination === d.value;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDestination(d.value)}
                      aria-pressed={active}
                      className={
                        "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition " +
                        (active
                          ? "border-brand bg-brand/10 text-ink"
                          : "border-line bg-panel text-muted hover:border-brand/50")
                      }
                    >
                      <Icon size={15} className={active ? "text-accent" : ""} /> {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEdit
              ? "Save changes"
              : `Add ${named.length || ""} game${named.length === 1 ? "" : "s"} to ${destinationNoun(destination)}`}
          </button>
        </form>
      </div>
    </div>
  );
}
