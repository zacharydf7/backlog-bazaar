import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Clock, Banknote, Heart, Layers, Map, Package, Star, Users, type LucideIcon } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { neighbors, type PageNav } from "../../lib/pageNav";
import { ViewingProvider } from "../../lib/viewContext";
import { gameToAddMeta } from "../../lib/addRouting";
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
  /** Retarget the page to another game id (a Prev/Next step). */
  onNavigate?: (id: string) => void;
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

/** Step to the previous/next game in the board you opened this page from (issue
 *  7ad49282). Hidden when the current game isn't in the sequence (e.g. reached by
 *  search) or the board holds only one game. Ends of the list disable the button
 *  rather than wrapping, so the position caption always reads truthfully. */
function PageNavControls({
  nav,
  currentId,
  onNavigate,
}: {
  nav: PageNav;
  currentId: string;
  onNavigate: (id: string) => void;
}) {
  const { prev, next, position, total } = neighbors(nav.ids, currentId);
  if (position === 0 || total <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-subtle">
        {position} of {total}
        <span className="hidden sm:inline"> · {nav.label}</span>
      </span>
      <div className="inline-flex overflow-hidden rounded-lg border border-line">
        <button
          type="button"
          onClick={() => prev && onNavigate(prev)}
          disabled={!prev}
          aria-label={`Previous game in ${nav.label}`}
          className="inline-flex items-center gap-1 bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline">Prev</span>
        </button>
        <button
          type="button"
          onClick={() => next && onNavigate(next)}
          disabled={!next}
          aria-label={`Next game in ${nav.label}`}
          className="inline-flex items-center gap-1 border-l border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
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
  onNavigate?: (id: string) => void;
}) {
  const { cloud, fetchGameScreenshots } = useStore();
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
        {pageNav && onNavigate && (
          <PageNavControls nav={pageNav} currentId={game.id} onNavigate={onNavigate} />
        )}
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
