// The game page's DLC list: story expansions, new content and purchases
// recorded on any instance in the hub, with what was spent, and the form to
// add or edit one. Old 'dlc' copies (the copy format this replaced) are
// listed here to turn into DLC records. See src/lib/dlc.ts.
import { useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Package, Pencil, Plus, Search, Sparkles, Trash2, Undo2 } from "lucide-react";
import type { Game, GameCopy } from "../../types";
import { useStore } from "../../store";
import {
  DLC_KINDS,
  defaultDlcKind,
  dlcKindLabel,
  dlcSpend,
  expansionFormulas,
  expansionQuote,
  type DlcKind,
  type GameDlc,
} from "../../lib/dlc";
import { formatUsd, isModifierAcquisition } from "../../lib/copies";
import { fetchHltbTimes } from "../../lib/gamedata";
import { formatPlaytime } from "../../lib/playtime";
import { hubRepresentative } from "../../lib/gameHub";
import { todayISO } from "../../lib/milestones";
import { useScrollLock } from "../../lib/useScrollLock";
import { CoinIcon } from "../CoinIcon";

const KIND_ICON: Record<DlcKind, typeof BookOpen> = { expansion: BookOpen, update: Sparkles, item: Package };

/** An expansion marked as played before it was tracked here
 *  (mark_expansion_played): cleared without ever running. */
function markedPlayed(d: GameDlc): boolean {
  return d.kind === "expansion" && d.runStatus === "cleared" && d.runStartedAt == null;
}

function runLabel(d: GameDlc): string | null {
  if (d.kind !== "expansion") return null;
  if (d.runStatus === "playing") return "Playing now";
  if (d.runStatus === "cleared" && markedPlayed(d)) return "Played before";
  if (d.runStatus === "cleared") return d.runReward ? `Cleared · +${d.runReward}` : "Cleared";
  return "In your Bazaar";
}

/** An old 'dlc' copy on one of the hub's games, waiting to become a record. */
type OldDlcCopy = { gameId: string; copy: GameCopy };

/** A DLC record can't hold a subscription, loan or Player 2 copy, or a member
 *  discount, so those stay copies (convert_dlc_copy refuses them). */
function convertible(copy: GameCopy): boolean {
  return !isModifierAcquisition(copy.acquisition) && !(copy.memberSavings && copy.memberSavings > 0);
}

export function DlcBlock({ hub }: { hub: Game[] }) {
  const all = useStore((s) => s.gameDlc);
  const removeGameDlc = useStore((s) => s.removeGameDlc);
  const markExpansionPlayed = useStore((s) => s.markExpansionPlayed);
  const [editing, setEditing] = useState<GameDlc | "new" | OldDlcCopy | null>(null);

  const ids = new Set(hub.map((g) => g.id));
  const list = all.filter((d) => d.gameId != null && ids.has(d.gameId));
  const spent = dlcSpend(list);
  const oldCopies: OldDlcCopy[] = hub.flatMap((g) =>
    (g.copies ?? []).filter((c) => c.format === "dlc").map((copy) => ({ gameId: g.id, copy })),
  );

  return (
    <section className="rounded-xl border border-line bg-panel/30 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-0.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent">
            <Package size={13} /> DLC
          </div>
          <p className="text-xs text-muted">
            {list.length === 0
              ? "Expansions, new content and purchases for this game."
              : spent > 0
                ? `${list.length} recorded · ${formatUsd(spent)} spent`
                : `${list.length} recorded`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink transition hover:border-brand/40 hover:text-accent"
        >
          <Plus size={14} className="text-accent" /> Add DLC
        </button>
      </div>
      {list.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {list.map((d) => {
            const Icon = KIND_ICON[d.kind];
            const status = runLabel(d);
            return (
              <li key={d.id} className="flex items-center gap-2 py-1.5">
                <Icon size={14} className="shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{d.name}</div>
                  <div className="flex flex-wrap gap-x-2 text-[11px] text-subtle">
                    <span>{dlcKindLabel(d.kind)}</span>
                    {d.acquiredOn && <span>{d.acquiredOn}</span>}
                    {d.cost != null && <span>{formatUsd(d.cost)}</span>}
                    {d.hours != null && <span>{formatPlaytime(d.hours)} long</span>}
                    {status && <span className="text-success">{status}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(d)}
                  aria-label={`Edit ${d.name}`}
                  className="rounded-md p-1.5 text-subtle transition hover:bg-panel hover:text-ink"
                >
                  <Pencil size={14} />
                </button>
                {markedPlayed(d) && (
                  <button
                    type="button"
                    onClick={() => void markExpansionPlayed(d.id, false)}
                    title={`Put ${d.name} back in your Bazaar, unplayed`}
                    aria-label={`Mark ${d.name} unplayed`}
                    className="rounded-md p-1.5 text-subtle transition hover:bg-panel hover:text-ink"
                  >
                    <Undo2 size={14} />
                  </button>
                )}
                {d.runStatus !== "playing" && (
                  <button
                    type="button"
                    onClick={() => void removeGameDlc(d.id)}
                    aria-label={`Remove ${d.name}`}
                    className="rounded-md p-1.5 text-subtle transition hover:bg-panel hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {oldCopies.length > 0 && (
        <div className="mt-2 rounded-lg border border-dashed border-line px-2.5 py-2">
          <p className="text-[11px] text-muted">
            Recorded as a DLC copy before DLC had its own place. Make each a DLC record to keep it with the game's
            DLC (its cost stays in what you spent).
          </p>
          <ul className="mt-1 flex flex-col divide-y divide-line">
            {oldCopies.map((o) => (
              <li key={o.copy.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {o.copy.note || o.copy.platform || "DLC"}
                  {o.copy.cost != null && <span className="text-[11px] text-subtle"> · {formatUsd(o.copy.cost)}</span>}
                </span>
                {convertible(o.copy) ? (
                  <button
                    type="button"
                    onClick={() => setEditing(o)}
                    className="shrink-0 rounded-lg border border-line bg-panel px-2 py-1 text-xs text-ink transition hover:border-brand/40 hover:text-accent"
                  >
                    Make it a DLC record
                  </button>
                ) : (
                  <span className="text-[11px] text-subtle">
                    Has a subscription, loan or member discount, so it stays a copy for now
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {editing && (
        <DlcFormModal
          hub={hub}
          dlc={editing === "new" || "copy" in editing ? null : editing}
          fromCopy={editing !== "new" && "copy" in editing ? editing : null}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function DlcFormModal({
  hub,
  dlc,
  fromCopy,
  onClose,
}: {
  hub: Game[];
  dlc: GameDlc | null;
  /** Converting an old DLC copy: the form starts from its details. */
  fromCopy: OldDlcCopy | null;
  onClose: () => void;
}) {
  useScrollLock(true);
  const saveGameDlc = useStore((s) => s.saveGameDlc);
  const convertDlcCopy = useStore((s) => s.convertDlcCopy);
  const economy = useStore((s) => s.economy);
  const cfg = useStore((s) => s.expansionConfig);
  const gatePct = useStore((s) => s.bountyGatePct);
  const economyEnabled = useStore((s) => s.economyEnabled);
  const rep = hubRepresentative(hub);
  const [gameId, setGameId] = useState(dlc?.gameId ?? fromCopy?.gameId ?? rep.id);
  const game = hub.find((g) => g.id === gameId) ?? rep;
  const [kind, setKind] = useState<DlcKind>(dlc?.kind ?? defaultDlcKind(game));
  const [name, setName] = useState(dlc?.name ?? fromCopy?.copy.note ?? "");
  // A converted copy without its own date takes the base game's Added date, so
  // an old purchase never prices as freshly picked up.
  const copyGame = fromCopy ? hub.find((g) => g.id === fromCopy.gameId) : undefined;
  const [acquiredOn, setAcquiredOn] = useState(
    dlc?.acquiredOn ??
      fromCopy?.copy.acquiredAt?.slice(0, 10) ??
      (copyGame?.addedAt ? todayISO(new Date(copyGame.addedAt)) : todayISO()),
  );
  const startCost = dlc?.cost ?? fromCopy?.copy.cost;
  const [cost, setCost] = useState(startCost != null ? String(startCost) : "");
  const [hours, setHours] = useState(dlc?.hours != null ? String(dlc.hours) : "");
  const [note, setNote] = useState(dlc?.note ?? "");
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const locked = dlc != null && dlc.runStatus !== "owned" && !markedPlayed(dlc);

  const costNum = cost.trim() === "" ? null : Number(cost);
  const hoursNum = hours.trim() === "" ? null : Number(hours);
  const valid =
    name.trim().length > 0 &&
    (costNum == null || (Number.isFinite(costNum) && costNum >= 0)) &&
    (kind !== "expansion" || hoursNum == null || (Number.isFinite(hoursNum) && hoursNum > 0 && hoursNum <= 500));
  const quote =
    kind === "expansion"
      ? expansionQuote(
          { name, hours: hoursNum, cost: costNum, acquiredOn, createdAt: Date.now() },
          expansionFormulas(economy, cfg),
          cfg.minHours,
          gatePct,
        )
      : null;

  async function lookUpLength() {
    if (!name.trim()) return;
    setLookingUp(true);
    const times = await fetchHltbTimes(`${game.title} ${name.trim()}`);
    setLookingUp(false);
    if (times?.main) setHours(String(times.main));
  }

  async function save() {
    setSaving(true);
    const details = {
      gameId,
      kind,
      name: name.trim(),
      acquiredOn: acquiredOn || null,
      cost: costNum,
      hours: kind === "expansion" ? hoursNum : null,
      note: note.trim() || null,
    };
    const ok = fromCopy
      ? await convertDlcCopy(fromCopy.copy.id, details)
      : await saveGameDlc({ id: dlc?.id, ...details });
    setSaving(false);
    if (ok) onClose();
  }

  const field = "w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-sm text-ink outline-none transition focus:border-brand";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-line bg-surface p-4 shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-subtle">
          <Package size={15} className="text-accent" /> {dlc ? "Edit DLC" : "Add DLC"}
        </div>

        <fieldset className="mb-3 flex flex-col gap-1.5" disabled={locked}>
          <legend className="mb-1 text-xs text-muted">What is it?</legend>
          {DLC_KINDS.map((k) => {
            const Icon = KIND_ICON[k.kind];
            return (
              <label
                key={k.kind}
                className={
                  "flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 transition " +
                  (kind === k.kind ? "border-brand bg-brand/10" : "border-line hover:border-brand/40")
                }
              >
                <input
                  type="radio"
                  name="dlc-kind"
                  value={k.kind}
                  checked={kind === k.kind}
                  onChange={() => setKind(k.kind)}
                  className="sr-only"
                />
                <Icon size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="block text-sm font-medium text-ink">{k.label}</span>
                  <span className="block text-xs text-muted">{k.hint}</span>
                </span>
              </label>
            );
          })}
          {locked && <p className="text-[11px] text-subtle">You&apos;ve started this expansion, so its kind and length stay.</p>}
        </fieldset>

        {hub.length > 1 && !dlc && !fromCopy && (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-muted">Which copy</span>
            <select value={gameId} onChange={(e) => setGameId(e.target.value)} className={field}>
              {hub.map((g) => (
                <option key={g.id} value={g.id}>
                  {(g.copies ?? []).map((c) => c.platform).join(", ") || g.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder={kind === "expansion" ? "e.g. Legends" : kind === "update" ? "e.g. Into the Emerald Dream" : "e.g. 2,500 Moonstones"}
            className={field}
          />
        </label>

        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{kind === "update" ? "Arrived" : "Bought"}</span>
            <input type="date" value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Cost (USD, optional)</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className={field}
            />
          </label>
        </div>

        {kind === "expansion" && (
          <div className="mb-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Length (hours)</span>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.5"
                  value={hours}
                  disabled={locked}
                  onChange={(e) => setHours(e.target.value)}
                  className={field}
                />
                <button
                  type="button"
                  onClick={() => void lookUpLength()}
                  disabled={locked || lookingUp || !name.trim()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-sm text-ink transition hover:border-brand/40 hover:text-accent disabled:opacity-50"
                >
                  <Search size={14} /> {lookingUp ? "Looking…" : "Look up"}
                </button>
              </div>
            </label>
            {economyEnabled && quote && (
              <p className="mt-1.5 text-xs text-muted">
                {quote.paying ? (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    Costs <CoinIcon size={12} /> {quote.price} to start · pays <CoinIcon size={12} /> {quote.bounty} after{" "}
                    {formatPlaytime(quote.gateHours)} logged
                  </span>
                ) : (
                  `Under ${formatPlaytime(cfg.minHours)}, it's tracked without coins.`
                )}
              </p>
            )}
          </div>
        )}

        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-muted">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={field} />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!valid || saving}
            className="flex-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
          >
            {saving ? "Saving…" : dlc ? "Save" : fromCopy ? "Save as DLC" : "Add DLC"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-line px-3 py-2 text-sm text-muted transition hover:bg-panel hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
