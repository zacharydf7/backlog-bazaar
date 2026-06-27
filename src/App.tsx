import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  TriangleAlert,
  Lock,
  Gamepad2,
  ChevronLeft,
  Trophy,
  Timer,
  RotateCcw,
  Infinity as InfinityIcon,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "./store";
import { Avatar } from "./components/Avatar";
import { CoinIcon } from "./components/CoinIcon";
import { ViewingProvider } from "./lib/viewContext";
import { formatPlaytime } from "./lib/playtime";
import { activityLabel, isOnline, lastSeenLabel, resolveActivity } from "./lib/presence";
import {
  slotCapacity,
  generalUnitsUsed,
  playingUnits,
  slotCriteriaSummary,
  type SlotKind,
  type TargetedSlot,
} from "./lib/slots";
import { occupantKey } from "./lib/families";
import { Toasts } from "./components/Toasts";
import { UpdateBanner } from "./components/UpdateBanner";
import { MaintenancePage } from "./components/MaintenancePage";
import { GameCard } from "./components/GameCard";
import { AddGameModal } from "./components/AddGameModal";
import { OnboardingCoach } from "./components/OnboardingCoach";
import { AddCompilationModal } from "./components/AddCompilationModal";
import { Auth } from "./components/Auth";
import { Leaderboard } from "./components/Leaderboard";
import { AccountModal } from "./components/AccountModal";
import { IssueBoard } from "./components/IssueBoard";
import { Market } from "./components/Market";
import { BlockedPage } from "./components/BlockedPage";
import { MySubmissions } from "./components/MySubmissions";
import { MasterLedger } from "./components/MasterLedger";
import { TransactionLedger } from "./components/TransactionLedger";
import { AdminPage } from "./components/AdminPage";
import { ChartersModal } from "./components/ChartersModal";
import { ImportCelebration } from "./components/ImportCelebration";
import { ReleaseNotes } from "./components/ReleaseNotes";
import { AboutPage } from "./components/AboutPage";
import { PrivacyPage } from "./components/PrivacyPage";
import { Sidebar, MobileNav, TopBar, TABS, type View } from "./components/Sidebar";
import { TitleBadge } from "./components/TitleBadge";
import { BazaarToolbar } from "./components/BazaarToolbar";
import { GlobalSearchModal } from "./components/GlobalSearchModal";
import { filterByQuery, searchLibrary } from "./lib/librarySearch";
import {
  applyView,
  collectFacets,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  type Filters,
  type SortKey,
} from "./lib/bazaarView";
import { LATEST_RELEASE_ID, loadSeenReleaseId, markReleasesSeen } from "./lib/changelog";
import { parseHash, routeToHash, isAccountSwitch, type Route } from "./lib/route";
import type { Game, GameStatus } from "./types";

/** The game-library sections (everything else is a discovery/utility page). */
function isGameStatus(v: View): v is GameStatus {
  return v === "backlog" || v === "playing" || v === "finished" || v === "wishlist";
}

/** Views that belong to a player's collection, so navigating to them stays inside
 *  a visit: the game boards plus their unified Master Ledger. Anything else (a
 *  utility/discovery page) ends the visit and returns you to your own account. */
function isVisitView(v: View): boolean {
  return isGameStatus(v) || v === "master-ledger";
}

export default function App() {
  const {
    cloud,
    ready,
    userId,
    games,
    error,
    clearMessages,
    init,
    maintenance,
    maintenanceMessage,
    maintenanceFlag,
    setMaintenance,
    isAdmin,
    can,
    generalSlots,
    myTargetedSlots,
    blocked,
    blockedReason,
    defaultCoin,
    economy,
    viewing,
    openUserBazaar,
    closeUserBazaar,
    pingPresence,
    activityOverride,
    refreshSubmissionCount,
    chartersOpen,
  } = useStore();
  // Seed the page from the URL hash up front (not "backlog" then corrected by an
  // effect) so a refresh on e.g. the Leaderboard doesn't briefly broadcast an "In
  // the Bazaar" presence ping that can race the real one. Visits are restored by
  // the routing effect below once authed.
  const [view, setView] = useState<View>(() => {
    const r = parseHash(window.location.hash);
    return r.kind === "view" ? r.view : "backlog";
  });
  const [adding, setAdding] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addingCompilation, setAddingCompilation] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // Universal search: the live query (filters the active board and feeds the
  // global results modal), whether that modal is open, and a one-shot request to
  // open a specific game's card (set when a result is picked).
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusGame, setFocusGame] = useState<{ id: string; key: number } | null>(null);
  const [featuresRequestId, setFeaturesRequestId] = useState<string | undefined>(undefined);
  // Bumped on every issue-notification click so re-clicking the *same* request
  // (e.g. after closing its detail) still re-opens it — the id alone wouldn't
  // change, so the board's effect would otherwise ignore the repeat.
  const [featuresFocusKey, setFeaturesFocusKey] = useState(0);
  const [mySubmissionId, setMySubmissionId] = useState<string | undefined>(undefined);
  const [seenReleaseId, setSeenReleaseId] = useState<string | null>(() => loadSeenReleaseId());

  function openReleaseNotes() {
    markReleasesSeen();
    setSeenReleaseId(LATEST_RELEASE_ID);
    closeUserBazaar();
    setView("whatsnew");
  }

  // Route a notification's link to the right page. Supported:
  //   "features" / "features:<id>"        → the Requests board (+ that request)
  //   "mysubmissions" / "mysubmissions:<id>" → My contributions (+ that item)
  function openNotificationLink(link: string) {
    if (link === "features" || link.startsWith("features:")) {
      const id = link.startsWith("features:") ? link.slice("features:".length) : undefined;
      setFeaturesRequestId(id || undefined);
      setFeaturesFocusKey((k) => k + 1);
      closeUserBazaar();
      setView("requests");
    } else if (link === "mysubmissions" || link.startsWith("mysubmissions:")) {
      const id = link.startsWith("mysubmissions:") ? link.slice("mysubmissions:".length) : undefined;
      setMySubmissionId(id || undefined);
      closeUserBazaar();
      setView("mysubmissions");
    }
  }

  useEffect(() => {
    void init();
  }, [init]);

  // Keep the browser tab icon in sync with the admin-chosen coin skin.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (link) link.href = `/coins/${defaultCoin}.svg`;
  }, [defaultCoin]);

  // When visiting another player's Bazaar, the boards are sourced from their
  // (read-only) library snapshot instead of your own games.
  const boardGames = viewing ? viewing.games : games;

  // Linked editions are decentralized: each one is its own card on the board
  // matching its own status (a finished old edition stays on Finished while a
  // now-playing port sits on Now Playing). Counts reflect individual games.
  const counts = useMemo(() => {
    const c: Record<GameStatus, number> = { backlog: 0, playing: 0, finished: 0, wishlist: 0 };
    for (const g of boardGames) c[g.status]++;
    return c;
  }, [boardGames]);

  // Games on the current board, before slicing/sorting — drives the facet lists
  // and the "X of Y" count in the toolbar.
  const boardGamesForView = useMemo(
    () => boardGames.filter((g) => g.status === view),
    [boardGames, view],
  );
  const facets = useMemo(() => collectFacets(boardGamesForView), [boardGamesForView]);
  // The slicers/sort, then the live header search query, narrow the board so the
  // requested game jumps to the front as you type.
  const visibleGames = useMemo(
    () => filterByQuery(applyView(boardGamesForView, sortKey, filters, economy), searchQuery),
    [boardGamesForView, sortKey, filters, economy, searchQuery],
  );

  // The global results: every matching game across all boards (current library —
  // your own, or the player you're visiting), for the search overlay.
  const searchResults = useMemo(
    () => searchLibrary(boardGames, searchQuery),
    [boardGames, searchQuery],
  );

  // Reset slicers when switching boards — a platform/genre that exists on one
  // board may hide everything on another, which would be confusing.
  useEffect(() => {
    setFilters(EMPTY_FILTERS);
  }, [view]);

  // Raw playing games (every edition) for the Now Playing slot meter.
  const playing = useMemo(() => games.filter((g) => g.status === "playing"), [games]);

  // Entering a visit always lands on their Bazaar board, with a fresh search (a
  // query scoped to your library shouldn't carry into theirs, or vice versa).
  useEffect(() => {
    if (viewing) setView("backlog");
    setSearchQuery("");
    setSearchOpen(false);
  }, [viewing?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Presence heartbeat: broadcast that we're active + what we're doing. Re-pings
  // on navigation, every ~45s while the tab is visible, and when refocused;
  // a hidden/closed tab simply stops pinging and ages out to "offline".
  const activity = viewing ? "visiting" : view;
  useEffect(() => {
    if (!cloud || !userId) return;
    // Admins can pin a custom status that overrides the auto, navigation-derived
    // one; everyone else (and admins who haven't set one) gets the auto label.
    const label = isAdmin
      ? resolveActivity(activityOverride, activityLabel(activity))
      : activityLabel(activity);
    const ping = () => {
      if (document.visibilityState === "visible") void pingPresence(label);
    };
    ping();
    const id = window.setInterval(ping, 45_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [activity, cloud, userId, pingPresence, isAdmin, activityOverride]);

  // Keep the admin Submissions badge fresh: load on sign-in and poll, so new
  // contributions to review surface without a manual refresh. Only for users who
  // can moderate a queue (the RPC also self-scopes the count).
  const canSeeSubmissions =
    can("submissions.games.moderate") || can("submissions.compilations.moderate");
  useEffect(() => {
    if (!cloud || !canSeeSubmissions) return;
    void refreshSubmissionCount();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshSubmissionCount();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [cloud, canSeeSubmissions, refreshSubmissionCount]);

  // --- Hash routing -------------------------------------------------------
  // Keep the URL in sync with the current page so Back and refresh both work
  // (the page otherwise lives only in `view`/`viewing`). Pure parsing lives in
  // lib/route.ts; these effects bridge it to the History API.
  const viewingUserId = viewing?.userId ?? null;
  const routeReadyRef = useRef(false);
  // The last signed-in account, to detect an account switch (vs. a reload of the
  // same session).
  const lastAccountRef = useRef<string | null>(null);

  // Apply a Route from the URL to app state. Reads `viewing` live (via getState)
  // so it can be a stable callback without re-subscribing.
  const applyRoute = useCallback(
    (route: Route) => {
      if (route.kind === "visit") {
        if (useStore.getState().viewing?.userId !== route.userId) {
          void openUserBazaar(route.userId);
        }
      } else {
        if (useStore.getState().viewing) closeUserBazaar();
        setView(route.view);
      }
    },
    [openUserBazaar, closeUserBazaar],
  );

  // On first load, restore the page from the URL once ready. A visit waits until
  // the user is signed in (cloud mode); a plain page applies immediately.
  useEffect(() => {
    if (routeReadyRef.current || !ready) return;
    const route = parseHash(window.location.hash);
    if (route.kind === "visit" && cloud && !userId) return; // wait for auth
    applyRoute(route);
    routeReadyRef.current = true;
  }, [ready, cloud, userId, applyRoute]);

  // Back/forward (and manual hash edits) re-apply the URL. Idempotent, so it's
  // safe even though both events can fire for one navigation.
  useEffect(() => {
    const onNav = () => applyRoute(parseHash(window.location.hash));
    window.addEventListener("popstate", onNav);
    window.addEventListener("hashchange", onNav);
    return () => {
      window.removeEventListener("popstate", onNav);
      window.removeEventListener("hashchange", onNav);
    };
  }, [applyRoute]);

  // State -> URL: push a history entry whenever the page changes. pushState does
  // not fire pop/hashchange, so this never loops; when a change came *from* the
  // URL the desired hash already matches and we skip the push.
  useEffect(() => {
    if (!routeReadyRef.current) return;
    const route: Route = viewingUserId
      ? { kind: "visit", userId: viewingUserId }
      : { kind: "view", view };
    const desired = routeToHash(route);
    const current = window.location.hash;
    const atHome = desired === "" && (current === "" || current === "#");
    if (desired !== current && !atHome) {
      // An empty desired hash means home — drop the "#…" entirely.
      const url = desired || window.location.pathname + window.location.search;
      window.history.pushState(null, "", url);
    }
  }, [view, viewingUserId]);

  // On an account switch — signing into a *different* account than the last one —
  // always land on the home board, so you never inherit the previous account's
  // page (which may be admin-only or otherwise off-limits). The first sign-in of a
  // session is skipped, so a reload or deep-link still restores the saved page.
  useEffect(() => {
    if (!userId) return; // ignore the signed-out gap between accounts
    const prev = lastAccountRef.current;
    lastAccountRef.current = userId;
    if (isAccountSwitch(prev, userId)) {
      if (useStore.getState().viewing) closeUserBazaar();
      setView("backlog");
    }
  }, [userId, closeUserBazaar]);

  if (!ready) {
    return (
      <div className="flex min-h-full items-center justify-center text-subtle">Loading…</div>
    );
  }

  // Admins (and anyone who can toggle maintenance, so they don't lock themselves
  // out) always get through; everyone else sees the closed page during maintenance.
  if (maintenance && !isAdmin && !can("site.maintenance")) {
    return <MaintenancePage message={maintenanceMessage} />;
  }

  // In cloud mode you must be signed in.
  if (cloud && !userId) {
    return <Auth />;
  }

  // A blocked/banned user is locked out of the app.
  if (cloud && blocked) {
    return <BlockedPage reason={blockedReason} />;
  }

  // Navigation that's visit-aware: switching between game boards while visiting
  // someone keeps you in their Bazaar; going anywhere else ends the visit.
  const navigate = (v: View) => {
    if (viewing && !isVisitView(v)) closeUserBazaar();
    setView(v);
  };

  // Open Add game with the title field seeded (used by the search empty-state and
  // the plain Add button, which passes no seed).
  const openAdd = (seed = "") => {
    setAddQuery(seed);
    setAdding(true);
  };

  // Picking a search result: jump to that game's board and pop its card open.
  const openSearchResult = (g: Game) => {
    setSearchOpen(false);
    navigate(g.status);
    setFocusGame({ id: g.id, key: Date.now() });
  };

  const chrome = {
    view,
    setView: navigate,
    seenReleaseId,
    searchQuery,
    onSearchChange: setSearchQuery,
    onOpenSearch: () => setSearchOpen(true),
    onAdd: () => openAdd(),
    onAddCompilation: () => setAddingCompilation(true),
    onMasterLedger: () => navigate("master-ledger"),
    onTransactionLedger: () => navigate("transaction-ledger"),
    onLeaderboard: () => navigate("leaderboard"),
    onRequests: () => {
      setFeaturesRequestId(undefined);
      navigate("requests");
    },
    // Open the admin console on the Users tab; Settings is its own tab (#admin).
    onAdmin: () => navigate("users"),
    onMySubmissions: () => navigate("mysubmissions"),
    onAccount: () => navigate("account"),
    onReleaseNotes: openReleaseNotes,
    onAbout: () => navigate("about"),
    onPrivacy: () => navigate("privacy"),
    onNotificationNavigate: openNotificationLink,
  };

  return (
    <div className="min-h-full">
      <Sidebar {...chrome} />
      {/* Full-height column so the footer is pushed to the bottom of the viewport
          even on short pages (the content wrapper below grows to fill). */}
      <div className="flex min-h-dvh flex-col md:pl-64">
        <MobileNav {...chrome} />
        <TopBar {...chrome} />
        <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 pb-24 pt-6 md:px-6 md:pb-16">
        <div className="flex-1">
        {/* Admin: site is closed to everyone else */}
        {(isAdmin || can("site.maintenance")) && maintenanceFlag && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/50 bg-brand/10 px-4 py-2 text-sm text-accent">
            <span className="inline-flex items-center gap-2">
              <TriangleAlert size={16} /> Maintenance is ON — the live site is closed to
              everyone but you.
            </span>
            <button
              onClick={() => setMaintenance(false, maintenanceMessage)}
              className="rounded-md border border-line px-2 py-1 text-xs transition hover:bg-panel"
            >
              Turn off
            </button>
          </div>
        )}

        {/* Global error banner */}
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
            <span>{error}</span>
            <button onClick={clearMessages} className="opacity-70 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {!cloud && (
          <div className="mb-4 rounded-xl border border-line bg-surface px-4 py-2 text-xs text-muted">
            Running locally without an account. Add Supabase keys to <code>.env</code> to enable
            sign-in, sync, and the leaderboard.
          </div>
        )}

        {/* When visiting another player, a prominent themed banner so it's never
            ambiguous whose Bazaar you're looking at. */}
        {viewing && <ViewingBanner onLeave={closeUserBazaar} />}

        {/* Current section heading (the page title now lives in the sidebar).
            Game sections get a simple heading; the page views render their own. */}
        {isGameStatus(view) && (
          <div className="mb-5 flex items-center gap-2.5">
            <h2 className="font-display text-2xl tracking-tight text-ink">
              {viewing
                ? `${viewing.displayName}'s ${TABS.find((t) => t.id === view)?.label}`
                : TABS.find((t) => t.id === view)?.label}
            </h2>
            <span className="rounded-full bg-line px-2 py-0.5 text-xs font-medium text-subtle">
              {counts[view]}
            </span>
          </div>
        )}

        {view === "market" ? (
          <Market />
        ) : view === "master-ledger" ? (
          <MasterLedger searchQuery={searchQuery} onClearSearch={() => setSearchQuery("")} />
        ) : view === "transaction-ledger" ? (
          <TransactionLedger />
        ) : view === "leaderboard" ? (
          <Leaderboard />
        ) : view === "requests" ? (
          <IssueBoard initialRequestId={featuresRequestId} focusKey={featuresFocusKey} />
        ) : view === "account" ? (
          <AccountModal />
        ) : view === "admin" ||
          view === "users" ||
          view === "slots" ||
          view === "economy" ||
          view === "submissions" ||
          view === "catalog" ||
          view === "stats" ||
          view === "roles" ? (
          <AdminPage view={view} onNavigate={navigate} />
        ) : view === "mysubmissions" ? (
          <MySubmissions initialId={mySubmissionId} />
        ) : view === "whatsnew" ? (
          <ReleaseNotes />
        ) : view === "about" ? (
          <AboutPage />
        ) : view === "privacy" ? (
          <PrivacyPage />
        ) : (
          <ViewingProvider
            value={{ readOnly: viewing != null, hideSpend: viewing?.hideSpend ?? false }}
          >
            {view === "playing" && !viewing && (
              <NowPlayingSlots
                generalSlots={generalSlots}
                grants={myTargetedSlots}
                playing={playing}
              />
            )}

            {boardGamesForView.length > 0 && (
              <BazaarToolbar
                sortKey={sortKey}
                onSortChange={setSortKey}
                filters={filters}
                onFiltersChange={setFilters}
                facets={facets}
                total={boardGamesForView.length}
                shown={visibleGames.length}
              />
            )}

            {boardGamesForView.length === 0 ? (
              viewing ? (
                <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
                  {viewing.displayName} has nothing here yet.
                </div>
              ) : (
                <EmptyState
                  tab={view}
                  onAdd={() => setAdding(true)}
                  onAbout={() => setView("about")}
                />
              )
            ) : visibleGames.length === 0 ? (
              searchQuery.trim() ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
                  <p className="font-display text-xl text-ink">
                    No {TABS.find((t) => t.id === view)?.label} games match “{searchQuery.trim()}”
                  </p>
                  <p className="max-w-md text-sm text-muted">
                    It may be on another board — open the search to look across your whole library.
                  </p>
                  <div className="mt-1 flex flex-wrap justify-center gap-2">
                    <button
                      onClick={() => setSearchOpen(true)}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105"
                    >
                      Search all boards
                    </button>
                    <button
                      onClick={() => setSearchQuery("")}
                      className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel"
                    >
                      Clear search
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
                  <p className="font-display text-xl text-ink">No games match your filters</p>
                  <p className="max-w-md text-sm text-muted">
                    Try removing a filter to widen your search.
                  </p>
                  <button
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="mt-1 rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel"
                  >
                    Clear filters
                  </button>
                </div>
              )
            ) : (
              <div
                key={view}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                <AnimatePresence mode="popLayout">
                  {visibleGames.map((g) => (
                    <motion.div
                      key={g.id}
                      layout
                      className="h-full"
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.18 }}
                    >
                      <GameCard
                        game={g}
                        autoOpenKey={focusGame?.id === g.id ? focusGame.key : 0}
                        onAutoOpened={() => setFocusGame(null)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </ViewingProvider>
        )}
        </div>

        <footer className="mt-12 border-t border-line pt-6 text-center text-xs text-subtle">
          © 2026 Backlog Bazaar. All rights reserved.
        </footer>
        </main>
      </div>

      {/* Universal search overlay — your own library, or the player you're
          visiting (already privacy-filtered server-side). Only your own profile
          gets the "Add game" empty-state shortcut. */}
      {searchOpen && (
        <GlobalSearchModal
          query={searchQuery}
          onQueryChange={setSearchQuery}
          results={searchResults}
          onPick={openSearchResult}
          onClose={() => setSearchOpen(false)}
          onAddGame={viewing ? undefined : (q) => {
            setSearchOpen(false);
            openAdd(q);
          }}
          visitingName={viewing?.displayName ?? null}
        />
      )}
      {adding && (
        <AddGameModal
          onClose={() => setAdding(false)}
          initialQuery={addQuery}
          // Default the destination to the board you opened it from (Wishlist /
          // Finished / Bazaar); anywhere else falls back to the Bazaar.
          defaultDestination={view === "wishlist" || view === "finished" ? view : "backlog"}
        />
      )}
      {addingCompilation && (
        <AddCompilationModal
          onClose={() => setAddingCompilation(false)}
          defaultDestination={view === "wishlist" || view === "finished" ? view : "backlog"}
        />
      )}
      {chartersOpen && <ChartersModal />}
      {/* Onboarding walkthrough — only for a signed-in player on their own Bazaar. */}
      {cloud && userId && !viewing && (
        <OnboardingCoach
          onHowItWorks={() => navigate("about")}
          onNavigate={(v) => navigate(v as View)}
        />
      )}
      <ImportCelebration />
      <Toasts />
      <UpdateBanner />
    </div>
  );
}

// The "you're visiting someone else's Bazaar" banner. Themed (it renders inside
// the visited user's theme) and unmistakable, with their key stats and a clear
// way back to your own pages.
function ViewingBanner({ onLeave }: { onLeave: () => void }) {
  const viewing = useStore((s) => s.viewing);
  if (!viewing) return null;
  const online = isOnline(viewing.lastSeenAt);
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/40 bg-brand/10 p-3 sm:p-4">
      <Avatar url={viewing.avatarUrl} name={viewing.displayName} size={44} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-accent/80">You&apos;re visiting</p>
        <h2 className="truncate font-display text-lg leading-tight text-ink sm:text-xl">
          {viewing.displayName}&apos;s Backlog Bazaar
        </h2>
        {viewing.title && (
          <div className="mt-1">
            <TitleBadge badge={viewing.title} />
          </div>
        )}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          {online ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <span className="h-2 w-2 rounded-full bg-success" />
              {viewing.activity ?? "Online"}
            </span>
          ) : (
            lastSeenLabel(viewing.lastSeenAt) && (
              <span className="text-subtle">{lastSeenLabel(viewing.lastSeenAt)}</span>
            )
          )}
          <span className="inline-flex items-center gap-1">
            <CoinIcon size={12} /> {viewing.coins}
          </span>
          <span className="inline-flex items-center gap-1">
            <Trophy size={12} className="text-accent/70" /> {viewing.gamesFinished} finished
          </span>
          {viewing.hoursFinished > 0 && (
            <span className="text-subtle">{formatPlaytime(viewing.hoursFinished)} cleared</span>
          )}
        </p>
      </div>
      <button
        onClick={onLeave}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:bg-panel"
      >
        <ChevronLeft size={16} /> Leave
      </button>
    </div>
  );
}


// Per-slot-kind presentation (icon + short label) for the Now Playing board.
const SLOT_KIND_META: Record<SlotKind | "general", { icon: LucideIcon; label: string }> = {
  general: { icon: Gamepad2, label: "General" },
  standard: { icon: Timer, label: "Targeted" },
  endless: { icon: InfinityIcon, label: "Endless" },
  replay: { icon: RotateCcw, label: "Replay" },
};

/** A single slot to render on the board: its identity, what it accepts, and the
 *  game (if any) currently occupying it. */
interface SlotView {
  key: string;
  kind: SlotKind | "general";
  name: string;
  sub: string;
  occupant: Game | null;
  overflow?: boolean; // a unit beyond general capacity (admin lowered the count)
}

// One representative game per distinct occupant unit (a linked family counts once).
function representativeOccupants(games: Game[]): Game[] {
  const seen = new Set<string>();
  const reps: Game[] = [];
  for (const g of games) {
    const k = occupantKey(g);
    if (seen.has(k)) continue;
    seen.add(k);
    reps.push(g);
  }
  return reps;
}

// A single slot card: kind icon + name, the occupying game (cover + title) or an
// "Open" affordance, and the slot's rule. Richer than a flat chip so the board
// reads as a set of "bays" you fill.
function SlotCard({ slot }: { slot: SlotView }) {
  const meta = SLOT_KIND_META[slot.kind];
  const Icon = slot.overflow ? TriangleAlert : meta.icon;
  const filled = slot.occupant != null;
  const tone = slot.overflow
    ? "border-danger/40 bg-danger/5"
    : filled
      ? "border-brand/40 bg-brand/5"
      : "border-dashed border-line bg-panel/40";

  return (
    <div className={"flex min-w-[140px] flex-1 flex-col gap-1.5 rounded-xl border p-2.5 transition " + tone}>
      <div className="flex items-center justify-between gap-1">
        <span
          className={
            "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide " +
            (slot.overflow ? "text-danger" : filled ? "text-accent" : "text-muted")
          }
        >
          <Icon size={12} /> {slot.overflow ? "Over limit" : meta.label}
        </span>
        <span
          className={
            "h-1.5 w-1.5 rounded-full " +
            (slot.overflow ? "bg-danger" : filled ? "bg-brand" : "bg-line")
          }
        />
      </div>

      {filled ? (
        <div className="flex items-center gap-2">
          <div className="h-9 w-7 shrink-0 overflow-hidden rounded-md border border-line bg-panel">
            {slot.occupant!.image && (
              <img src={slot.occupant!.image} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            {slot.occupant!.title}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-subtle">
          <div className="flex h-9 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-line">
            <span className="text-base leading-none text-subtle">+</span>
          </div>
          <span>Open</span>
        </div>
      )}

      <div className="truncate text-[10px] text-subtle">
        {slot.name}
        {slot.kind !== "general" && <span className="opacity-70"> · {slot.sub}</span>}
      </div>
    </div>
  );
}

// The Now Playing slot meter: a card per slot (general + targeted) showing what's
// in use. You can't start a new game without an open slot, so this makes the cap
// — and which slots are free, and what each accepts — visible at a glance.
function NowPlayingSlots({
  generalSlots,
  grants,
  playing,
}: {
  generalSlots: number;
  grants: TargetedSlot[];
  playing: Game[];
}) {
  const general = slotCapacity(generalSlots);
  // Representative occupant per general unit (a linked family counts once).
  const generalReps = representativeOccupants(playing.filter((g) => !g.slotId));

  const generalCards: SlotView[] = Array.from({ length: general }).map((_, i) => ({
    key: `gen-${i}`,
    kind: "general",
    name: "Any game",
    sub: "any game",
    occupant: generalReps[i] ?? null,
  }));
  // Units beyond general capacity (e.g. after an admin lowered it) stay visible.
  const overflowCards: SlotView[] = generalReps.slice(general).map((g, i) => ({
    key: `over-${i}`,
    kind: "general",
    name: "Beyond your general capacity",
    sub: "general",
    occupant: g,
    overflow: true,
  }));
  const targetedCards: SlotView[] = grants.map((t) => ({
    key: t.id,
    kind: t.definition.kind,
    name: t.definition.name,
    sub: slotCriteriaSummary(t.definition),
    occupant: playing.find((g) => g.slotId === t.id) ?? null,
  }));

  const cards = [...generalCards, ...overflowCards, ...targetedCards];
  const totalUsed = playingUnits(playing);
  const capacity = general + grants.length;
  const allFull = totalUsed >= capacity;

  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          {allFull ? (
            <Lock size={15} className="text-accent" />
          ) : (
            <Gamepad2 size={15} className="text-accent" />
          )}
          Now Playing slots
        </span>
        <span
          className={
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium " +
            (allFull ? "bg-danger/10 text-danger" : "bg-brand/10 text-accent")
          }
        >
          {totalUsed} / {capacity} in use
          <span className="font-normal opacity-80">
            {allFull ? " · full" : ` · ${capacity - totalUsed} open`}
          </span>
        </span>
      </div>
      {cards.length === 0 ? (
        <p className="text-xs text-subtle">No slots — ask an admin for one.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((c) => (
            <SlotCard key={c.key} slot={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  tab,
  onAdd,
  onAbout,
}: {
  tab: GameStatus;
  onAdd: () => void;
  onAbout: () => void;
}) {
  const copy: Record<GameStatus, { title: string; body: string }> = {
    backlog: {
      title: "Your Bazaar is empty",
      body: "Add games you want to play. Each one gets a coin price based on how new, long, and well-rated it is.",
    },
    playing: {
      title: "Nothing in progress",
      body: "Head to the Bazaar and buy a game to start playing it.",
    },
    finished: {
      title: "No trophies yet",
      body: "Finish a game you're playing to earn coins and add it to your shelf.",
    },
    wishlist: {
      title: "Your wishlist is empty",
      body: "Games you can't play yet — no console, or want to buy in real life. Add them from The Caravan with the ♡ button.",
    },
  };
  const c = copy[tab];
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <p className="font-display text-xl text-ink">{c.title}</p>
      <p className="max-w-md text-sm text-muted">{c.body}</p>
      {tab === "backlog" && (
        <>
          <button
            onClick={onAdd}
            className="mt-2 rounded-xl bg-brand px-4 py-2 font-semibold text-brand-fg shadow-sm transition hover:brightness-105"
          >
            + Add your first game
          </button>
          <button
            onClick={onAbout}
            className="text-xs text-subtle underline-offset-2 transition hover:text-accent hover:underline"
          >
            New here? See how it works
          </button>
        </>
      )}
    </div>
  );
}
