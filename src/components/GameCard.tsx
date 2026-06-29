import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MoreVertical,
  Trash2,
  Heart,
  Store,
  Gamepad2,
  Pencil,
  Link2,
  Scroll,
  Package,
  Trophy,
  Flag,
  Lock,
  Eye,
  Infinity as InfinityIcon,
} from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { isLinked } from "../lib/families";
import { foldedCompilationCopies, dedupeCompilationBadges } from "../lib/ownershipMerge";
import { ownedPlatforms } from "../lib/copies";
import { finishTagLabel } from "../lib/finishTags";
import { isLocalCover } from "../lib/covers";
import { EditGameModal } from "./EditGameModal";
import { ReportModal } from "./ReportModal";
import { FamilyHub } from "./FamilyHub";
import { CompilationHub } from "./CompilationHub";
import { AddCompilationModal } from "./AddCompilationModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { GameActions, ReadOnlyFooter } from "./GameActions";
import { StatusBadge } from "./StatusBadge";
import { useViewing } from "../lib/viewContext";

/** One game's board card — a focused visual anchor. It surfaces only the cover
 *  art, the title, and a clean tag per unique platform you own it on; all the
 *  deeper metadata (release date, length, genres, developer, Metacritic, spend)
 *  lives in the detail modal you open by clicking the card. Functional chrome
 *  stays: the status badge, the Family / compilation / private markers, the ⋮
 *  menu, and the per-status actions from the shared <GameActions>. Every game —
 *  including each edition of a linked Game Family — gets its own card. */
export function GameCard({
  game,
  showStatus = false,
  autoOpenKey = 0,
  onAutoOpened,
}: {
  game: Game;
  showStatus?: boolean;
  // Bumped (to a fresh value) when a search result for this game is picked, so the
  // card scrolls into view and opens its detail. 0 = don't auto-open.
  autoOpenKey?: number;
  // Called once the auto-open has fired, so the parent can clear the request and
  // the card doesn't re-open itself when its board is revisited.
  onAutoOpened?: () => void;
}) {
  const { bazaarToWishlist, importWithCharter, charters, openCharters, removeGame, compilations, setCompilationChildStatus, setGamePrivate } =
    useStore();
  const { readOnly } = useViewing();
  const viewing = useStore((s) => s.viewing);
  const storeGames = useStore((s) => s.games);
  const [showEdit, setShowEdit] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [showFamily, setShowFamily] = useState(false);
  // The compilation copy whose hub / edit modal is open. For a standalone master
  // that has absorbed compilation copies, this is the folded copy the badge points
  // at (a master can belong to no compilation itself, so we track the child here).
  const [hubChild, setHubChild] = useState<Game | null>(null);
  const [editChild, setEditChild] = useState<Game | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmWishlist, setConfirmWishlist] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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

  // Open this card's detail and bring it into view when a search result selects
  // it. Keyed so re-picking the same game (a new key each time) re-triggers.
  useEffect(() => {
    if (autoOpenKey > 0) {
      setShowEdit(true);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      onAutoOpened?.();
    }
  }, [autoOpenKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeMenu() {
    setMenuOpen(false);
    setConfirming(false);
  }

  function openEdit() {
    closeMenu();
    setShowEdit(true);
  }

  const linked = isLinked(game);
  // This card's own membership drives the ⋮ menu (a compilation child gets the
  // compilation-piece options; a standalone master keeps the normal ones).
  const inCompilation = game.compilationId != null;

  // Overlapping ownership: when this standalone game is also owned inside one or
  // more compilations, those copies are folded into this master card (they no
  // longer render their own card). Empty for a plain standalone or for a card that
  // is itself a compilation child.
  const sourceGames = viewing ? viewing.games : storeGames;
  const foldedCopies = useMemo(
    () => foldedCompilationCopies(sourceGames, game),
    [sourceGames, game],
  );
  // The compilation memberships to badge on this card: the card's own bundle when
  // it's a compilation child rendered directly, otherwise one per folded copy —
  // deduped by name so the same collection owned on two platforms reads as one badge.
  const compilationParts = inCompilation
    ? [game]
    : dedupeCompilationBadges(foldedCopies);

  // The hub/edit modal target and its backing compilation record (looked up from
  // whichever compilation copy the badge points at).
  const editCompilation = editChild
    ? compilations.find((c) => c.id === editChild.compilationId)
    : undefined;

  // The distinct platforms you own this game on (physical + digital on the same
  // platform collapse to one) — the only metadata the focused card surfaces; the
  // rest lives in the detail modal. A folded master's tags span its own copies and
  // the absorbed compilation copies, so all the platforms you own it on show.
  const platformTags = ownedPlatforms([
    ...(game.copies ?? []),
    ...foldedCopies.flatMap((c) => c.copies ?? []),
  ]);

  return (
    <>
      {showEdit &&
        createPortal(
          <EditGameModal game={game} onClose={() => setShowEdit(false)} />,
          document.body,
        )}
      {reporting &&
        viewing &&
        createPortal(
          <ReportModal
            target={{ id: viewing.userId, name: viewing.displayName }}
            kind="cover"
            game={{ id: game.id, title: game.title }}
            onClose={() => setReporting(false)}
          />,
          document.body,
        )}
      {showFamily &&
        createPortal(
          <FamilyHub game={game} onClose={() => setShowFamily(false)} />,
          document.body,
        )}
      {hubChild &&
        createPortal(
          <CompilationHub
            game={hubChild}
            onClose={() => setHubChild(null)}
            onEdit={
              compilations.some((c) => c.id === hubChild.compilationId)
                ? () => {
                    setEditChild(hubChild);
                    setHubChild(null);
                  }
                : undefined
            }
          />,
          document.body,
        )}
      {editChild &&
        editCompilation &&
        createPortal(
          <AddCompilationModal
            compilation={editCompilation}
            onClose={() => setEditChild(null)}
          />,
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
      <div
        ref={cardRef}
        className="group flex h-full min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      >
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
                    {/* A compilation child is owned via the bundle, so it can't be
                        wishlisted; instead offer to move the piece between Bazaar
                        and Finished (the post-add counterpart to choosing each
                        game's status when adding the compilation). */}
                    {inCompilation && game.status === "backlog" && (
                      <button
                        onClick={() => {
                          closeMenu();
                          void setCompilationChildStatus(game.id, "finished");
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                      >
                        <Trophy size={15} className="text-accent" /> Mark finished
                      </button>
                    )}
                    {inCompilation && game.status === "finished" && (
                      <button
                        onClick={() => {
                          closeMenu();
                          void setCompilationChildStatus(game.id, "backlog");
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                      >
                        <Store size={15} className="text-accent" /> Move to Bazaar
                      </button>
                    )}
                    {!inCompilation && game.status === "backlog" && (
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
                    {/* Hide this game from visitors (or unhide it). Owner-only —
                        never affects the economy or your own boards/stats. */}
                    <button
                      onClick={() => {
                        closeMenu();
                        void setGamePrivate(game.id, !game.private);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                    >
                      {game.private ? (
                        <>
                          <Eye size={15} className="text-accent" /> Make visible
                        </>
                      ) : (
                        <>
                          <Lock size={15} className="text-accent" /> Make private
                        </>
                      )}
                    </button>
                    {/* Linking editions is rare, so it lives here in the ⋮ menu
                        rather than crowding the detail view. Already-linked games
                        manage their family from the detail's "Manage Family".
                        Not offered for a compilation's games — its pieces aren't
                        editions to link. */}
                    {!linked && !inCompilation && (
                      <button
                        onClick={() => {
                          closeMenu();
                          setShowFamily(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                      >
                        <Link2 size={15} className="text-accent" /> Link editions
                      </button>
                    )}
                    {/* A compilation's games can't be removed individually — the
                        whole compilation is deleted together, from its hub. */}
                    {inCompilation ? (
                      <button
                        onClick={() => {
                          closeMenu();
                          setHubChild(game);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                      >
                        <Package size={15} className="text-accent" /> Open compilation
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirming(true)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted transition hover:bg-panel hover:text-danger"
                      >
                        <Trash2 size={15} /> Remove
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          )}
          {/* Report a visited player's custom cover. Only shown when actually
              viewing someone else's uploaded art (a non-friend never receives the
              custom URL, so this never appears to them). */}
          {readOnly && viewing && isLocalCover(game.image) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReporting(true);
              }}
              title="Report this cover image"
              aria-label="Report this cover image"
              className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white/80 opacity-100 transition hover:bg-black/70 hover:text-danger hover-device:opacity-0 hover-device:group-hover:opacity-100"
            >
              <Flag size={13} />
            </button>
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
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {/* Owner-only marker that this game is hidden from visitors.
                  Visitors never receive private games, so it only shows on your
                  own boards. */}
              {!readOnly && game.private && (
                <span
                  title="Hidden from visitors to your Bazaar"
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-1.5 py-0.5 text-[10px] font-medium text-muted"
                >
                  <Lock size={10} /> Private
                </span>
              )}
              {/* Subtle "part of a Game Family" marker — combined stats and the
                  roster live in the detail modal (open the card). */}
              {linked && (
                <span
                  title="Part of a Game Family — open to see combined stats"
                  className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                >
                  <Link2 size={10} /> Family
                </span>
              )}
              {/* "Part of a compilation" marker(s). A standalone game owned inside
                  a bundle shows one badge per bundle (overlapping ownership folds
                  the compilation copy into this card). For the owner each opens that
                  Compilation Hub; while visiting it's a plain label. */}
              {compilationParts.map((part) =>
                readOnly ? (
                  <span
                    key={part.id}
                    title={`Part of ${part.compilationName ?? "a compilation"}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                  >
                    <Package size={10} className="shrink-0" />
                    <span className="truncate">Part of {part.compilationName ?? "a compilation"}</span>
                  </span>
                ) : (
                  <button
                    key={part.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHubChild(part);
                    }}
                    title="Open the compilation"
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[10px] font-medium text-accent transition hover:bg-accent/10"
                  >
                    <Package size={10} className="shrink-0" />
                    <span className="truncate">Part of {part.compilationName ?? "a compilation"}</span>
                  </button>
                ),
              )}
            </div>
          </div>

          {/* How a finished game concluded — the Finished board's status chip. */}
          {game.status === "finished" && game.finishTag && (
            <div className="flex">
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/5 px-2 py-0.5 text-[11px] font-medium text-accent">
                {game.finishTag === "completed" ? (
                  <Trophy size={11} className="shrink-0" />
                ) : game.finishTag === "endless" ? (
                  <InfinityIcon size={11} className="shrink-0" />
                ) : (
                  <Flag size={11} className="shrink-0" />
                )}
                {finishTagLabel(game.finishTag)}
              </span>
            </div>
          )}

          {/* The only metadata on a focused card: a clean tag per unique platform
              you own the game on (physical + digital on one platform = one tag).
              Everything else lives in the detail modal. */}
          {platformTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {platformTags.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] text-muted"
                >
                  <Gamepad2 size={11} className="shrink-0 text-accent/70" />
                  {p}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto" />

          {readOnly ? <ReadOnlyFooter game={game} /> : <GameActions game={game} />}
        </div>
      </div>
    </>
  );
}
