import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MoreVertical,
  Trash2,
  Heart,
  Store,
  Pencil,
  Link2,
  Unlink,
  Layers,
  Scroll,
  Package,
  Trophy,
  Flag,
  Lock,
  Eye,
  Expand,
  Shrink,
  BadgeCheck,
  Handshake,
  CalendarClock,
} from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { isLinked, familyPlatformTags, familyCoverImage } from "../lib/families";
import type { UnifiedFamily } from "../lib/familyGrouping";
import { prerequisiteOf } from "../lib/prerequisites";
import { clearedElsewhere } from "../lib/ownershipMerge";
import { ownedElsewhere } from "../lib/addRouting";
import { findExpandTemplate } from "../lib/compilationGrouping";
import { ownedPlatformSummary, ownedVersions, totalCost, formatUsd, versionLabel, primaryAcquisition, primaryProvider } from "../lib/copies";
import { formatPlaytime } from "../lib/playtime";
import { isLocalCover } from "../lib/covers";
import { clampScore } from "../lib/reviews";
import { gameHash } from "../lib/route";
import { ReportModal } from "./ReportModal";
import { LikeButton } from "./LikeButton";
import { CoOpBadge, CoOpInviteModal, useActivePact } from "./CoOpPact";
import { canInviteToPact } from "../lib/coopPacts";
import { FamilyHub } from "./FamilyHub";
import { CompilationHub } from "./CompilationHub";
import { AddCompilationModal } from "./AddCompilationModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { PreorderModal } from "./PreorderModal";
import { GameActions, ReadOnlyFooter } from "./GameActions";
import { PlatformBadge } from "./PlatformBadge";
import { AcquisitionBadge } from "./AcquisitionBadge";
import { GameValueBadge } from "./ValueBadge";
import { StatusBadge } from "./StatusBadge";
import { isInRotation } from "../lib/status";
import { FinishTagBadge } from "./FinishTagBadge";
import { ScoreChip } from "./StarRating";
import { useViewing } from "../lib/viewContext";

/** One game's board card — a focused visual anchor. It surfaces only the cover
 *  art, the title, and a clean tag per unique platform you own it on; all the
 *  deeper detail (length, screenshots, copies, spend, milestones) lives on the
 *  game's own page, opened by clicking the card. Functional chrome
 *  stays: the status badge, the Family / compilation / private markers, the ⋮
 *  menu, and the per-status actions from the shared <GameActions>.
 *
 *  With `family` set, this same flat card IS the unified Game Family card:
 *  `game` is the family's PRIMARY member (its board, box art and actions), the
 *  platform tags aggregate every member's copies (primary's first), a subtle
 *  badge on the cover marks the grouped status, and the ⋮ menu gains the
 *  Change Primary / Sever tools. Nothing nests — the other members stay hidden
 *  until the link is severed. */
export function GameCard({
  game,
  showStatus = false,
  family,
  stack,
}: {
  game: Game;
  showStatus?: boolean;
  family?: UnifiedFamily;
  /** The members of the collapsed stack this card fronts (GameStackCard's top
   *  card): the platform tags then aggregate the whole deck, top card first. */
  stack?: Game[];
}) {
  const { bazaarToWishlist, bazaarToFinished, importWithCharter, charters, openCharters, removeGame, compilations, setCompilationChildStatus, setCompilationExpanded, expandGameToCompilation, parentTemplates, setGamePrivate, severFamily } =
    useStore();
  const { readOnly } = useViewing();
  const viewing = useStore((s) => s.viewing);
  const storeGames = useStore((s) => s.games);
  const cloud = useStore((s) => s.cloud);
  const can = useStore((s) => s.can);
  const coOpPacts = useStore((s) => s.coOpPacts);
  const activePact = useActivePact(game.id);
  const [reporting, setReporting] = useState(false);
  const [showCoOpInvite, setShowCoOpInvite] = useState(false);
  const [showFamily, setShowFamily] = useState(false);
  // The compilation copy whose hub / edit modal is open. For a standalone master
  // that has absorbed compilation copies, this is the folded copy the badge points
  // at (a master can belong to no compilation itself, so we track the child here).
  const [hubChild, setHubChild] = useState<Game | null>(null);
  const [editChild, setEditChild] = useState<Game | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Inline "Move to Finished" tag picker (Beaten / Completed) shown in the menu.
  const [finishPrompt, setFinishPrompt] = useState(false);
  const [confirmWishlist, setConfirmWishlist] = useState(false);
  const [confirmExpand, setConfirmExpand] = useState(false);
  const [confirmSever, setConfirmSever] = useState(false);
  // Mark/edit a wishlist entry's pre-order (date modal, portaled).
  const [showPreorder, setShowPreorder] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirming(false);
        setFinishPrompt(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function closeMenu() {
    setMenuOpen(false);
    setConfirming(false);
    setFinishPrompt(false);
  }

  // Open this game's own page ("#g/<id>", or the visited player's copy while
  // visiting). A plain hash navigation — the router does the rest.
  function openEdit() {
    closeMenu();
    window.location.hash = gameHash(game.id, viewing?.userId ?? null);
  }

  const linked = isLinked(game);
  // The unified family mode: only meaningful with 2+ members (a family reduced
  // to one visible member renders as a plain card).
  const fam = family && family.members.length > 1 ? family : undefined;
  // The family card wears its designated member cover when one is set
  // (set_family_cover, switchable on the game page's Overview); otherwise —
  // and always for a plain card — this game's own image.
  const cover = (fam ? familyCoverImage(fam.members) : undefined) ?? game.image;
  // This card's own membership drives the ⋮ menu (a compilation child gets the
  // compilation-piece options; a standalone master keeps the normal ones).
  const inCompilation = game.compilationId != null;

  // Every record is its own card — the only compilation badge is this card's own
  // bundle membership (a standalone twin of a bundle-owned game shows separately,
  // marked "Cleared Elsewhere" when the other instance already beat it).
  const sourceGames = viewing ? viewing.games : storeGames;
  const compilationParts = inCompilation ? [game] : [];

  // The hub/edit modal target and its backing compilation record (looked up from
  // whichever compilation copy the badge points at).
  const editCompilation = editChild
    ? compilations.find((c) => c.id === editChild.compilationId)
    : undefined;

  // The distinct platforms this instance owns (physical + digital on the same
  // platform collapse to one) — the only metadata the focused card surfaces; the
  // rest lives in the detail modal. A platform owned ONLY as DLC keeps its tag
  // but carries a "DLC" marker so it never reads as an owned base copy. A
  // unified family card instead aggregates every member's platforms, the
  // primary's first.
  const ownershipCopies = game.copies ?? [];
  const platformTags = fam
    ? familyPlatformTags(fam.members)
    : stack && stack.length > 1
      ? ownedPlatformSummary(stack.flatMap((g) => g.copies ?? []))
      : ownedPlatformSummary(ownershipCopies);
  // A subscription/borrowed copy gets a quiet "rented" flag beside the platforms.
  const acquisitionTag = primaryAcquisition(ownershipCopies);
  const acquisitionProvider = primaryProvider(ownershipCopies);

  // A wishlist entry for a game the player owns on another platform: highlight
  // the specific version being hunted (full platform + format, not the collapsed
  // platform tags) so it reads clearly apart from a normal unowned wishlist card.
  // Skipped in family mode — the family's members ARE the other versions.
  const ownedTwin =
    !fam && game.status === "wishlist" ? ownedElsewhere(sourceGames, game) : null;

  // Story lock: the unfinished prerequisite (if any) blocking this game from
  // starting. Only meaningful before it's playing/finished; resolved live so
  // finishing the prerequisite clears the badge with no stored state.
  const storyLock =
    game.status === "backlog" || game.status === "wishlist"
      ? (() => {
          const pre = prerequisiteOf(sourceGames, game);
          return pre != null && pre.status !== "finished" ? pre : null;
        })()
      : null;
  const wantedVersions = ownedTwin ? ownedVersions(game.copies) : [];

  // Cleared Elsewhere: another instance of this game (standalone or bundle
  // child) is already beaten/completed — historical context on an unplayed
  // copy, strictly informational (no status or coin syncing, ever). Skipped in
  // family mode: a linked sibling's clear already speaks through the family's
  // own economy (discounted entry, Replay Bonus).
  const cleared = useMemo(
    () => (fam ? null : clearedElsewhere(sourceGames, game)),
    [sourceGames, game, fam],
  );
  const clearedOnLabel = cleared
    ? ownedPlatformSummary(cleared.copies)
        .map((o) => o.platform)
        .join(", ")
    : "";

  // A standalone owned card matching a moderator-linked compilation template can
  // be expanded into the bundle's individual games (cloud-only — templates are
  // shared data). Never offered while visiting or for wishlist rows.
  const expandTemplate = readOnly ? null : findExpandTemplate(game, parentTemplates);

  return (
    <>
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
          <FamilyHub
            game={game}
            onClose={() => setShowFamily(false)}
            onJump={(m) => {
              setShowFamily(false);
              window.location.hash = gameHash(m.id, viewing?.userId ?? null);
            }}
          />,
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
      {confirmExpand &&
        expandTemplate &&
        createPortal(
          <ConfirmDialog
            title="Expand into a compilation?"
            confirmLabel="Expand"
            body={
              <>
                <span className="font-medium text-ink">{game.title}</span> becomes{" "}
                <span className="font-medium text-ink">{expandTemplate.title}</span> with{" "}
                <span className="font-medium text-ink">{expandTemplate.games.length}</span>{" "}
                individual game cards.
                {totalCost(game.copies) > 0 && (
                  <>
                    {" "}
                    Its <span className="font-medium text-ink">{formatUsd(totalCost(game.copies))}</span>{" "}
                    splits evenly across them.
                  </>
                )}
                {game.status === "playing" && (game.pricePaid ?? 0) > 0 && (
                  <>
                    {" "}
                    Your <span className="font-medium text-ink">{game.pricePaid}-coin</span>{" "}
                    activation fee is refunded — each game gets its own coin loop.
                  </>
                )}
                {(game.playedHours ?? 0) > 0 && (
                  <>
                    {" "}
                    Your <span className="font-medium text-ink">{formatPlaytime(game.playedHours ?? 0)}</span>{" "}
                    logged so far stay on the bundle&apos;s total.
                  </>
                )}
                {game.progressNote?.trim() ? (
                  <> This card&apos;s progress note will be removed.</>
                ) : null}
              </>
            }
            onConfirm={() => {
              setConfirmExpand(false);
              void expandGameToCompilation(game.id, expandTemplate);
            }}
            onCancel={() => setConfirmExpand(false)}
          />,
          document.body,
        )}
      {confirmSever &&
        fam &&
        createPortal(
          <ConfirmDialog
            title="Sever this family link?"
            confirmLabel="Sever link"
            body={
              <>
                The <span className="font-medium text-ink">{fam.name}</span> Family dissolves and
                its <span className="font-medium text-ink">{fam.members.length}</span> editions
                return to your library as individual, standalone cards. Nothing else changes —
                every edition keeps its status, hours and history.
              </>
            }
            onConfirm={() => {
              setConfirmSever(false);
              void severFamily(fam.familyId);
            }}
            onCancel={() => setConfirmSever(false)}
          />,
          document.body,
        )}
      {showCoOpInvite && <CoOpInviteModal game={game} onClose={() => setShowCoOpInvite(false)} />}
      {showPreorder &&
        createPortal(
          <PreorderModal game={game} onClose={() => setShowPreorder(false)} />,
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
        className="group flex h-full min-h-[22rem] flex-col overflow-hidden rounded-xl border-[1.5px] border-edge bg-surface shadow-stamp transition duration-200 hover:-translate-y-0.5 hover:shadow-[4px_5px_0_0_var(--shadow-ink)]"
      >
        <div className="relative h-36 border-b-[1.5px] border-edge bg-panel">
          {/* The cover opens the game's own page. Its title/click covers only this
              image region, NOT the whole cell — otherwise the ellipsis menu (a
              sibling below) would inherit this tooltip on every menu option. While
              visiting, that page is read-only, so it reads "View", not "Edit". */}
          <div
            className="h-full w-full cursor-pointer"
            role="button"
            tabIndex={0}
            title={`${readOnly ? "View" : "Edit"} ${game.title}`}
            onClick={openEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openEdit();
              }
            }}
          >
            {cover ? (
              <img src={cover} alt={game.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl opacity-60">🎮</div>
            )}
          </div>
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
              <div className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-lg border border-edge bg-surface p-1 text-left shadow-stamp">
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
                ) : finishPrompt ? (
                  <div className="p-2">
                    <p className="px-1 pb-1 text-xs font-medium text-ink">Move to Finished as…</p>
                    <p className="px-1 pb-2 text-[11px] text-muted">
                      No coins are spent or earned — this just corrects an accidental add.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          void bazaarToFinished(game.id, "beaten");
                          closeMenu();
                        }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-panel px-2 py-1.5 text-xs font-semibold text-ink transition hover:bg-brand hover:text-brand-fg"
                      >
                        <Flag size={13} /> Beaten
                      </button>
                      <button
                        onClick={() => {
                          void bazaarToFinished(game.id, "completed");
                          closeMenu();
                        }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-panel px-2 py-1.5 text-xs font-semibold text-ink transition hover:bg-brand hover:text-brand-fg"
                      >
                        <Trophy size={13} /> Completed
                      </button>
                    </div>
                    <button
                      onClick={() => setFinishPrompt(false)}
                      className="mt-2 w-full rounded-lg px-2 py-1.5 text-xs text-muted transition hover:bg-panel"
                    >
                      Cancel
                    </button>
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
                    {/* Correction escape hatch: a finished game accidentally added
                        to the Bazaar can be moved straight to Finished (pick Beaten
                        or Completed) with no coins spent or earned — it never went
                        through buy→play→finish. */}
                    {!inCompilation && game.status === "backlog" && (
                      <button
                        onClick={() => setFinishPrompt(true)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                      >
                        <Trophy size={15} className="text-accent" /> Move to Finished
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
                    {/* Pre-orders: mark a wishlist entry you've committed to
                        (it pins with a countdown until its day comes). */}
                    {game.status === "wishlist" && (
                      <button
                        onClick={() => {
                          closeMenu();
                          setShowPreorder(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                      >
                        <CalendarClock size={15} className="text-accent" />{" "}
                        {game.preorderedAt != null ? "Edit pre-order" : "Mark as pre-ordered"}
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
                    {/* Co-op Pact (issue d57afe4f): pledge to finish this game
                        together with a friend who owns it too. Needs a catalog
                        identity to match the partner's copy. */}
                    {cloud && canInviteToPact(coOpPacts, game) && (
                      <button
                        onClick={() => {
                          closeMenu();
                          setShowCoOpInvite(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                      >
                        <Handshake size={15} className="text-accent" /> Invite to Co-op Pact
                      </button>
                    )}
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
                    {/* The unified family card's tools: the Breakdown modal
                        (per-edition stats, Set as primary, per-copy removal)
                        and the one-tap dissolve. */}
                    {fam && (
                      <>
                        <button
                          onClick={() => {
                            closeMenu();
                            setShowFamily(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                        >
                          <Layers size={15} className="text-accent" /> View linked editions
                        </button>
                        <button
                          onClick={() => {
                            closeMenu();
                            setConfirmSever(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted transition hover:bg-panel hover:text-danger"
                        >
                          <Unlink size={15} /> Sever family link
                        </button>
                      </>
                    )}
                    {/* A standalone card that IS a linked compilation (per the
                        shared catalog) can be expanded into its games. */}
                    {expandTemplate && (
                      <button
                        onClick={() => {
                          closeMenu();
                          setConfirmExpand(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                      >
                        <Expand size={15} className="text-accent" /> Expand compilation…
                      </button>
                    )}
                    {/* Fold this bundle's cards into one rollup parent card
                        (refused with a toast while a piece is in Now Playing). */}
                    {inCompilation && game.compilationId && (
                      <button
                        onClick={() => {
                          closeMenu();
                          void setCompilationExpanded(game.compilationId!, false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                      >
                        <Shrink size={15} className="text-accent" /> Collapse compilation
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
          {/* Like/favorite thumbs-up: bottom-right of the cover. A liked one
              stays visible (it's a status marker); an unliked one appears on
              hover (like the ⋮ menu) so unmarked cards stay clean. Visiting
              shows it only when the owner liked the game. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className={
              "absolute bottom-2 right-2 " +
              (game.likedAt != null
                ? "opacity-100"
                : "opacity-100 hover-device:opacity-0 hover-device:group-hover:opacity-100")
            }
          >
            <LikeButton game={game} size={14} overlay />
          </div>
          {/* The subtle top-left family badge: marks the grouped status without
              breaking the flat card shape. Opens the Family hub for the owner;
              a plain label while visiting. */}
          {fam &&
            (readOnly ? (
              <span
                title={`The ${fam.name} Family — ${fam.members.length} linked editions in one card`}
                className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white"
              >
                <Layers size={10} /> {fam.members.length}
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFamily(true);
                }}
                title={`The ${fam.name} Family — ${fam.members.length} linked editions in one card. Manage it.`}
                aria-label={`Manage the ${fam.name} Family (${fam.members.length} editions)`}
                className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white transition hover:bg-black/75"
              >
                <Layers size={10} /> {fam.members.length}
              </button>
            ))}
          {/* Report a visited player's custom cover. Only shown when actually
              viewing someone else's uploaded art (a non-friend never receives the
              custom URL, so this never appears to them). Steps below the family
              badge when both occupy the top-left corner. */}
          {readOnly && viewing && isLocalCover(game.image) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReporting(true);
              }}
              title="Report this cover image"
              aria-label="Report this cover image"
              className={`absolute left-2 ${fam ? "top-9" : "top-2"} grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white/80 opacity-100 transition hover:bg-black/70 hover:text-danger hover-device:opacity-0 hover-device:group-hover:opacity-100`}
            >
              <Flag size={13} />
            </button>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          {showStatus && (
            <div>
              <StatusBadge status={game.status} rotation={isInRotation(game)} />
            </div>
          )}
          <div>
            {/* A unified family card wears the family's display name (which
                falls back to the primary's own title). */}
            <h3 className="font-display text-lg font-semibold leading-tight text-ink">
              {fam ? fam.name : game.title}
            </h3>
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
              {/* Story lock: an unfinished prerequisite blocks starting this
                  game. Derived live, so it disappears the moment the
                  prerequisite is finished (or deleted/unlinked). */}
              {storyLock && (
                <span
                  title={`Locked until you finish ${storyLock.title}`}
                  className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                >
                  <Lock size={10} /> Story-locked
                </span>
              )}
              {/* An active Co-op Pact binds this card to a friend's shared
                  playthrough (issue d57afe4f) — their avatar rides the chip. */}
              {activePact && <CoOpBadge pact={activePact} />}
              {/* "Money Well Spent": playtime has paid off the purchase price at
                  your target rate (issue 6c60c213). A family card judges the
                  whole family's summed spend + hours. */}
              <GameValueBadge game={game} members={fam?.members} />
              {/* Another instance of this game is already beaten/completed —
                  historical context on an unplayed copy. Informational only. */}
              {cleared && (
                <span
                  title={`Already ${cleared.finishTag === "completed" ? "100% completed" : "beaten"}${clearedOnLabel ? ` on your ${clearedOnLabel} copy` : " on another copy"} — this copy tracks its own playthrough`}
                  className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success"
                >
                  <BadgeCheck size={10} /> Cleared elsewhere
                </span>
              )}
              {/* Wishlist entry for a game owned on another platform — mark it so
                  it never reads as an accidental duplicate. */}
              {ownedTwin && (
                <span
                  title={`Also in your ${ownedTwin.status === "playing" ? "Now Playing" : ownedTwin.status === "finished" ? "Finished" : "Bazaar"} — this entry tracks another version`}
                  className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                >
                  <Store size={10} /> You own another version
                </span>
              )}
              {/* Membership markers, condensed to icon chips so browsing cards
                  stays clean: a link icon for a Game Family, a package icon per
                  compilation the game belongs to — side by side on one row. The
                  hover tooltip carries the name; for the owner each is a button
                  (family → Family Hub, package → that Compilation Hub), while
                  visiting they're plain labels. A unified family card skips the
                  link chip — its cover badge already marks the grouping. */}
              {linked &&
                !fam &&
                (readOnly ? (
                  <span
                    title={`Part of the ${game.familyName?.trim() || "Game"} Family`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-accent/30 bg-accent/5 text-accent"
                  >
                    <Link2 size={11} />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowFamily(true);
                    }}
                    title={`Part of the ${game.familyName?.trim() || "Game"} Family — manage it`}
                    aria-label={`Part of the ${game.familyName?.trim() || "Game"} Family — manage it`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-accent/30 bg-accent/5 text-accent transition hover:bg-accent/10"
                  >
                    <Link2 size={11} />
                  </button>
                ))}
              {compilationParts.map((part) =>
                readOnly ? (
                  <span
                    key={part.id}
                    title={`Part of ${part.compilationName ?? "a compilation"}`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-accent/30 bg-accent/5 text-accent"
                  >
                    <Package size={11} />
                  </span>
                ) : (
                  <button
                    key={part.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHubChild(part);
                    }}
                    title={`Part of ${part.compilationName ?? "a compilation"} — open it`}
                    aria-label={`Part of ${part.compilationName ?? "a compilation"} — open it`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-accent/30 bg-accent/5 text-accent transition hover:bg-accent/10"
                  >
                    <Package size={11} />
                  </button>
                ),
              )}
            </div>
          </div>

          {/* How a finished game concluded — the Finished board's status chip —
              plus the at-a-glance review score when one was left. */}
          {game.status === "finished" && (game.finishTag || clampScore(game.reviewScore ?? null)) && (
            <div className="flex items-center gap-1.5">
              {game.finishTag && <FinishTagBadge tag={game.finishTag} />}
              {clampScore(game.reviewScore ?? null) != null && <ScoreChip score={game.reviewScore!} />}
            </div>
          )}

          {/* The only metadata on a focused card: a clean tag per unique platform
              you own the game on (physical + digital on one platform = one tag).
              Everything else lives in the detail modal. An owned-elsewhere
              wishlist card instead highlights the exact version being hunted
              (platform + format), in accent, so the target is unmistakable. */}
          {ownedTwin && wantedVersions.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {wantedVersions.map((v) => (
                <span
                  key={versionLabel(v.platform, v.format)}
                  className="inline-flex items-center gap-1 rounded-md border border-accent/50 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent"
                >
                  <Heart size={11} className="shrink-0" />
                  Wanted on {versionLabel(v.platform, v.format)}
                </span>
              ))}
            </div>
          ) : platformTags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {platformTags.map((o) => {
                // On a collapsed deck each tag deep-links to the member that
                // owns that platform — the fastest route to one version's page.
                const target =
                  stack && stack.length > 1
                    ? stack.find((g) =>
                        (g.copies ?? []).some((c) => (c.platform ?? "").trim() === o.platform),
                      )
                    : undefined;
                return (
                  <PlatformBadge
                    key={o.platform}
                    label={o.platform}
                    formats={o.formats}
                    title={target ? `Open the ${o.platform} version` : undefined}
                    onClick={
                      target
                        ? () => {
                            window.location.hash = gameHash(target.id, viewing?.userId ?? null);
                          }
                        : undefined
                    }
                  />
                );
              })}
              {/* Flag a subscription/borrowed game so a "rented" copy is
                  recognizable at a glance on the board, not just in the editor. */}
              {acquisitionTag && (
                <AcquisitionBadge acquisition={acquisitionTag} provider={acquisitionProvider} />
              )}
            </div>
          ) : null}

          {/* The "tear line": a dashed rule separating the printed entry above
              from the actionable stub below, like a ticket's tear-off edge. */}
          <div className="mt-auto border-t-2 border-dashed border-line pt-3">
            {readOnly ? (
              <ReadOnlyFooter game={game} familyMembers={fam?.members} />
            ) : (
              <GameActions game={game} familyMembers={fam?.members} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
