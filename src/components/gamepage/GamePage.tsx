import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, BookOpen, Clock, Banknote, Eye, Flag, Heart, Layers, Link2, Lock, Map, MoreVertical, Package, Star, Trash2, Trophy, Users, type LucideIcon } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { afterRemovalTarget, type PageNav, type PageNavStop } from "../../lib/pageNav";
import { PageNavControls } from "./PageNavControls";
import { CoOpPactBanner } from "../CoOpPact";
import { ViewingProvider } from "../../lib/viewContext";
import { gameHash } from "../../lib/route";
import { gameToAddMeta } from "../../lib/addRouting";
import { FamilyHub } from "../FamilyHub";
import {
  hubMembers,
  hubRepresentative,
  hubTitle,
  hubEditions,
  editionKeyOf,
  editionLabel,
  type HubEdition,
} from "../../lib/gameHub";
import { familyStats } from "../../lib/families";
import { catalogKey } from "../../lib/ownershipMerge";
import { formatPlaytime } from "../../lib/playtime";
import { formatUsd } from "../../lib/copies";
import { GameValueBadge } from "../ValueBadge";
import { hasReview } from "../../lib/reviews";
import { LikeButton } from "../LikeButton";
import { OverviewTab, ReadOnlyOverview } from "./OverviewTab";
import { JourneyTab } from "./JourneyTab";
import { LibraryTab } from "./LibraryTab";
import { ReviewTab } from "./ReviewTab";
import { CommunityTab } from "./CommunityTab";

/** Which section pane is open. The tabs are data-driven so upcoming sections
 *  are one new entry. */
export type GameTabId = "overview" | "journey" | "review" | "community" | "library";

const GAME_TABS: {
  id: GameTabId;
  label: string;
  icon: LucideIcon;
  /** Whether the tab has content in the read-only (visiting) variant. The tab
   *  bar itself only appears for visitors once more than one tab qualifies.
   *  Review is special-cased: it joins the visitor's bar only when the owner
   *  actually left one (see the tabs computation below). */
  visitorVisible: boolean;
}[] = [
  { id: "overview", label: "Overview", icon: BookOpen, visitorVisible: true },
  { id: "journey", label: "Journey", icon: Map, visitorVisible: false },
  { id: "review", label: "Review", icon: Star, visitorVisible: false },
  // Every player's review of this game — community content, so visitors see it.
  { id: "community", label: "Community", icon: Users, visitorVisible: true },
  { id: "library", label: "Library", icon: Package, visitorVisible: false },
];

/** A game's own page (routed: "#g/<id>", or "#u/<uid>/g/<gid>" while visiting)
 *  — the unified Game Details Hub. One page per TITLE: whichever variant's
 *  card you click, the page gathers every connected instance (same catalog
 *  identity + family-linked editions) and renders a universal header, an
 *  edition selector on Journey/Review (history stays on the record that
 *  earned it — zero migration), the Library instance control center, and the
 *  globally aggregated Community feed. Every section writes immediately; there
 *  is no Save. While visiting, the same page renders read-only from the
 *  visited library. */
export function GamePage({
  gameId,
  visitPending = false,
  onBack,
  pageNav,
  onNavigate,
}: {
  gameId: string;
  /** True while a "#u/<uid>/g/<gid>" deep link is still loading that player's
   *  Bazaar — the game can't resolve yet, so show a loading panel, not "gone". */
  visitPending?: boolean;
  onBack: () => void;
  /** The originating board's game order (Bazaar/Finished/Master Ledger), for
   *  Prev/Next browsing. Absent when the page wasn't reached from a browseable
   *  board (a deep link, search, a profile shelf). */
  pageNav?: PageNav | null;
  /** Retarget the app to another browse stop (a Prev/Next step) — a game opens
   *  another game page, a compilation opens its bundle page. */
  onNavigate?: (stop: PageNavStop) => void;
}) {
  const games = useStore((s) => s.games);
  const viewing = useStore((s) => s.viewing);
  const source = viewing ? viewing.games : games;
  const game = source.find((g) => g.id === gameId);

  // A fresh page starts at the top (Back restores the board's position).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [gameId]);

  // If the game we were showing disappears (deleted, sold back, expanded into a
  // compilation), leave the page instead of flashing the not-found panel.
  const hadGameRef = useRef(false);
  useEffect(() => {
    if (game) hadGameRef.current = true;
    else if (hadGameRef.current) onBack();
  }, [game, onBack]);

  if (!game) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <BackButton onBack={onBack} />
        <div className="mt-4 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          {visitPending ? (
            <p className="text-sm text-muted">Loading their Bazaar…</p>
          ) : (
            <>
              <p className="font-display text-xl text-ink">This game isn’t in the library</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                It may have been removed, or the link is out of date.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <ViewingProvider
      value={{ readOnly: viewing != null, hideSpend: viewing?.hideSpend ?? false }}
    >
      {/* Keyed by the routed game so tab choice, edition selection and section
          drafts reset when the page re-targets another game (sibling jump,
          search, a stack tag). */}
      <GamePageBody
        key={game.id}
        game={game}
        libraryGames={source}
        readOnly={viewing != null}
        hideSpend={viewing?.hideSpend ?? false}
        onBack={onBack}
        pageNav={pageNav}
        onNavigate={onNavigate}
      />
    </ViewingProvider>
  );
}

/** The owner's ⋮ menu on the detail page — the board card's quick actions
 *  brought to the hub (issue 546c0de8). For a single standalone game it mirrors
 *  the card: Move to Wishlist / Finished, Make private, Link editions, Delete.
 *  A multi-edition hub (or a compilation piece) has no single target for the
 *  per-copy actions, so it points to the Library tab, which already manages each
 *  version. Owner-only; never rendered while visiting. */
function GamePageMenu({
  hub,
  onBack,
  onManageInLibrary,
  pageNav,
  onNavigate,
}: {
  hub: Game[];
  onBack: () => void;
  onManageInLibrary: () => void;
  /** The board's browse order, so deleting a game can step to a neighbour
   *  (issue 546c0de8) rather than leaving the page. */
  pageNav?: PageNav | null;
  onNavigate?: (stop: PageNavStop) => void;
}) {
  const { bazaarToWishlist, bazaarToFinished, setGamePrivate, removeGame } = useStore();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "finish" | "wishlist" | "delete">("menu");
  const [showFamily, setShowFamily] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setMode("menu");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const close = () => {
    setOpen(false);
    setMode("menu");
  };

  // A single instance (this page shows one game) vs. a hub of several editions.
  const solo = hub.length === 1 ? hub[0] : null;
  // A compilation piece is owned via its bundle — not a freely movable/removable
  // standalone card, so those actions defer to the Library tab like a hub does.
  const standalone = solo != null && solo.compilationId == null;
  const item =
    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center justify-center rounded-lg border border-line bg-panel px-2 py-1.5 text-muted transition hover:text-ink"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-lg border border-edge bg-surface p-1 text-left shadow-stamp"
        >
          {mode === "delete" && solo ? (
            <div className="p-2">
              <p className="px-1 pb-2 text-xs text-muted">
                Delete <span className="font-medium text-ink">{solo.title}</span> from your
                library?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Step to a neighbouring card (previous, or the new first
                    // when deleting the first) instead of dropping back to the
                    // board — issue 546c0de8. removeGame updates the store
                    // optimistically, so the target must be read first.
                    const target =
                      pageNav && onNavigate
                        ? afterRemovalTarget(pageNav.stops, { kind: "game", id: solo.id })
                        : null;
                    void removeGame(solo.id);
                    close();
                    if (target && onNavigate) onNavigate(target);
                    else onBack();
                  }}
                  className="flex-1 rounded-lg bg-danger/15 px-2 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/25"
                >
                  Delete
                </button>
                <button
                  onClick={() => setMode("menu")}
                  className="flex-1 rounded-lg bg-panel px-2 py-1.5 text-xs text-ink transition hover:brightness-95"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : mode === "wishlist" && solo ? (
            <div className="p-2">
              <p className="px-1 pb-2 text-xs text-muted">
                Move <span className="font-medium text-ink">{solo.title}</span> to your Wishlist?
                The Wishlist is for games you don&apos;t own yet.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    void bazaarToWishlist(solo.id);
                    close();
                  }}
                  className="flex-1 rounded-lg bg-brand px-2 py-1.5 text-xs font-semibold text-brand-fg transition hover:brightness-95"
                >
                  Move
                </button>
                <button
                  onClick={() => setMode("menu")}
                  className="flex-1 rounded-lg bg-panel px-2 py-1.5 text-xs text-ink transition hover:brightness-95"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : mode === "finish" && solo ? (
            <div className="p-2">
              <p className="px-1 pb-1 text-xs font-medium text-ink">Move to Finished as…</p>
              <p className="px-1 pb-2 text-[11px] text-muted">
                No coins are spent or earned — this just corrects an accidental add.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    void bazaarToFinished(solo.id, "beaten");
                    close();
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-panel px-2 py-1.5 text-xs font-semibold text-ink transition hover:bg-brand hover:text-brand-fg"
                >
                  <Flag size={13} /> Beaten
                </button>
                <button
                  onClick={() => {
                    void bazaarToFinished(solo.id, "completed");
                    close();
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-panel px-2 py-1.5 text-xs font-semibold text-ink transition hover:bg-brand hover:text-brand-fg"
                >
                  <Trophy size={13} /> Completed
                </button>
              </div>
              <button
                onClick={() => setMode("menu")}
                className="mt-2 w-full rounded-lg px-2 py-1.5 text-xs text-muted transition hover:bg-panel"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              {standalone && solo!.status === "backlog" && (
                <button onClick={() => setMode("wishlist")} className={item}>
                  <Heart size={15} className="text-accent" /> Move to wishlist
                </button>
              )}
              {standalone && solo!.status === "backlog" && (
                <button onClick={() => setMode("finish")} className={item}>
                  <Trophy size={15} className="text-accent" /> Move to Finished
                </button>
              )}
              {solo && (
                <button
                  onClick={() => {
                    void setGamePrivate(solo.id, !solo.private);
                    close();
                  }}
                  className={item}
                >
                  {solo.private ? (
                    <>
                      <Eye size={15} className="text-accent" /> Make visible
                    </>
                  ) : (
                    <>
                      <Lock size={15} className="text-accent" /> Make private
                    </>
                  )}
                </button>
              )}
              {standalone && (
                <button
                  onClick={() => {
                    setShowFamily(true);
                    close();
                  }}
                  className={item}
                >
                  <Link2 size={15} className="text-accent" /> Link editions
                </button>
              )}
              {!standalone && (
                <button
                  onClick={() => {
                    onManageInLibrary();
                    close();
                  }}
                  className={item}
                >
                  <Package size={15} className="text-accent" /> Manage editions
                </button>
              )}
              {standalone && (
                <button
                  onClick={() => setMode("delete")}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-danger transition hover:bg-panel"
                >
                  <Trash2 size={15} /> Delete game
                </button>
              )}
            </>
          )}
        </div>
      )}
      {showFamily &&
        solo &&
        createPortal(
          <FamilyHub
            game={solo}
            onClose={() => setShowFamily(false)}
            onJump={(m) => {
              setShowFamily(false);
              window.location.hash = gameHash(m.id, null);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-ink"
    >
      <ArrowLeft size={14} /> Back
    </button>
  );
}

/** Add-to-Wishlist affordance shown on a VISITED game's page. Adds the game to
 *  YOUR library (not the player you're visiting) as a wishlist entry — hidden
 *  once it's in your library in any form, and only for a catalogued game so the
 *  add can dedupe by shared identity (issue f015625a). */
function VisitWishlistButton({ game }: { game: Game }) {
  const myGames = useStore((s) => s.games);
  const addGame = useStore((s) => s.addGame);
  const [adding, setAdding] = useState(false);
  const key = catalogKey(game);
  // No catalog identity (a hand-typed custom) can't be matched or added cleanly.
  if (key == null) return null;
  const alreadyMine = myGames.some((g) => catalogKey(g) === key);
  if (alreadyMine) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-subtle">
        <Heart size={14} className="fill-current text-accent/60" /> In your library
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={adding}
      onClick={async () => {
        setAdding(true);
        try {
          await addGame(gameToAddMeta(game), "wishlist");
        } finally {
          setAdding(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-accent transition hover:bg-brand/20 disabled:opacity-60"
    >
      <Heart size={14} /> Wishlist
    </button>
  );
}

function GamePageBody({
  game,
  libraryGames,
  readOnly,
  hideSpend,
  onBack,
  pageNav,
  onNavigate,
}: {
  game: Game;
  libraryGames: Game[];
  readOnly: boolean;
  hideSpend: boolean;
  onBack: () => void;
  pageNav?: PageNav | null;
  onNavigate?: (stop: PageNavStop) => void;
}) {
  const { cloud, fetchGameScreenshots } = useStore();
  const can = useStore((s) => s.can);
  const [tab, setTab] = useState<GameTabId>("overview");

  // The hub: every instance connected to the routed game. The representative
  // fronts the universal header, so the page looks the same no matter which
  // variant's card opened it.
  const hub = hubMembers(libraryGames, game);
  const rep = hubRepresentative(hub);
  const title = hubTitle(hub);
  // Wishlist instances carry no playthrough or review, so they never belong in
  // the Journey/Review edition selector (issue 15d13b9a). Keep the whole hub
  // only when there's nothing owned to show (a purely-wishlisted title).
  const ownedForEditions = hub.filter((m) => m.status !== "wishlist");
  const editions = hubEditions(ownedForEditions.length > 0 ? ownedForEditions : hub);

  // The Journey/Review edition selection, shared across both tabs and seeded
  // by the clicked variant (a family member preselects its family's entry).
  const [editionKey, setEditionKey] = useState(() => editionKeyOf(editions, game.id));
  const selected =
    editions.find((e) => e.key === editionKey) ??
    editions.find((e) => e.key === editionKeyOf(editions, game.id)) ??
    editions[0];

  const tabs = readOnly
    ? GAME_TABS.filter((t) => t.visitorVisible || (t.id === "review" && hub.some(hasReview)))
    : GAME_TABS;
  const showBar = tabs.length > 1;
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  // The catalog's community screenshots (the representative's identity): shown
  // in the Overview gallery, and kept on the missing-platform suggestion's
  // baseline (Library) so approving that edit can never wipe them.
  const [screenshots, setScreenshots] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    if (cloud && (rep.rawgId || rep.catalogId)) {
      void fetchGameScreenshots({ rawgId: rep.rawgId, catalogId: rep.catalogId }).then(
        (s) => active && setScreenshots(s),
      );
    }
    return () => {
      active = false;
    };
  }, [cloud, rep.rawgId, rep.catalogId, fetchGameScreenshots]);

  const selector = (
    <EditionSelect
      editions={editions}
      value={selected.key}
      onChange={setEditionKey}
      hubTitle={title}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <BackButton onBack={onBack} />
        <div className="flex items-center gap-2">
          {pageNav && onNavigate && (
            <PageNavControls
              nav={pageNav}
              current={{ kind: "game", id: game.id }}
              onNavigate={onNavigate}
            />
          )}
          {!readOnly && (
            <GamePageMenu
              hub={hub}
              onBack={onBack}
              onManageInLibrary={() => setTab("library")}
              pageNav={pageNav}
              onNavigate={onNavigate}
            />
          )}
        </div>
      </div>

      {/* Universal hero: strictly the title-level identity — cover art, global
          title, like. Instance-specific state (status, score, platforms) lives
          in the Library rows and the tabs, so the page looks identical no
          matter which variant opened it or how many copies you own. */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="aspect-[16/9] w-full bg-panel">
          {rep.image ? (
            <img src={rep.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl opacity-50">🎮</div>
          )}
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 font-display text-2xl leading-tight tracking-tight text-ink">
              {title}
            </h1>
            <LikeButton game={rep} size={18} />
            {/* "Money Well Spent" for the whole hub — every edition's spend and
                hours together (issue 6c60c213). Owner-only: the badge itself
                bails while visiting. */}
            <GameValueBadge game={rep} members={hub} />
            {/* Visiting another player: if this game isn't in your own library
                yet, add it straight to your Wishlist from here (issue f015625a). */}
            {readOnly && <VisitWishlistButton game={rep} />}
          </div>
          {hub.length > 1 && (
            <HubStatsRow
              members={hub}
              hideSpend={hideSpend}
              onManage={readOnly ? undefined : () => setTab("library")}
            />
          )}
        </div>
      </section>

      {/* Co-op Pact strip (issue d57afe4f): the incoming invite, the active
          shared playthrough, or a recently-ended note for THIS card. Owner-only
          and soft-launched behind the social permission. */}
      {!readOnly && cloud && can("social.pacts") && <CoOpPactBanner game={game} />}

      {/* Section tabs (pill pattern shared with the admin console). */}
      {showBar && (
        <div role="tablist" aria-label="Game sections" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const isActive = active.id === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-brand bg-brand text-brand-fg shadow-sm"
                    : "border-line bg-panel text-muted hover:text-ink"
                }`}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      )}

      {readOnly ? (
        active.id === "review" ? (
          <div className="flex flex-col gap-3">
            {selector}
            {hasReview(selected.game) ? (
              <ReviewTab key={selected.game.id} game={selected.game} readOnly />
            ) : (
              <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
                No review on this edition.
              </p>
            )}
          </div>
        ) : active.id === "community" ? (
          <CommunityTab game={rep} />
        ) : (
          <ReadOnlyOverview game={rep} hideSpend={hideSpend} screenshots={screenshots} members={hub} />
        )
      ) : active.id === "overview" ? (
        <OverviewTab game={rep} screenshots={screenshots} members={hub} />
      ) : active.id === "journey" ? (
        <div className="flex flex-col gap-3">
          {selector}
          <JourneyTab key={selected.game.id} game={selected.game} />
        </div>
      ) : active.id === "review" ? (
        <div className="flex flex-col gap-3">
          {selector}
          <ReviewTab key={selected.game.id} game={selected.game} />
        </div>
      ) : active.id === "community" ? (
        <CommunityTab game={rep} />
      ) : (
        <LibraryTab hub={hub} screenshots={screenshots} screenshotsKey={catalogKey(rep)} />
      )}
    </div>
  );
}

/** The spec's "Select Edition" dropdown, shown atop Journey and Review when
 *  the hub holds more than one entry: historical data stays strictly on the
 *  record that earned it, so these tabs switch WHICH record they render. A
 *  Family Link folds into one entry rendering the primary member's data. */
function EditionSelect({
  editions,
  value,
  onChange,
  hubTitle: title,
}: {
  editions: HubEdition[];
  value: string;
  onChange: (key: string) => void;
  hubTitle: string;
}) {
  if (editions.length < 2) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
        <Layers size={13} className="text-accent/70" /> Edition
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select edition"
        className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none transition focus:border-brand sm:max-w-xs sm:flex-none"
      >
        {editions.map((e) => (
          <option key={e.key} value={e.key}>
            {editionLabel(e, title)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Combined Hours Played + Money Spent across every connected edition, plus
 *  the jump into the Library tab — the hub's instance control center (owner
 *  only). */
function HubStatsRow({
  members,
  hideSpend,
  onManage,
}: {
  members: Game[];
  hideSpend: boolean;
  onManage?: () => void;
}) {
  const stats = familyStats(members);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel/30 px-3 py-2">
      <div className="min-w-0">
        <div className="mb-0.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent">
          <Users size={13} /> {stats.count} editions in{" "}
          {onManage ? "your" : "their"} library
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock size={13} className="text-accent/70" /> {formatPlaytime(stats.totalPlayed)}{" "}
            played
          </span>
          {!hideSpend && stats.totalCost > 0 && (
            <span className="inline-flex items-center gap-1">
              <Banknote size={13} className="text-accent/70" /> {formatUsd(stats.totalCost)} spent
            </span>
          )}
        </div>
      </div>
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105"
        >
          <Package size={15} /> Manage in Library
        </button>
      )}
    </div>
  );
}
