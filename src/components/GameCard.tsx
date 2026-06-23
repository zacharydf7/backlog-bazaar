import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MoreVertical,
  Trash2,
  Heart,
  Store,
  Gamepad2,
  Clock,
  Pencil,
  Library,
  Link2,
  Banknote,
  Trophy,
  Scroll,
} from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { familyMembers, familyStats, isLinked } from "../lib/families";
import { formatPlaytime } from "../lib/playtime";
import {
  ownedPlatformSummary,
  ownershipLabel,
  formatLabel,
  totalCost,
  hasAnyCost,
  formatUsd,
} from "../lib/copies";
import { EditGameModal } from "./EditGameModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { GameActions, ReadOnlyFooter } from "./GameActions";
import { StatusBadge } from "./StatusBadge";
import { useViewing } from "../lib/viewContext";

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

/** A single standalone game's board card. Linked families render as a MasterCard
 *  instead (see App.tsx + MasterCard.tsx); the per-status actions here come from
 *  the shared <GameActions>. */
export function GameCard({ game, showStatus = false }: { game: Game; showStatus?: boolean }) {
  const { games, viewing, bazaarToWishlist, importWithCharter, charters, openCharters, removeGame } =
    useStore();
  const { readOnly, hideSpend } = useViewing();
  // Resolve a linked game's siblings from whichever library is on screen — the
  // visited player's while visiting, otherwise your own. (On the boards a visited
  // family renders as a MasterCard, but the Master Ledger lists each edition as a
  // GameCard, so this card must look up the right family.)
  const libraryGames = viewing ? viewing.games : games;
  const [showSpend, setShowSpend] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmWishlist, setConfirmWishlist] = useState(false);
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

  const linked = isLinked(game);
  const family = linked ? familyMembers(libraryGames, game) : [game];
  const fstats = familyStats(family);
  const played = game.playedHours ?? 0;
  const ownedSummary = ownedPlatformSummary(game.copies);
  const ownedLabels = ownedSummary.map(ownershipLabel);
  // A wishlist game isn't owned yet — the recorded copy is the version you want.
  const ownedVerb = game.status === "wishlist" ? "Want on" : "Owned on";
  const spent = totalCost(game.copies);
  const showSpendBreakdown = !hideSpend && hasAnyCost(game.copies);

  return (
    <>
      {showEdit &&
        createPortal(
          <EditGameModal game={game} onClose={() => setShowEdit(false)} />,
          document.body,
        )}
      {confirmWishlist &&
        createPortal(
          <ConfirmDialog
            title="Move to Wishlist?"
            body={
              <>
                The Wishlist is for games you don&apos;t own yet. Moving{" "}
                <span className="font-medium text-ink">{game.title}</span> there will cost an{" "}
                <span className="font-medium text-ink">Import Charter</span> to bring back to your
                Bazaar.
              </>
            }
            confirmLabel="Move to Wishlist"
            onConfirm={() => {
              bazaarToWishlist(game.id);
              setConfirmWishlist(false);
            }}
            onCancel={() => setConfirmWishlist(false)}
          />,
          document.body,
        )}
      <div className="group flex h-full min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
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
          {!readOnly && (
          <div className="absolute right-2 top-2" ref={menuRef} onClick={(e) => e.stopPropagation()}>
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
                          closeMenu();
                          setConfirmWishlist(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                      >
                        <Heart size={15} className="text-accent" /> Move to wishlist
                      </button>
                    )}
                    {game.status === "wishlist" && (
                      <button
                        onClick={() => {
                          if (charters > 0) importWithCharter(game.id);
                          else openCharters();
                          closeMenu();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                      >
                        <Scroll size={15} className="text-accent" />{" "}
                        {charters > 0 ? "Import with Charter" : "Get a Charter to import"}
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
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          {showStatus && (
            <div>
              <StatusBadge status={game.status} />
            </div>
          )}
          <div>
            <h3 className="font-display text-lg leading-tight text-ink">{game.title}</h3>
            {game.developers && game.developers.length > 0 && (
              <p className="mt-0.5 text-xs text-muted">{game.developers.slice(0, 2).join(", ")}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Released" value={year(game.released)} />
            <Stat label="Length" value={game.hours ? formatPlaytime(game.hours) : "—"} />
            <Stat label="Played" value={played ? formatPlaytime(played) : "—"} />
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

          {ownedSummary.length > 0 && (
            <div
              className="flex items-start gap-1 text-[11px] text-accent"
              title={`${ownedVerb}: ${ownedLabels.join(", ")}`}
            >
              <Library size={12} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">
                {ownedVerb} {ownedLabels.join(" · ")}
                {ownedSummary.length > 1 ? ` (${ownedSummary.length})` : ""}
              </span>
            </div>
          )}

          {linked && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-accent">
                <Link2 size={12} /> Game Family · {fstats.count} editions
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} className="text-accent/70" /> {formatPlaytime(fstats.totalPlayed)}{" "}
                  total
                </span>
                {fstats.totalCost > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Banknote size={12} className="text-accent/70" /> {formatUsd(fstats.totalCost)}{" "}
                    spent
                  </span>
                )}
                {fstats.finishedCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Trophy size={12} className="text-accent/70" /> {fstats.finishedCount} cleared
                  </span>
                )}
              </div>
            </div>
          )}

          {showSpendBreakdown && (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setShowSpend((v) => !v)}
                className="inline-flex items-center gap-1 self-start text-left text-[11px] text-muted transition hover:text-accent"
              >
                <Banknote size={12} className="text-accent/70" /> Spent {formatUsd(spent)}{" "}
                {showSpend ? "▲" : "▼"}
              </button>
              {showSpend && (
                <div className="rounded-lg bg-panel p-2 text-[11px] text-muted">
                  {(game.copies ?? []).map((c) => (
                    <div key={c.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {c.platform}
                        {c.format ? ` (${formatLabel(c.format)})` : ""}
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

          {readOnly ? <ReadOnlyFooter game={game} /> : <GameActions game={game} />}
        </div>
      </div>
    </>
  );
}
