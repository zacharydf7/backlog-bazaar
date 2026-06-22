import { useEffect, useRef, useState } from "react";
import {
  MoreVertical,
  Trash2,
  Check,
  Trophy,
  Heart,
  Store,
  Gamepad2,
  Clock,
  Pencil,
  Library,
  StickyNote,
  Undo2,
} from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import {
  computePrice,
  computeReward,
  computeShelvePenalty,
  computeTrickle,
  computeEstimatedPayout,
  priceBreakdown,
} from "../lib/pricing";
import { ownedPlatforms, totalCost, hasAnyCost, formatUsd } from "../lib/copies";
import { EditGameModal } from "./EditGameModal";

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}

// Metacritic's own colour bands: green (good), yellow (mixed), red (poor).
function metacriticColor(score: number): string {
  if (score >= 75) return "bg-emerald-600 text-white";
  if (score >= 50) return "bg-yellow-500 text-stone-900";
  return "bg-red-600 text-white";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-subtle">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

export function GameCard({ game }: { game: Game }) {
  const {
    coins,
    buyGame,
    finishGame,
    logPlaytime,
    abandonGame,
    removeGame,
    wishlistToBazaar,
    bazaarToWishlist,
    setProgressNote,
    shelvePenaltyPct,
  } = useStore();
  const [showWhy, setShowWhy] = useState(false);
  const [showSpend, setShowSpend] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [logHours, setLogHours] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [shelving, setShelving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirming(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function closeMenu() {
    setMenuOpen(false);
    setConfirming(false);
  }

  function openEdit() {
    closeMenu();
    setShowEdit(true);
  }

  const price = computePrice(game);
  const reward = computeReward();
  const payout = computeEstimatedPayout(game);
  const shelveFee = computeShelvePenalty(game.pricePaid ?? price, shelvePenaltyPct);
  const canAfford = coins >= price;
  const bd = priceBreakdown(game);
  const played = game.playedHours ?? 0;
  const owned = ownedPlatforms(game.copies);
  const spent = totalCost(game.copies);
  const showSpendBreakdown = hasAnyCost(game.copies);

  function submitLog() {
    const n = Number(logHours);
    if (!(n > 0)) return;
    logPlaytime(game.id, n);
    setLogHours("");
  }

  function startNote() {
    setNoteDraft(game.progressNote ?? "");
    setEditingNote(true);
  }

  function saveNote() {
    setProgressNote(game.id, noteDraft);
    setEditingNote(false);
  }

  return (
    <>
      {showEdit && <EditGameModal game={game} onClose={() => setShowEdit(false)} />}
      <div className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className="relative h-36 cursor-pointer bg-panel"
        role="button"
        tabIndex={0}
        title={`Edit ${game.title}`}
        onClick={openEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openEdit();
          }
        }}
      >
        {game.image ? (
          <img src={game.image} alt={game.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl opacity-60">🎮</div>
        )}
        {game.metacritic != null && (
          <span
            title="Metacritic score"
            className={
              "absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-xs font-bold shadow " +
              metacriticColor(game.metacritic)
            }
          >
            {game.metacritic}
          </span>
        )}
        <div
          className="absolute right-2 top-2"
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setMenuOpen((o) => !o);
              setConfirming(false);
            }}
            title="More options"
            aria-label="More options"
            className={
              "grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white/80 transition hover:bg-black/70 hover:text-white " +
              (menuOpen
                ? "opacity-100"
                : "opacity-100 hover-device:opacity-0 hover-device:group-hover:opacity-100")
            }
          >
            <MoreVertical size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-surface p-1 text-left shadow-2xl">
              {confirming ? (
                <div className="p-2">
                  <p className="px-1 pb-2 text-xs text-muted">
                    Remove <span className="font-medium text-ink">{game.title}</span> from your
                    Bazaar?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        removeGame(game.id);
                        closeMenu();
                      }}
                      className="flex-1 rounded-lg bg-danger/15 px-2 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/25"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => setConfirming(false)}
                      className="flex-1 rounded-lg bg-panel px-2 py-1.5 text-xs text-ink transition hover:brightness-95"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {game.status === "backlog" && (
                    <button
                      onClick={() => {
                        bazaarToWishlist(game.id);
                        closeMenu();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                    >
                      <Heart size={15} className="text-accent" /> Move to wishlist
                    </button>
                  )}
                  {game.status === "wishlist" && (
                    <button
                      onClick={() => {
                        wishlistToBazaar(game.id);
                        closeMenu();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                    >
                      <Store size={15} className="text-accent" /> Move to Bazaar
                    </button>
                  )}
                  <button
                    onClick={openEdit}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                  >
                    <Pencil size={15} className="text-accent" /> Edit game
                  </button>
                  <button
                    onClick={() => setConfirming(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted transition hover:bg-panel hover:text-danger"
                  >
                    <Trash2 size={15} /> Remove
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-display text-lg leading-tight text-ink">{game.title}</h3>
          {game.developers && game.developers.length > 0 && (
            <p className="mt-0.5 text-xs text-muted">{game.developers.slice(0, 2).join(", ")}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Released" value={year(game.released)} />
          <Stat label="Length" value={game.hours ? `${game.hours}h` : "—"} />
          <Stat label="Played" value={played ? `${played}h` : "—"} />
        </div>

        {(game.genres.length > 0 || game.esrb) && (
          <div className="flex flex-wrap gap-1">
            {game.genres.slice(0, 3).map((g) => (
              <span key={g} className="rounded-full bg-panel px-2 py-0.5 text-[10px] text-muted">
                {g}
              </span>
            ))}
            {game.esrb && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-subtle">
                {game.esrb}
              </span>
            )}
          </div>
        )}

        {game.platforms && game.platforms.length > 0 && (
          <div
            className="flex items-center gap-1 truncate text-[11px] text-subtle"
            title={game.platforms.join(", ")}
          >
            <Gamepad2 size={12} className="shrink-0" />
            <span className="truncate">{game.platforms.slice(0, 4).join(" · ")}</span>
          </div>
        )}

        {owned.length > 0 && (
          <div
            className="flex items-center gap-1 truncate text-[11px] text-accent"
            title={`Owned on: ${owned.join(", ")}`}
          >
            <Library size={12} className="shrink-0" />
            <span className="truncate">
              Owned on {owned.join(" · ")}
              {owned.length > 1 ? ` (${owned.length})` : ""}
            </span>
          </div>
        )}

        {showSpendBreakdown && (
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setShowSpend((v) => !v)}
              className="self-start text-left text-[11px] text-muted transition hover:text-accent"
            >
              💵 Spent {formatUsd(spent)} {showSpend ? "▲" : "▼"}
            </button>
            {showSpend && (
              <div className="rounded-lg bg-panel p-2 text-[11px] text-muted">
                {(game.copies ?? []).map((c) => (
                  <div key={c.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {c.platform}
                      {c.note ? ` · ${c.note}` : ""}
                    </span>
                    <span className="shrink-0">{c.cost ? formatUsd(c.cost) : "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-auto" />

        {game.status === "backlog" && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowWhy((v) => !v)}
              className="self-start text-left text-xs text-muted transition hover:text-accent"
            >
              🪙 {price} coins {showWhy ? "▲" : "▼"}
            </button>
            {showWhy && (
              <div className="rounded-lg bg-panel p-2 text-[11px] text-muted">
                <div className="flex justify-between">
                  <span>Base</span>
                  <span>{bd.base}</span>
                </div>
                <div className="flex justify-between">
                  <span>Length ({game.hours ?? "?"}h)</span>
                  <span>{bd.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Newness</span>
                  <span>{bd.recency}</span>
                </div>
              </div>
            )}
            <button
              onClick={() => buyGame(game.id)}
              disabled={!canAfford}
              className={
                "rounded-xl px-3 py-2 text-sm font-semibold transition " +
                (canAfford
                  ? "bg-brand text-brand-fg shadow-sm hover:brightness-105 active:brightness-95"
                  : "cursor-not-allowed bg-panel text-subtle")
              }
            >
              {canAfford ? `Buy & Start · 🪙 ${price}` : `Need 🪙 ${price - coins} more`}
            </button>
            <p className="text-center text-[11px] text-subtle">
              Est. earn-back ≈ 🪙 {payout} · varies with hours played
            </p>
          </div>
        )}

        {game.status === "playing" && (
          <div className="flex flex-col gap-2">
            {/* Progress note — a single "where I left off" line, editable inline */}
            {editingNote ? (
              <div className="rounded-lg bg-panel p-2">
                <label className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-subtle">
                  <StickyNote size={12} className="text-accent" /> Current status
                </label>
                <textarea
                  autoFocus
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      saveNote();
                    }
                  }}
                  rows={2}
                  maxLength={280}
                  placeholder="e.g. Chapter 4 — heading to the swamp temple"
                  className="w-full resize-none rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                />
                <div className="mt-1.5 flex justify-end gap-2">
                  <button
                    onClick={() => setEditingNote(false)}
                    className="rounded-md px-2 py-1 text-xs text-muted transition hover:text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveNote}
                    className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-brand-fg transition hover:brightness-105"
                  >
                    <Check size={12} /> Save
                  </button>
                </div>
              </div>
            ) : game.progressNote ? (
              <button
                onClick={startNote}
                title="Edit progress note"
                className="group/note flex w-full items-start gap-1.5 rounded-lg border border-line bg-panel/60 p-2 text-left transition hover:border-brand/40"
              >
                <StickyNote size={13} className="mt-0.5 shrink-0 text-accent" />
                <span className="flex-1 whitespace-pre-wrap break-words text-xs text-ink">
                  {game.progressNote}
                </span>
                <Pencil
                  size={12}
                  className="mt-0.5 shrink-0 text-subtle opacity-0 transition group-hover/note:opacity-100"
                />
              </button>
            ) : (
              <button
                onClick={startNote}
                className="inline-flex items-center gap-1.5 self-start text-xs text-muted transition hover:text-accent"
              >
                <StickyNote size={13} /> Add a progress note
              </button>
            )}

            <div className="rounded-lg bg-panel p-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} className="text-accent" /> {played}h played
                </span>
                <span className="text-subtle">🪙 {computeTrickle(1)}/h</span>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={logHours}
                  onChange={(e) => setLogHours(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitLog();
                    }
                  }}
                  placeholder="Add hours"
                  aria-label={`Log play time for ${game.title}`}
                  className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                />
                <button
                  onClick={submitLog}
                  disabled={!(Number(logHours) > 0)}
                  className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Log
                </button>
              </div>
            </div>
            <div className="text-xs">
              <span className="font-medium text-success">Est. payout ≈ 🪙 {payout}</span>
              <span className="text-subtle">
                {" "}
                — 🪙 {reward} on finish + 🪙 {computeTrickle(1)}/h played. Final varies with hours
                you log.
              </span>
            </div>
            <button
              onClick={() => finishGame(game.id)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95"
            >
              <Check size={15} /> Mark Finished + 🪙
            </button>
            {shelving ? (
              <div className="rounded-xl border border-line bg-panel p-2.5 text-xs">
                <p className="text-muted">
                  Shelve <span className="font-medium text-ink">{game.title}</span> back into the
                  Bazaar?{" "}
                  {shelveFee > 0 ? (
                    <>
                      A restocking fee of{" "}
                      <span className="font-semibold text-danger">🪙 {shelveFee}</span> (
                      {shelvePenaltyPct}% of what you paid) goes to the Bazaar.
                    </>
                  ) : (
                    <>No restocking fee right now.</>
                  )}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      abandonGame(game.id);
                      setShelving(false);
                    }}
                    className="flex-1 rounded-lg bg-danger px-2 py-1.5 font-semibold text-white transition hover:brightness-105 active:brightness-95"
                  >
                    {shelveFee > 0 ? `Shelve · −🪙 ${shelveFee}` : "Shelve it"}
                  </button>
                  <button
                    onClick={() => setShelving(false)}
                    className="flex-1 rounded-lg border border-line px-2 py-1.5 text-muted transition hover:bg-surface hover:text-ink"
                  >
                    Keep playing
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShelving(true)}
                className="inline-flex items-center justify-center gap-1.5 text-xs text-subtle transition hover:text-ink"
              >
                <Undo2 size={13} /> Shelve it
                {shelveFee > 0 ? ` · −🪙 ${shelveFee}` : ""}
              </button>
            )}
          </div>
        )}

        {game.status === "finished" && (
          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-success/15 px-3 py-2 text-center text-sm font-medium text-success">
            <Trophy size={15} /> Finished{played ? ` · ${played}h played` : ""}
          </div>
        )}

        {game.status === "wishlist" && (
          <div className="flex flex-col gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Heart size={13} /> On your wishlist
            </span>
            <button
              onClick={() => wishlistToBazaar(game.id)}
              title="Move into your Bazaar (becomes buyable with coins)"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
            >
              <Store size={15} /> Move to Bazaar
            </button>
          </div>
        )}
        </div>
      </div>
    </>
  );
}
