import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  TriangleAlert,
  Lock,
  Gamepad2,
  ChevronLeft,
  Trophy,
  Target,
  RotateCcw,
  CalendarClock,
  Infinity as InfinityIcon,
  UserPlus,
  UserCheck,
  UserMinus,
  Mail,
  Flag,
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
  laneSectionSub,
  partitionByLane,
  laneGames,
  type Lane,
} from "./lib/slots";
import { rotationResetSummary, formatResetCountdown } from "./lib/rotation";
import { occupantKey } from "./lib/families";
import { dedupeOwnership } from "./lib/ownershipMerge";
import { Toasts } from "./components/Toasts";
import { ReportModal } from "./components/ReportModal";
import { PostGameRoutingModal } from "./components/PostGameRoutingModal";
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
import { ProfileHub } from "./components/ProfileHub";
import { BlockedPage } from "./components/BlockedPage";
import { MySubmissions } from "./components/MySubmissions";
import { MasterLedger } from "./components/MasterLedger";
import { TransactionLedger } from "./components/TransactionLedger";
import { AdminPage } from "./components/AdminPage";
import { ChartersModal } from "./components/ChartersModal";
import { InboxDrawer, type InboxTab } from "./components/InboxDrawer";
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
  EMPTY_FILTERS,
  loadSortPref,
  saveSortPref,
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
  return isGameStatus(v) || v === "master-ledger" || v === "profile";
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
    refreshReportCount,
    fetchUnreadMessageCount,
    fetchFriendRequests,
    fetchNotifications,
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
  // Seed from the saved preference so a chosen order survives a refresh.
  const [sortKey, setSortKey] = useState<SortKey>(loadSortPref);
  // Persist the choice whenever the player picks a new order.
  const changeSort = useCallback((k: SortKey) => {
    setSortKey(k);
    saveSortPref(k);
  }, []);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // Universal search: the live query (filters the active board and feeds the
  // global results modal), whether that modal is open, and a one-shot request to
  // open a specific game's card (set when a result is picked).
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusGame, setFocusGame] = useState<{ id: string; key: number } | null>(null);
  // The game card briefly ringed after you click its slot in the Now Playing
  // summary, so the eye lands on it once we've scrolled there. Cleared on a timer.
  const [highlightGameId, setHighlightGameId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const [featuresRequestId, setFeaturesRequestId] = useState<string | undefined>(undefined);
  // Bumped on every issue-notification click so re-clicking the *same* request
  // (e.g. after closing its detail) still re-opens it — the id alone wouldn't
  // change, so the board's effect would otherwise ignore the repeat.
  const [featuresFocusKey, setFeaturesFocusKey] = useState(0);
  const [mySubmissionId, setMySubmissionId] = useState<string | undefined>(undefined);
  const [seenReleaseId, setSeenReleaseId] = useState<string | null>(() => loadSeenReleaseId());
  // The unified inbox (Alerts / Messages / Friends) is overlay state, like the old
  // notification panel — not a routed page. `null` = closed.
  const [inbox, setInbox] = useState<{
    tab: InboxTab;
    compose: { id: string; name: string } | null;
  } | null>(null);
  // Open the inbox to a tab, optionally straight into composing to a friend.
  const openInbox = useCallback(
    (opts?: { tab?: InboxTab; compose?: { id: string; name: string } }) => {
      const compose = opts?.compose ?? null;
      setInbox({ tab: opts?.tab ?? (compose ? "messages" : "alerts"), compose });
    },
    [],
  );

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
      setInbox(null); // routing to a page — leave the inbox overlay behind
      setView("requests");
    } else if (link === "mysubmissions" || link.startsWith("mysubmissions:")) {
      const id = link.startsWith("mysubmissions:") ? link.slice("mysubmissions:".length) : undefined;
      setMySubmissionId(id || undefined);
      closeUserBazaar();
      setInbox(null);
      setView("mysubmissions");
    } else if (link === "social") {
      // Stay in the inbox, switch to the Friends tab.
      openInbox({ tab: "friends" });
    } else if (link === "messages") {
      openInbox({ tab: "messages" });
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
  // (read-only) library snapshot instead of your own games. Overlapping ownership
  // is folded here (dedupeOwnership): when a game is owned both standalone and
  // inside a compilation, the compilation copy is dropped from the board so the
  // pair renders as one unified card on the standalone master's board. Purely a
  // view transform — the underlying records are untouched.
  const boardGames = useMemo(
    () => dedupeOwnership(viewing ? viewing.games : games),
    [viewing, games],
  );

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

  // Playing games for the Now Playing slot meter — deduped like the boards so a
  // game owned both standalone and in a compilation counts once (every edition is
  // otherwise its own occupant).
  const playing = useMemo(
    () => dedupeOwnership(games).filter((g) => g.status === "playing"),
    [games],
  );

  // Entering a visit lands on the player's Profile Hub (their public identity), with
  // a fresh search (a query scoped to your library shouldn't carry into theirs).
  useEffect(() => {
    if (viewing) setView("profile");
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

  // Same for the admin Reports badge: load on sign-in and poll, for moderators.
  const canSeeReports = can("reports.moderate");
  useEffect(() => {
    if (!cloud || !canSeeReports) return;
    void refreshReportCount();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshReportCount();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [cloud, canSeeReports, refreshReportCount]);

  // Keep the inbox badges (unread messages, incoming friend requests, and
  // notifications) fresh without a manual refresh. Messaging isn't real-time, but
  // this shortens the loop: refetch the moment you return to the tab, and poll while
  // it's visible. These are cheap counts / one page of notifications.
  useEffect(() => {
    if (!cloud || !userId) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void fetchUnreadMessageCount();
      void fetchFriendRequests();
      void fetchNotifications();
    };
    refresh();
    const id = window.setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [cloud, userId, fetchUnreadMessageCount, fetchFriendRequests, fetchNotifications]);

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

  // Smoothly scroll a board element into view by its anchor id (waiting a frame so
  // a just-rendered section/card exists in the DOM).
  const scrollToAnchor = (id: string, block: ScrollLogicalPosition) => {
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block }),
    );
  };

  // Clicking a filled slot in the Now Playing summary: scroll to that game's card
  // on the board below and ring it briefly (without popping its detail open).
  const jumpToBoardGame = (gameId: string) => {
    scrollToAnchor(boardGameAnchor(gameId), "center");
    setHighlightGameId(gameId);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightGameId(null), 1600);
  };

  // Clicking a lane header in the summary: scroll to that board section.
  const jumpToBoardSection = (anchorId: string) => scrollToAnchor(anchorId, "start");

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
    onProfile: () => navigate("profile"),
    onReleaseNotes: openReleaseNotes,
    onAbout: () => navigate("about"),
    onPrivacy: () => navigate("privacy"),
    onOpenInbox: (tab?: InboxTab) => openInbox(tab ? { tab } : undefined),
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
        {viewing && (
          <ViewingBanner
            onLeave={closeUserBazaar}
            onMessage={(id, name) => openInbox({ compose: { id, name } })}
          />
        )}

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

        {view === "profile" ? (
          <ProfileHub onOpenTab={navigate} />
        ) : view === "market" ? (
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
          view === "taxonomy" ||
          view === "reports" ||
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
                playing={playing}
                onJumpToGame={jumpToBoardGame}
                onJumpToSection={jumpToBoardSection}
              />
            )}

            {boardGamesForView.length > 0 && (
              <BazaarToolbar
                sortKey={sortKey}
                onSortChange={changeSort}
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
            ) : view === "playing" ? (
              <PlayingBoard
                games={visibleGames}
                ownerName={viewing?.displayName ?? null}
                focusGame={focusGame}
                highlightId={highlightGameId}
                onAutoOpened={() => setFocusGame(null)}
              />
            ) : (
              <GameGrid
                games={visibleGames}
                gridKey={view}
                focusGame={focusGame}
                onAutoOpened={() => setFocusGame(null)}
              />
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
      {cloud && inbox && (
        <InboxDrawer
          // Re-key on tab/compose so a notification that targets another tab (or a
          // friend's "Message") re-opens the drawer on the right tab/thread.
          key={inbox.tab + (inbox.compose?.id ?? "")}
          onClose={() => setInbox(null)}
          onVisit={(id) => void openUserBazaar(id)}
          onNotificationNavigate={openNotificationLink}
          initialTab={inbox.tab}
          initialCompose={inbox.compose}
        />
      )}
      <ImportCelebration />
      <PostGameRoutingModal />
      <Toasts />
      <UpdateBanner />
    </div>
  );
}

// The "you're visiting someone else's Bazaar" banner. Themed (it renders inside
// the visited user's theme) and unmistakable, with their key stats and a clear
// way back to your own pages.
function ViewingBanner({
  onLeave,
  onMessage,
}: {
  onLeave: () => void;
  onMessage: (id: string, name: string) => void;
}) {
  const viewing = useStore((s) => s.viewing);
  const cloud = useStore((s) => s.cloud);
  const selfId = useStore((s) => s.userId);
  const [reporting, setReporting] = useState(false);
  if (!viewing) return null;
  const online = isOnline(viewing.lastSeenAt);
  const canReport = cloud && selfId != null && selfId !== viewing.userId;
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-brand/40 bg-brand/10 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4">
      {/* Avatar + identity. On a phone this takes the whole first row so the name
          has room; the action buttons drop to their own row below. */}
      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
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
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
        <VisitFriendButton
          targetId={viewing.userId}
          targetName={viewing.displayName}
          onMessage={onMessage}
        />
        {canReport && (
          <button
            onClick={() => setReporting(true)}
            title={`Report ${viewing.displayName}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-muted transition hover:bg-panel hover:text-danger"
          >
            <Flag size={16} /> <span className="hidden sm:inline">Report</span>
          </button>
        )}
        <button
          onClick={onLeave}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:bg-panel"
        >
          <ChevronLeft size={16} /> Leave
        </button>
      </div>
      {reporting && (
        <ReportModal
          target={{ id: viewing.userId, name: viewing.displayName }}
          kind="user"
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}

// An add-friend control on the visiting banner. Shown only to users with social
// access, never on your own profile. Loads the friend + request lists on mount so
// the button reflects your real relationship to the visited player.
function VisitFriendButton({
  targetId,
  targetName,
  onMessage,
}: {
  targetId: string;
  targetName: string;
  onMessage: (id: string, name: string) => void;
}) {
  const cloud = useStore((s) => s.cloud);
  const selfId = useStore((s) => s.userId);
  const friends = useStore((s) => s.friends);
  const requests = useStore((s) => s.friendRequests);
  const { fetchFriends, fetchFriendRequests, sendFriendRequest, respondFriendRequest } = useStore();

  useEffect(() => {
    if (!cloud) return;
    void fetchFriends();
    void fetchFriendRequests();
  }, [cloud, fetchFriends, fetchFriendRequests]);

  if (!cloud || !selfId || selfId === targetId) return null;

  const isFriend = friends.some((f) => f.id === targetId);
  const incoming = requests.find((r) => r.otherId === targetId && r.direction === "incoming");
  const outgoing = requests.find((r) => r.otherId === targetId && r.direction === "outgoing");

  if (isFriend) {
    return (
      <button
        onClick={() => onMessage(targetId, targetName)}
        title={`Send ${targetName} a message`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-sm font-medium text-accent transition hover:bg-brand/20"
      >
        <Mail size={16} /> Message
      </button>
    );
  }
  if (incoming) {
    return (
      <button
        onClick={() => void respondFriendRequest(incoming.id, true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-brand-fg transition hover:brightness-105"
      >
        <UserCheck size={16} /> Accept request
      </button>
    );
  }
  if (outgoing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-muted">
        <UserMinus size={16} /> Requested
      </span>
    );
  }
  return (
    <button
      onClick={() => void sendFriendRequest(targetId)}
      className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-brand/40 hover:bg-panel"
    >
      <UserPlus size={16} /> Add friend
    </button>
  );
}


// Per-lane presentation (icon + short label) for the Now Playing slot meter.
const LANE_META: Record<Lane, { icon: LucideIcon; label: string }> = {
  focus: { icon: Gamepad2, label: "Focus" },
  replay: { icon: RotateCcw, label: "Replay" },
  completionist: { icon: Target, label: "Completionist" },
  rotation: { icon: InfinityIcon, label: "Rotation" },
};

/** A single slot cell to render in a lane's meter: which lane, an optional rule
 *  descriptor, and the game (if any) currently occupying it. */
interface SlotView {
  key: string;
  kind: Lane;
  name: string;
  sub: string;
  occupant: Game | null;
  overflow?: boolean; // a unit beyond the lane's capacity (admin lowered the count)
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
function SlotCard({ slot, onJump }: { slot: SlotView; onJump?: (gameId: string) => void }) {
  const meta = LANE_META[slot.kind];
  const Icon = slot.overflow ? TriangleAlert : meta.icon;
  const filled = slot.occupant != null;
  const tone = slot.overflow
    ? "border-danger/40 bg-danger/5"
    : filled
      ? "border-brand/40 bg-brand/5"
      : "border-dashed border-line bg-panel/40";

  // A filled slot is a jump affordance to its game on the board below; an empty one
  // is just a static placeholder. (A div with role=button, like GameCard's cover.)
  const clickable = filled && onJump != null;
  const jump = clickable ? () => onJump!(slot.occupant!.id) : undefined;
  const interactive = clickable
    ? " cursor-pointer hover:border-brand hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    : "";

  return (
    <div
      {...(clickable
        ? {
            role: "button",
            tabIndex: 0,
            onClick: jump,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                jump!();
              }
            },
            title: `Jump to ${slot.occupant!.title}`,
          }
        : {})}
      className={
        "flex min-w-[140px] flex-1 flex-col gap-1.5 rounded-xl border p-2.5 transition " +
        tone +
        interactive
      }
    >
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
        {slot.sub && <span className="opacity-70"> · {slot.sub}</span>}
      </div>
    </div>
  );
}

// A small "X / Y in use" pill shared by all lanes.
function SlotMeter({ used, capacity }: { used: number; capacity: number }) {
  const full = used >= capacity;
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium " +
        (full ? "bg-danger/10 text-danger" : "bg-brand/10 text-accent")
      }
    >
      {used} / {capacity} in use
      <span className="font-normal opacity-80">
        {full ? " · full" : ` · ${capacity - used} open`}
      </span>
    </span>
  );
}

// One lane row in the slot meter: heading (jump button + meter) + an optional
// helper note + the grid of slot cells. The lane's occupant cells are built from
// the playing games in that lane (a linked family counts once).
function LaneRow({
  lane,
  anchor,
  title,
  capacity,
  playing,
  note,
  onJumpToGame,
  onJumpToSection,
}: {
  lane: Lane;
  anchor: string;
  title: string;
  capacity: number;
  playing: Game[];
  note?: React.ReactNode;
  onJumpToGame: (gameId: string) => void;
  onJumpToSection: (anchorId: string) => void;
}) {
  const cap = Math.max(0, Math.floor(capacity));
  const reps = representativeOccupants(laneGames(playing, lane));
  const used = reps.length;
  const cells = Math.max(cap, used);
  if (cells === 0) return null;
  const full = used >= cap;
  const HeadingIcon = lane === "focus" && full ? Lock : LANE_META[lane].icon;
  const sub = lane === "rotation" ? "ongoing" : lane === "replay" ? "free re-play" : lane === "completionist" ? "100% run" : "";
  const cards: SlotView[] = Array.from({ length: cells }).map((_, i) => ({
    key: `${lane}-${i}`,
    kind: lane,
    name: title,
    sub,
    occupant: reps[i] ?? null,
    overflow: i >= cap,
  }));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onJumpToSection(anchor)}
          title={`Jump to your ${title} games`}
          className="group inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-ink transition hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <HeadingIcon size={15} className="text-accent" />
          <span className="group-hover:underline">{title}</span>
        </button>
        <SlotMeter used={used} capacity={cap} />
      </div>
      {/* The slot cards come straight under the single-line heading so they line up
          across both columns; the lane's note sits below them (its height varies). */}
      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <SlotCard key={c.key} slot={c} onJump={onJumpToGame} />
        ))}
      </div>
      {note && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-subtle">{note}</p>
      )}
    </div>
  );
}

// The Now Playing slot meter: four independent lanes, each with its own capacity —
// Focus (games you're finishing), Replay (finished games you're replaying),
// Completionist (going for 100%), and Rotation (live-service / ongoing games). Each
// makes its cap visible at a glance, and its heading jumps to that board section.
function NowPlayingSlots({
  generalSlots,
  playing,
  onJumpToGame,
  onJumpToSection,
}: {
  generalSlots: number;
  playing: Game[];
  onJumpToGame: (gameId: string) => void;
  onJumpToSection: (anchorId: string) => void;
}) {
  const rotationReset = useStore((s) => s.rotationReset);
  const rotationCapacity = useStore((s) => s.rotationSlots);
  const replayCapacity = useStore((s) => s.replaySlots);
  const completionistCapacity = useStore((s) => s.completionistSlots);

  return (
    <div className="mb-4 grid grid-cols-1 items-start gap-x-5 gap-y-4 rounded-2xl border border-line bg-surface p-3 sm:p-4 lg:grid-cols-2">
      <LaneRow
        lane="focus"
        anchor={FOCUS_ANCHOR}
        title="Focus"
        capacity={slotCapacity(generalSlots)}
        playing={playing}
        note="Games you're working to finish — buying a game starts it here."
        onJumpToGame={onJumpToGame}
        onJumpToSection={onJumpToSection}
      />
      <LaneRow
        lane="replay"
        anchor={REPLAY_ANCHOR}
        title="Replay"
        capacity={replayCapacity}
        playing={playing}
        note="Finished games you're replaying — re-finishing pays the Replay Bonus."
        onJumpToGame={onJumpToGame}
        onJumpToSection={onJumpToSection}
      />
      <LaneRow
        lane="completionist"
        anchor={COMPLETIONIST_ANCHOR}
        title="Completionist"
        capacity={completionistCapacity}
        playing={playing}
        note="Games you're working to 100%-complete — completing pays the Completion Bonus."
        onJumpToGame={onJumpToGame}
        onJumpToSection={onJumpToSection}
      />
      <LaneRow
        lane="rotation"
        anchor={ROTATION_ANCHOR}
        title="Rotation"
        capacity={rotationCapacity}
        playing={playing}
        note={
          <>
            <CalendarClock size={12} className="shrink-0" />
            Live-service &amp; ongoing games — they never take a focus slot. Check each in once a
            week for coins. {rotationResetSummary(rotationReset)} · next in{" "}
            {formatResetCountdown(new Date(), rotationReset)}.
          </>
        }
        onJumpToGame={onJumpToGame}
        onJumpToSection={onJumpToSection}
      />
    </div>
  );
}

// The DOM id of a board game card, so the Now Playing slot summary can scroll to
// the matching card when you click its slot. Shared by the grid and the jump
// handler so the two never drift apart.
const boardGameAnchor = (id: string) => `np-game-${id}`;
// The DOM ids of the four Now Playing board sections, so the slot summary's lane
// headers can scroll to them.
const FOCUS_ANCHOR = "np-focus";
const REPLAY_ANCHOR = "np-replay";
const COMPLETIONIST_ANCHOR = "np-completionist";
const ROTATION_ANCHOR = "np-rotation";
const LANE_ANCHOR: Record<Lane, string> = {
  focus: FOCUS_ANCHOR,
  replay: REPLAY_ANCHOR,
  completionist: COMPLETIONIST_ANCHOR,
  rotation: ROTATION_ANCHOR,
};

// The animated card grid for a board. Pulled out so the Now Playing board can
// render two of them (Focus + Rotation) without duplicating the markup. Each card
// carries a stable anchor id and lights up briefly when `highlightId` matches, so
// clicking a slot in the summary above scrolls to and flags the right card.
function GameGrid({
  games,
  gridKey,
  focusGame,
  highlightId,
  onAutoOpened,
}: {
  games: Game[];
  gridKey: string;
  focusGame: { id: string; key: number } | null;
  highlightId?: string | null;
  onAutoOpened: () => void;
}) {
  return (
    <div
      key={gridKey}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <AnimatePresence mode="popLayout">
        {games.map((g) => (
          <motion.div
            key={g.id}
            id={boardGameAnchor(g.id)}
            layout
            className={
              "h-full scroll-mt-24 rounded-2xl transition-shadow duration-300 " +
              (highlightId === g.id ? "ring-2 ring-brand ring-offset-2 ring-offset-canvas" : "")
            }
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.18 }}
          >
            <GameCard
              game={g}
              autoOpenKey={focusGame?.id === g.id ? focusGame.key : 0}
              onAutoOpened={onAutoOpened}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// A board section: an anchor + (optional) heading over a grid. Used to separate
// the Now Playing board into Focus and Rotation groups. The heading is hidden when
// only one group exists, so a single-group board reads as a plain grid while still
// being a scroll target for the slot summary.
function BoardSection({
  anchorId,
  icon: Icon,
  title,
  sub,
  showHeader,
  games,
  gridKey,
  focusGame,
  highlightId,
  onAutoOpened,
}: {
  anchorId: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  showHeader: boolean;
  games: Game[];
  gridKey: string;
  focusGame: { id: string; key: number } | null;
  highlightId: string | null;
  onAutoOpened: () => void;
}) {
  return (
    <section id={anchorId} className="scroll-mt-24">
      {showHeader && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="inline-flex items-center gap-2 font-display text-lg tracking-tight text-ink">
            <Icon size={17} className="text-accent" /> {title}
          </span>
          <span className="rounded-full bg-line px-2 py-0.5 text-xs font-medium text-subtle">
            {games.length}
          </span>
          <span className="text-xs text-subtle">{sub}</span>
        </div>
      )}
      <GameGrid
        games={games}
        gridKey={gridKey}
        focusGame={focusGame}
        highlightId={highlightId}
        onAutoOpened={onAutoOpened}
      />
    </section>
  );
}

// The Now Playing board split into its four lanes — Focus, Replay, Completionist,
// Rotation — mirroring the slot meter so a player (or a visitor) can tell a backlog
// grind from a replay, a 100% run, or an ongoing game at a glance. Section headings
// appear only when more than one lane is populated, so a single-lane board reads as
// a plain grid while staying a scroll target for the slot summary.
function PlayingBoard({
  games,
  ownerName,
  focusGame,
  highlightId,
  onAutoOpened,
}: {
  games: Game[];
  ownerName: string | null; // the visited player's name, or null on your own board
  focusGame: { id: string; key: number } | null;
  highlightId: string | null;
  onAutoOpened: () => void;
}) {
  const lanes = partitionByLane(games);
  const order: Lane[] = ["focus", "replay", "completionist", "rotation"];
  const populated = order.filter((lane) => lanes[lane].length > 0);
  const showHeaders = populated.length > 1;
  const subFor = (lane: Lane): string => laneSectionSub(lane, ownerName);
  return (
    <div className="flex flex-col gap-7">
      {populated.map((lane) => (
        <BoardSection
          key={lane}
          anchorId={LANE_ANCHOR[lane]}
          icon={LANE_META[lane].icon}
          title={LANE_META[lane].label}
          sub={subFor(lane)}
          showHeader={showHeaders}
          games={lanes[lane]}
          gridKey={`playing-${lane}`}
          focusGame={focusGame}
          highlightId={highlightId}
          onAutoOpened={onAutoOpened}
        />
      ))}
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
