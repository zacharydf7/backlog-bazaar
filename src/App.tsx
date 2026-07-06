import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  TriangleAlert,
  Lock,
  Gamepad2,
  Target,
  RotateCcw,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Infinity as InfinityIcon,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "./store";
import { Avatar } from "./components/Avatar";
import { CoinIcon } from "./components/CoinIcon";
import { ViewingProvider } from "./lib/viewContext";
import { activityLabel, resolveActivity } from "./lib/presence";
import {
  slotCapacity,
  partitionByLane,
  laneGames,
  laneOf,
  rotationMeterCells,
  type Lane,
} from "./lib/slots";
import { planLaneMove, type LaneMovePlan } from "./lib/laneMoves";
import { rotationResetSummary, formatResetCountdown } from "./lib/rotation";
import { occupantKey } from "./lib/families";
import {
  groupCollapsedCompilations,
  compilationMatchesFilters,
  compilationMatchesQuery,
} from "./lib/compilationGrouping";
import { orderBoardCards } from "./lib/boardOrder";
import { stackBoardCards, type StackedBoardCard } from "./lib/gameStacks";
import { GameStackCard, CollapseStackPill } from "./components/GameStackCard";
import {
  groupCollapsedFamilies,
  familyMatchesQuery,
  familyMatchesFilters,
  type UnifiedFamily,
} from "./lib/familyGrouping";
import { Toasts } from "./components/Toasts";
import { ReportModal } from "./components/ReportModal";
import { PostGameRoutingModal } from "./components/PostGameRoutingModal";
import { UpdateBanner } from "./components/UpdateBanner";
import { MaintenancePage } from "./components/MaintenancePage";
import { GameCard } from "./components/GameCard";
import { CompilationParentCard } from "./components/CompilationParentCard";
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
import { PasswordRecoveryModal } from "./components/PasswordRecoveryModal";
import { ReleaseNotes } from "./components/ReleaseNotes";
import { AboutPage } from "./components/AboutPage";
import { PrivacyPage } from "./components/PrivacyPage";
import { GamePage } from "./components/gamepage/GamePage";
import { AchievementsPage } from "./components/AchievementsPage";
import { CompilationPage } from "./components/gamepage/CompilationPage";
import { ListsPage } from "./components/lists/ListsPage";
import { ListPage } from "./components/lists/ListPage";
import { Sidebar, MobileNav, TopBar, TABS, type View } from "./components/Sidebar";
import { TitleBadge } from "./components/TitleBadge";
import { BazaarToolbar } from "./components/BazaarToolbar";
import { MysteryPull } from "./components/MysteryPull";
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
import { EMPTY_LEDGER_FILTERS, type LedgerFilters, type LedgerGroupBy } from "./lib/ledger";
import { LATEST_RELEASE_ID, loadSeenReleaseId, markReleasesSeen } from "./lib/changelog";
import { parseHash, routeToHash, gameHash, isAccountSwitch, type Route } from "./lib/route";
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
    compilations,
    setCompilationExpanded,
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
    replayBonusPct,
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
    passwordRecovery,
  } = useStore();
  // Seed the page from the URL hash up front (not "backlog" then corrected by an
  // effect) so a refresh on e.g. the Leaderboard doesn't briefly broadcast an "In
  // the Bazaar" presence ping that can race the real one. Visits are restored by
  // the routing effect below once authed.
  const [view, setView] = useState<View>(() => {
    const r = parseHash(window.location.hash);
    return r.kind === "view" ? r.view : "backlog";
  });
  // The game whose page is open ("#g/<id>" / "#u/<uid>/g/<gid>"). Overlays the
  // current `view` (which stays put — it's the board Back/close returns to).
  const [openGameId, setOpenGameId] = useState<string | null>(() => {
    const r = parseHash(window.location.hash);
    return r.kind === "game" || r.kind === "visitGame" ? r.gameId : null;
  });
  // The collapsed compilation whose page is open ("#c/<id>"). Mutually
  // exclusive with openGameId; owner-only (visits never see collapsed parents).
  const [openCompilationId, setOpenCompilationId] = useState<string | null>(() => {
    const r = parseHash(window.location.hash);
    return r.kind === "compilation" ? r.compilationId : null;
  });
  // The custom list whose page is open ("#l/<id>" — also the share link, so it
  // can be anyone's list; the server gates access). Standalone like a
  // compilation page: opening one closes any visit.
  const [openListId, setOpenListId] = useState<string | null>(() => {
    const r = parseHash(window.location.hash);
    return r.kind === "list" ? r.listId : null;
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
  // Whether the board's facet-filter panel is expanded. Lifted here (not local to
  // the toolbar) so it survives leaving a board for a game page and coming back —
  // otherwise the toolbar remounts collapsed and the active filter reads as gone
  // even though it's still applied (issue 7bea6684).
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The Master Ledger's own slicers / grouping / panel. The ledger view unmounts
  // entirely when a game page overlays it, so — unlike the boards — its filter
  // state must live up here to survive opening a card and pressing Back (7bea6684).
  const [ledgerFilters, setLedgerFilters] = useState<LedgerFilters>(EMPTY_LEDGER_FILTERS);
  const [ledgerGroupBy, setLedgerGroupBy] = useState<LedgerGroupBy>("none");
  const [ledgerFiltersOpen, setLedgerFiltersOpen] = useState(false);
  // Universal search: the live query (filters the active board and feeds the
  // global results modal) and whether that modal is open. Picking a result
  // navigates straight to that game's page.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
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
    setOpenGameId(null);
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
      setOpenGameId(null);
      setView("requests");
    } else if (link === "mysubmissions" || link.startsWith("mysubmissions:")) {
      const id = link.startsWith("mysubmissions:") ? link.slice("mysubmissions:".length) : undefined;
      setMySubmissionId(id || undefined);
      closeUserBazaar();
      setInbox(null);
      setOpenGameId(null);
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
  // (read-only) library snapshot instead of your own games. Every record is its
  // own card — instances are never folded together, so a game owned standalone
  // and again inside a compilation shows both cards, each with its own status.
  const boardGames = viewing ? viewing.games : games;

  // Collapsed compilations fold their child cards into one rollup parent card
  // (in the lane of the least-completed child). Visitors always see children
  // individually — their compilation containers aren't shared. Another pure
  // view transform, layered after the ownership fold above.
  const grouping = useMemo(
    () => groupCollapsedCompilations(boardGames, viewing ? [] : compilations),
    [boardGames, compilations, viewing],
  );

  // Game Families fold into ONE focused card on the board of the most-active
  // edition (Now Playing > Bazaar > Wishlist > Finished), with the other
  // editions tucked behind the card's expander. A family the owner has "split"
  // in its hub keeps today's one-card-per-edition rendering (the escape hatch).
  // Layered after the compilation fold, so a family reduced to one visible
  // member simply passes through.
  const famGrouping = useMemo(() => groupCollapsedFamilies(grouping.boardGames), [grouping]);

  // Counts reflect individual games, except a collapsed compilation or a
  // focused family, each of which counts once on its derived board.
  const counts = useMemo(() => {
    const c: Record<GameStatus, number> = { backlog: 0, playing: 0, finished: 0, wishlist: 0 };
    for (const g of famGrouping.boardGames) c[g.status]++;
    for (const col of grouping.collapsed) c[col.board]++;
    for (const fam of famGrouping.families) c[fam.board]++;
    return c;
  }, [grouping, famGrouping]);

  // Games on the current board, before slicing/sorting — drives the facet lists
  // and the "X of Y" count in the toolbar.
  const boardGamesForView = useMemo(
    () => famGrouping.boardGames.filter((g) => g.status === view),
    [famGrouping, view],
  );

  // Collapsed rollup cards for the current board, honouring the live search and
  // the slicers the same way family cards do: the bundle matches when ANY child
  // does (hiding it because one child fails would hide children that pass).
  const collapsedForView = useMemo(
    () =>
      grouping.collapsed.filter(
        (c) =>
          c.board === view &&
          compilationMatchesQuery(c, searchQuery) &&
          compilationMatchesFilters(c, filters),
      ),
    [grouping, view, searchQuery, filters],
  );

  // Focused family cards for the current board. A family matches the search or
  // a slicer when ANY of its editions does — hiding the card because one
  // edition fails would hide editions that pass.
  const familiesForView = useMemo(
    () =>
      famGrouping.families.filter(
        (f) =>
          f.board === view && familyMatchesQuery(f, searchQuery) && familyMatchesFilters(f, filters),
      ),
    [famGrouping, view, searchQuery, filters],
  );
  const facets = useMemo(() => collectFacets(boardGamesForView), [boardGamesForView]);
  // The slicers/sort, then the live header search query, narrow the board so the
  // requested game jumps to the front as you type.
  const visibleGames = useMemo(
    () =>
      filterByQuery(
        // The coin-value sorts price games the way their buy buttons will —
        // Family Discounts need own-library state (discounts stay personal).
        applyView(
          boardGamesForView,
          sortKey,
          filters,
          economy,
          viewing ? {} : { allGames: boardGames, replayBonusPct },
        ),
        searchQuery,
      ),
    [boardGamesForView, sortKey, filters, economy, searchQuery, viewing, boardGames, replayBonusPct],
  );

  // The ONE ordered list the grid renders: plain cards, collapsed bundles, and
  // family cards interleaved under the active sort. Synthetic cards used to be
  // pinned to the grid's head, ignoring the sort entirely.
  const boardCards = useMemo(
    () =>
      orderBoardCards(
        visibleGames,
        collapsedForView,
        familiesForView,
        sortKey,
        economy,
        viewing ? {} : { allGames: boardGames, replayBonusPct },
      ),
    [visibleGames, collapsedForView, familiesForView, sortKey, economy, viewing, boardGames, replayBonusPct],
  );

  // "Stack by game": an optional grid view folding per-platform instances of
  // one game into a fan-out deck. A persisted view preference (not a filter —
  // counts and sorting are untouched); which decks are currently fanned out is
  // per-session and resets when the board changes.
  const [stackByGame, setStackByGame] = useState<boolean>(() => {
    try {
      return localStorage.getItem("bb-stack-by-game") === "1";
    } catch {
      return false;
    }
  });
  const [openStacks, setOpenStacks] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    setOpenStacks(new Set());
  }, [view, viewing?.userId]);
  const toggleStackByGame = () => {
    setStackByGame((v) => {
      try {
        localStorage.setItem("bb-stack-by-game", v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };
  const toggleStackOpen = (key: string) =>
    setOpenStacks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const stackedCards = useMemo(
    () => (stackByGame ? stackBoardCards(boardCards, openStacks) : boardCards),
    [stackByGame, boardCards, openStacks],
  );

  // The global results: every matching game across all boards (current library —
  // your own, or the player you're visiting), for the search overlay.
  const searchResults = useMemo(
    () => searchLibrary(boardGames, searchQuery),
    [boardGames, searchQuery],
  );

  // Reset slicers when switching boards — a platform/genre that exists on one
  // board may hide everything on another, which would be confusing. Collapse the
  // now-empty panel to match (opening a game page leaves `view` unchanged, so a
  // round-trip to a card keeps both the filter and the open panel).
  useEffect(() => {
    setFilters(EMPTY_FILTERS);
    setFiltersOpen(false);
  }, [view]);

  // Same fresh-slate reset for the Master Ledger's own slicers, on a real
  // navigation (view change) or a switch of whose ledger we're viewing. A game
  // round-trip leaves `view` at "master-ledger", so the filter survives it.
  useEffect(() => {
    setLedgerFilters(EMPTY_LEDGER_FILTERS);
    setLedgerGroupBy("none");
    setLedgerFiltersOpen(false);
  }, [view, viewing?.userId]);

  // Playing games for the Now Playing slot meter — every playing instance is
  // its own occupant (records are never folded).
  const playing = useMemo(() => games.filter((g) => g.status === "playing"), [games]);

  // Entering a visit lands on the player's Profile Hub (their public identity), with
  // a fresh search (a query scoped to your library shouldn't carry into theirs).
  // Exception: a "#u/<uid>/g/<gid>" deep link arrives game-first — keep its page.
  // A visit started in-app (inbox, leaderboard) instead closes any open game page,
  // which would otherwise point into the wrong library.
  //
  // The sidebar's LEAVE button returns you to the page you started the visit
  // from (issue b5fd4afb): whichever of THEIR pages you were on when you hit
  // Leave must not become YOUR page — landing on your own Profile because you
  // left from theirs felt like being teleported. The origin is snapshotted on
  // the first entry and survives visit→visit hops (leaving a chain returns to
  // where the chain began). Restore is opt-in via restoreOnLeaveRef: every
  // OTHER way out of a visit (navigating somewhere, a hash route, a
  // notification link) sets its own destination and must not be overridden.
  const preVisitViewRef = useRef<View | null>(null);
  const restoreOnLeaveRef = useRef(false);
  useEffect(() => {
    if (viewing) {
      if (preVisitViewRef.current == null) preVisitViewRef.current = view;
      if (pendingVisitGameRef.current === viewing.userId) {
        pendingVisitGameRef.current = null;
      } else {
        setOpenGameId(null);
        setView("profile");
      }
    } else {
      if (restoreOnLeaveRef.current && preVisitViewRef.current != null) {
        setView(preVisitViewRef.current);
      }
      restoreOnLeaveRef.current = false;
      preVisitViewRef.current = null;
    }
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
  // A "#u/<uid>/g/<gid>" deep link opens the visit asynchronously; this holds the
  // visited user until their Bazaar arrives so (a) the game page shows a loading
  // panel instead of "not found", (b) the visit-landing effect doesn't yank the
  // page to their Profile, and (c) the URL-sync effect doesn't rewrite the hash
  // mid-load with the visit half missing.
  const pendingVisitGameRef = useRef<string | null>(null);
  // True while the ONLY way we got to a game page was a cold deep link — Back
  // would leave the site, so the page's Back button goes to the board instead.
  // Cleared as soon as any in-app navigation pushes a history entry.
  const deepLinkedGameRef = useRef(false);

  // Apply a Route from the URL to app state. Reads `viewing` live (via getState)
  // so it can be a stable callback without re-subscribing.
  const applyRoute = useCallback(
    (route: Route) => {
      if (route.kind === "visit" || route.kind === "visitGame") {
        if (useStore.getState().viewing?.userId !== route.userId) {
          if (route.kind === "visitGame") pendingVisitGameRef.current = route.userId;
          void openUserBazaar(route.userId);
        }
        if (route.kind !== "visitGame") pendingVisitGameRef.current = null;
        setOpenGameId(route.kind === "visitGame" ? route.gameId : null);
        setOpenCompilationId(null);
        setOpenListId(null);
      } else if (route.kind === "game") {
        if (useStore.getState().viewing) closeUserBazaar();
        pendingVisitGameRef.current = null;
        // Leave `view` as-is — it's the board the page's Back returns to.
        setOpenGameId(route.gameId);
        setOpenCompilationId(null);
        setOpenListId(null);
      } else if (route.kind === "compilation") {
        if (useStore.getState().viewing) closeUserBazaar();
        pendingVisitGameRef.current = null;
        // Leave `view` as-is, like a game page — Back returns to the board.
        setOpenGameId(null);
        setOpenCompilationId(route.compilationId);
        setOpenListId(null);
      } else if (route.kind === "list") {
        if (useStore.getState().viewing) closeUserBazaar();
        pendingVisitGameRef.current = null;
        // Leave `view` as-is, like a game page — Back returns to the board.
        setOpenGameId(null);
        setOpenCompilationId(null);
        setOpenListId(route.listId);
      } else {
        if (useStore.getState().viewing) closeUserBazaar();
        pendingVisitGameRef.current = null;
        setOpenGameId(null);
        setOpenCompilationId(null);
        setOpenListId(null);
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
    if ((route.kind === "visit" || route.kind === "visitGame") && cloud && !userId) {
      return; // wait for auth
    }
    if (
      route.kind === "game" ||
      route.kind === "visitGame" ||
      route.kind === "compilation" ||
      route.kind === "list"
    ) {
      deepLinkedGameRef.current = true;
    }
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
    // While a visit-game deep link's Bazaar is still loading, the state only has
    // half the route (game id, no visit) — the URL is already right, leave it.
    if (pendingVisitGameRef.current) return;
    const route: Route = openGameId
      ? viewingUserId
        ? { kind: "visitGame", userId: viewingUserId, gameId: openGameId }
        : { kind: "game", gameId: openGameId }
      : openCompilationId && !viewingUserId
        ? { kind: "compilation", compilationId: openCompilationId }
        : openListId && !viewingUserId
          ? { kind: "list", listId: openListId }
          : viewingUserId
            ? { kind: "visit", userId: viewingUserId }
            : { kind: "view", view };
    const desired = routeToHash(route);
    const current = window.location.hash;
    const atHome = desired === "" && (current === "" || current === "#");
    if (desired !== current && !atHome) {
      // An empty desired hash means home — drop the "#…" entirely.
      const url = desired || window.location.pathname + window.location.search;
      window.history.pushState(null, "", url);
      // An in-app history entry now exists behind the page — Back is safe.
      deepLinkedGameRef.current = false;
    }
  }, [view, viewingUserId, openGameId, openCompilationId, openListId]);

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
      pendingVisitGameRef.current = null;
      setOpenGameId(null);
      setView("backlog");
    }
  }, [userId, closeUserBazaar]);

  // Returning from a game page: put the board back where the reader left it by
  // scrolling that game's card into view (the page itself scrolled to the top).
  // Cards carry a stable anchor id; a family rep folded into a Family card has
  // none on non-playing boards, in which case the board simply opens at the top.
  const prevOpenGameRef = useRef<string | null>(openGameId);
  useEffect(() => {
    const prev = prevOpenGameRef.current;
    prevOpenGameRef.current = openGameId;
    if (prev && !openGameId) {
      requestAnimationFrame(() =>
        document
          .getElementById(boardGameAnchor(prev))
          ?.scrollIntoView({ behavior: "auto", block: "center" }),
      );
    }
  }, [openGameId]);

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
    setOpenGameId(null); // navigating anywhere leaves an open game page
    setOpenCompilationId(null); // …and an open compilation page
    setOpenListId(null); // …and an open list page
    setView(v);
  };

  // Leaving a game page. Normally the browser Back (the page is a real history
  // entry), but a cold deep link has nothing in-app behind it — go to the board
  // (or the visited Bazaar) instead of leaving the site.
  const backFromGame = () => {
    if (deepLinkedGameRef.current) {
      deepLinkedGameRef.current = false;
      window.location.hash = viewing ? `#u/${viewing.userId}` : "";
    } else {
      window.history.back();
    }
  };
  // Reactive companion to pendingVisitGameRef: true while a visit-game deep
  // link's Bazaar is still on its way (re-renders arrive via `viewing`).
  const visitGamePending =
    pendingVisitGameRef.current != null && viewing?.userId !== pendingVisitGameRef.current;

  // Open Add game with the title field seeded (used by the search empty-state and
  // the plain Add button, which passes no seed).
  const openAdd = (seed = "") => {
    setAddQuery(seed);
    setAdding(true);
  };

  // Picking a search result: go straight to that game's own page (the page
  // resolves by id, so even a child folded inside a collapsed compilation
  // opens without expanding anything).
  const openSearchResult = (g: Game) => {
    setSearchOpen(false);
    window.location.hash = gameHash(g.id, viewing?.userId ?? null);
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
    onAchievements: () => navigate("achievements"),
    onRequests: () => {
      setFeaturesRequestId(undefined);
      navigate("requests");
    },
    // Open the admin console on the Users tab; Settings is its own tab (#admin).
    onAdmin: () => navigate("users"),
    onMySubmissions: () => navigate("mysubmissions"),
    onAccount: () => navigate("account"),
    // "My Profile" is always YOUR profile — leave any visit first so it doesn't
    // land on the player you're currently viewing (their hub is the visit landing /
    // the banner's "Profile" link instead).
    onProfile: () => {
      if (viewing) closeUserBazaar();
      setOpenGameId(null);
      setOpenCompilationId(null);
      setOpenListId(null);
      setView("profile");
    },
    onLists: () => navigate("lists"),
    // The sidebar's way home while visiting: return to the page the visit
    // started from (the visit effect above restores it). Any open game/
    // compilation page belongs to THEIR library — close it so leaving never
    // strands a foreign page over your own boards.
    onLeave: () => {
      restoreOnLeaveRef.current = true;
      setOpenGameId(null);
      setOpenCompilationId(null);
      setOpenListId(null);
      closeUserBazaar();
    },
    onMessageUser: (id: string, name: string) => openInbox({ compose: { id, name } }),
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

        {/* Whose Bazaar this is lives in the nav chrome while visiting (the
            "You're visiting" chip + Profile/Message/Report/Leave rows), so the
            content area goes straight to their pages — no banner. */}

        {/* Current section heading (the page title now lives in the sidebar).
            Game sections get a simple heading; the page views render their own.
            Hidden while a game's page overlays the board. */}
        {!openGameId && !openCompilationId && !openListId && isGameStatus(view) && (
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

        {openGameId ? (
          // A game's own page overlays whatever view is underneath (that view is
          // what Back returns to). It sources the visited library while visiting.
          <GamePage gameId={openGameId} visitPending={visitGamePending} onBack={backFromGame} />
        ) : openCompilationId ? (
          // A collapsed compilation's own page — the bundle-level GamePage.
          <CompilationPage compilationId={openCompilationId} onBack={backFromGame} />
        ) : openListId ? (
          // A custom list's page — yours (editable) or a shared one (read-only).
          <ListPage listId={openListId} onBack={backFromGame} />
        ) : view === "profile" ? (
          <ProfileHub
            onOpenTab={navigate}
            onOpenAchievements={() => navigate("achievements")}
            onOpenLists={() => navigate("lists")}
          />
        ) : view === "achievements" ? (
          <AchievementsPage />
        ) : view === "lists" ? (
          <ListsPage />
        ) : view === "market" ? (
          <Market />
        ) : view === "master-ledger" ? (
          <MasterLedger
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery("")}
            filters={ledgerFilters}
            onFiltersChange={setLedgerFilters}
            groupBy={ledgerGroupBy}
            onGroupByChange={setLedgerGroupBy}
            filtersOpen={ledgerFiltersOpen}
            onFiltersOpenChange={setLedgerFiltersOpen}
          />
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
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
                facets={facets}
                total={boardGamesForView.length}
                shown={visibleGames.length}
                // Mystery Pull lives on your own boards only (the pool and the
                // start flows are yours): the Bazaar draws a game to buy & play,
                // the Finished shelf draws a beaten game for a free 100% run.
                action={
                  viewing ? undefined : view === "backlog" ? (
                    <MysteryPull />
                  ) : view === "finished" ? (
                    <MysteryPull kind="complete" />
                  ) : undefined
                }
                // Stacking applies to the grid boards (Now Playing renders in
                // lanes, where a deck would hide a lane occupant).
                stacking={
                  view !== "playing"
                    ? { on: stackByGame, onToggle: toggleStackByGame }
                    : undefined
                }
              />
            )}

            {boardGamesForView.length === 0 &&
            collapsedForView.length === 0 &&
            familiesForView.length === 0 ? (
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
            ) : visibleGames.length === 0 &&
              collapsedForView.length === 0 &&
              familiesForView.length === 0 ? (
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
                families={familiesForView}
                highlightId={highlightGameId}
              />
            ) : (
              <GameGrid cards={stackedCards} gridKey={view} onToggleStack={toggleStackOpen} />
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
      {passwordRecovery && <PasswordRecoveryModal />}
      <PostGameRoutingModal />
      <Toasts />
      <UpdateBanner />
    </div>
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

/** Per-tile drag wiring for moving a slot's occupant between lanes (the compact
 *  meter tiles are the drag handles — the full board cards are too big to drag
 *  comfortably). Native HTML5 drag only fires for mouse input, so the
 *  affordance is desktop-only by construction; touch keeps the lane buttons. */
interface TileDrag {
  draggingId: string | null;
  onStart: (game: Game, e: React.DragEvent) => void;
  onEnd: () => void;
}

// A single slot card: kind icon + name, the occupying game (cover + title) or an
// "Open" affordance, and the slot's rule. Richer than a flat chip so the board
// reads as a set of "bays" you fill.
function SlotCard({
  slot,
  onJump,
  drag,
}: {
  slot: SlotView;
  onJump?: (gameId: string) => void;
  drag?: TileDrag;
}) {
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
  const draggable = filled && drag != null;
  const beingDragged = draggable && drag!.draggingId === slot.occupant!.id;

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
            title: draggable
              ? `Jump to ${slot.occupant!.title} — or drag it to another lane`
              : `Jump to ${slot.occupant!.title}`,
          }
        : {})}
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => drag!.onStart(slot.occupant!, e) : undefined}
      onDragEnd={draggable ? () => drag!.onEnd() : undefined}
      className={
        "flex min-w-[140px] flex-1 flex-col gap-1.5 rounded-xl border p-2.5 transition " +
        tone +
        interactive +
        (beingDragged ? " opacity-40" : "")
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
              // lazy: the Rotation carousel can hold any number of tiles, so
              // off-screen covers must not weigh down the dashboard load.
              <img
                src={slot.occupant!.image}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
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

// A small "X / Y in use" pill shared by the capped lanes.
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

// The Rotation lane's count pill — the lane is uncapped, so there's no "X / Y".
function RotationMeter({ used }: { used: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-accent">
      {used} in Rotation
      <span className="font-normal opacity-80">· no limit</span>
    </span>
  );
}

/** The Rotation lane's tile row: the lane is uncapped, so the tiles live in a
 *  horizontal carousel locked to the quadrant's footprint — two tiles visible
 *  (matching the other lanes' 2-column grid) and the rest off-screen to the
 *  right. Native trackpad swiping and shift-scrolling work through the
 *  overflow; the edge arrows render only when there's actually somewhere to
 *  scroll, and update as you do. */
function RotationCarousel({ count, children }: { count: number; children: React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // Re-measure when the tile count changes or the quadrant resizes (a new tile
  // grows scrollWidth without any scroll/resize event; jsdom has no
  // ResizeObserver — tests just skip the observer).
  useEffect(() => {
    update();
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, count]);

  const nudge = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // One tile (half the visible track) per tap, matching the 2-up layout.
    el.scrollBy({ left: dir * (el.clientWidth / 2 + 8), behavior: "smooth" });
  };

  const arrowCls =
    "absolute top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/95 text-muted shadow-sm transition hover:border-brand/50 hover:text-ink";

  return (
    <div className="relative">
      <div ref={trackRef} onScroll={update} className="flex gap-2 overflow-x-auto pb-1">
        {children}
      </div>
      {canLeft && (
        <button
          type="button"
          aria-label="Scroll Rotation left"
          onClick={() => nudge(-1)}
          className={arrowCls + " -left-1.5"}
        >
          <ChevronLeft size={15} />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          aria-label="Scroll Rotation right"
          onClick={() => nudge(1)}
          className={arrowCls + " -right-1.5"}
        >
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}

/** The slot meter's drag-and-drop bundle, owned by NowPlayingSlots: the active
 *  drag, the hovered lane, the legality plan per target lane, and the tile
 *  handlers that start/stop a drag. */
interface LaneDnd {
  dragging: Game | null;
  overLane: Lane | null;
  planFor: (lane: Lane) => LaneMovePlan | null;
  setOver: (lane: Lane | null) => void;
  drop: (lane: Lane) => void;
  tile: TileDrag;
}

// One lane row in the slot meter: heading (jump button + meter) + an optional
// helper note + the grid of slot cells. The lane's occupant cells are built from
// the playing games in that lane (a linked family counts once). While a tile is
// being dragged, the whole row doubles as that lane's drop zone.
function LaneRow({
  lane,
  anchor,
  title,
  capacity = 0,
  playing,
  note,
  onJumpToGame,
  onJumpToSection,
  dnd,
}: {
  lane: Lane;
  anchor: string;
  title: string;
  /** The lane's cap. Omitted for Rotation — that lane is uncapped, keeps two
   *  "Open" placeholders while sparse, and scrolls horizontally past two. */
  capacity?: number;
  playing: Game[];
  note?: React.ReactNode;
  onJumpToGame: (gameId: string) => void;
  onJumpToSection: (anchorId: string) => void;
  dnd?: LaneDnd;
}) {
  const unlimited = lane === "rotation";
  const cap = Math.max(0, Math.floor(capacity));
  const reps = representativeOccupants(laneGames(playing, lane));
  const used = reps.length;
  const cells = unlimited ? rotationMeterCells(used) : Math.max(cap, used);
  if (cells === 0) return null;
  const full = !unlimited && used >= cap;
  // An empty lane (no games) collapses to just its heading + meter on mobile,
  // where the single-column stack would otherwise waste a screenful on empty
  // "Open" tiles (issue 98ff1bf8). The lg 2-col grid always shows the full body.
  const empty = used === 0;
  const HeadingIcon = lane === "focus" && full ? Lock : LANE_META[lane].icon;
  const sub = lane === "rotation" ? "ongoing" : lane === "replay" ? "free re-play" : lane === "completionist" ? "100% run" : "";
  const cards: SlotView[] = Array.from({ length: cells }).map((_, i) => ({
    key: `${lane}-${i}`,
    kind: lane,
    name: title,
    sub,
    occupant: reps[i] ?? null,
    overflow: !unlimited && i >= cap,
  }));

  const plan = dnd?.dragging ? dnd.planFor(lane) : null;
  const isSource = dnd?.dragging != null && laneOf(dnd.dragging) === lane;
  const droppable = plan?.allowed === true;
  const hovering = droppable && dnd!.overLane === lane;

  return (
    <div
      onDragOver={
        droppable
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dnd!.overLane !== lane) dnd!.setOver(lane);
            }
          : undefined
      }
      onDragLeave={
        droppable
          ? (e) => {
              // Ignore leaves into our own children — only clear when the
              // pointer truly exits the lane.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                if (dnd!.overLane === lane) dnd!.setOver(null);
              }
            }
          : undefined
      }
      onDrop={
        droppable
          ? (e) => {
              e.preventDefault();
              dnd!.drop(lane);
            }
          : undefined
      }
      className={
        dnd?.dragging && !isSource
          ? "rounded-xl transition " +
            (droppable
              ? "outline-dashed outline-2 outline-offset-4 " +
                (hovering ? "bg-accent/5 outline-accent" : "outline-accent/40")
              : "opacity-40")
          : undefined
      }
    >
      <div
        className={
          (empty ? "mb-0 lg:mb-2 " : "mb-2 ") +
          "flex flex-wrap items-center justify-between gap-2"
        }
      >
        <button
          type="button"
          onClick={() => onJumpToSection(anchor)}
          title={`Jump to your ${title} games`}
          className="group inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-ink transition hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <HeadingIcon size={15} className="text-accent" />
          <span className="group-hover:underline">{title}</span>
        </button>
        {/* While a drag is live, the meter pill gives way to the verdict for this
            lane — drag previews suppress tooltips, so the hint lives in the row. */}
        {dnd?.dragging && !isSource ? (
          <span
            className={
              "text-[11px] font-medium " + (droppable ? "text-accent" : "text-subtle")
            }
          >
            {droppable
              ? "Drop here to move"
              : plan && !plan.allowed
                ? plan.reason
                : ""}
          </span>
        ) : unlimited ? (
          <RotationMeter used={used} />
        ) : (
          <SlotMeter used={used} capacity={cap} />
        )}
      </div>
      {/* The slot cards come straight under the single-line heading so they line up
          across both columns; the lane's note sits below them (its height varies).
          Rotation keeps the SAME two-tile footprint but carousels sideways once it
          holds more than fits. An empty lane hides this whole body on mobile so the
          heading + meter alone mark its place (restored at lg, the 2-col grid). */}
      <div className={empty && !dnd?.dragging ? "hidden lg:block" : undefined}>
        {unlimited ? (
          <RotationCarousel count={cells}>
            {cards.map((c) => (
              <div key={c.key} className="flex w-[calc(50%-0.25rem)] shrink-0">
                <SlotCard slot={c} onJump={onJumpToGame} drag={dnd?.tile} />
              </div>
            ))}
          </RotationCarousel>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {cards.map((c) => (
              <SlotCard key={c.key} slot={c} onJump={onJumpToGame} drag={dnd?.tile} />
            ))}
          </div>
        )}
        {note && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-subtle">{note}</p>
        )}
      </div>
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
  const replayCapacity = useStore((s) => s.replaySlots);
  const completionistCapacity = useStore((s) => s.completionistSlots);
  const enterCompletionist = useStore((s) => s.enterCompletionist);
  const exitCompletionist = useStore((s) => s.exitCompletionist);
  const enterRotation = useStore((s) => s.enterRotation);

  // Drag a filled tile onto another lane row to move the game (own board only —
  // this meter never renders while visiting). Every legal drop maps to the same
  // action its lane buttons run, validated by planLaneMove. (Rotation has no
  // capacity entry — the lane is uncapped.)
  const [dragging, setDragging] = useState<Game | null>(null);
  const [overLane, setOverLane] = useState<Lane | null>(null);
  const caps = {
    generalSlots: slotCapacity(generalSlots),
    replaySlots: replayCapacity,
    completionistSlots: completionistCapacity,
  };
  const endDrag = () => {
    setDragging(null);
    setOverLane(null);
  };
  const dnd: LaneDnd = {
    dragging,
    overLane,
    planFor: (lane) => (dragging ? planLaneMove(dragging, playing, lane, caps) : null),
    setOver: setOverLane,
    drop: (lane) => {
      if (dragging) {
        const plan = planLaneMove(dragging, playing, lane, caps);
        if (plan.allowed) {
          if (plan.action === "enterCompletionist") void enterCompletionist(dragging.id);
          else if (plan.action === "exitCompletionist") void exitCompletionist(dragging.id);
          else void enterRotation(dragging.id);
        }
      }
      endDrag();
    },
    tile: {
      draggingId: dragging?.id ?? null,
      onStart: (game, e) => {
        e.dataTransfer.setData("text/plain", game.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(game);
      },
      onEnd: endDrag,
    },
  };

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
        dnd={dnd}
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
        dnd={dnd}
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
        dnd={dnd}
      />
      <LaneRow
        lane="rotation"
        anchor={ROTATION_ANCHOR}
        title="Rotation"
        playing={playing}
        note={
          <>
            <CalendarClock size={12} className="shrink-0" />
            Live-service &amp; ongoing games, no limit — they never take a focus slot. Check each
            in once a week for coins. {rotationResetSummary(rotationReset)} · next in{" "}
            {formatResetCountdown(new Date(), rotationReset)}.
          </>
        }
        onJumpToGame={onJumpToGame}
        onJumpToSection={onJumpToSection}
        dnd={dnd}
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
  cards,
  gridKey,
  onToggleStack,
}: {
  // Plain game cards, collapsed compilation rollups, Family cards — and, under
  // the "Stack by game" view, fan-out decks and their fanned members — in ONE
  // sorted order (lib/boardOrder.ts + lib/gameStacks.ts). All share the
  // AnimatePresence so collapsing/expanding animates cards in and out.
  cards: StackedBoardCard[];
  gridKey: string;
  /** Fan a deck out / re-stack it (keyed by the stack's catalog key). */
  onToggleStack?: (key: string) => void;
}) {
  return (
    <div
      key={gridKey}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <AnimatePresence mode="popLayout">
        {cards.map((card) => {
          const key =
            card.kind === "compilation"
              ? `comp-${card.collapsed.compilation.id}`
              : card.kind === "family"
                ? `fam-${card.family.familyId}`
                : card.kind === "stack"
                  ? `stack-${card.stackKey}`
                  : card.game.id;
          return (
            <motion.div
              key={key}
              id={
                card.kind === "game" || card.kind === "fanned"
                  ? boardGameAnchor(card.game.id)
                  : undefined
              }
              layout
              className="h-full scroll-mt-24 rounded-2xl"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.18 }}
            >
              {card.kind === "compilation" ? (
                <CompilationParentCard collapsed={card.collapsed} />
              ) : card.kind === "family" ? (
                <GameCard game={card.family.primary} family={card.family} />
              ) : card.kind === "stack" ? (
                <GameStackCard
                  games={card.games}
                  onFanOut={() => onToggleStack?.(card.stackKey)}
                />
              ) : card.kind === "fanned" ? (
                <div className="relative h-full">
                  <GameCard game={card.game} />
                  {card.first && (
                    <CollapseStackPill
                      count={card.count}
                      onCollapse={() => onToggleStack?.(card.stackKey)}
                    />
                  )}
                </div>
              ) : (
                <GameCard game={card.game} />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// The Now Playing board: every playing card in ONE responsive grid in lane
// order — Focus, Replay, Completionist, Rotation — beneath the untouched slot
// summary. One game per lane used to render as four stacked single-card
// sections wasting the whole right side of a desktop screen; a single merged
// grid fills the width, and each card already announces its lane itself (the
// Focus/Replay/Completionist badge or the "In Rotation" chip), so no section
// headings are needed. A plain grid (not CSS-columns masonry) on purpose:
// grid rows stretch every card in a row to the same height, so a mix of tall
// and short cards reads balanced instead of ragged — matching every other
// board — and framer-motion layout animations keep working.
function PlayingBoard({
  games,
  families,
  highlightId,
}: {
  games: Game[];
  // Unified family cards whose primary edition is playing — slotted into that
  // edition's lane, ahead of the lane's individual cards.
  families?: UnifiedFamily[];
  highlightId: string | null;
}) {
  const lanes = partitionByLane(games);
  const order: Lane[] = ["focus", "replay", "completionist", "rotation"];
  const famsByLane = new Map<Lane, UnifiedFamily[]>();
  for (const f of families ?? []) {
    const lane = laneOf(f.primary);
    const list = famsByLane.get(lane);
    if (list) list.push(f);
    else famsByLane.set(lane, [f]);
  }
  // Lane-ordered cards (family cards lead their lane); each lane's first card
  // doubles as the scroll target for the slot summary's lane headers.
  type Entry = { key: string; laneAnchor?: string; fam?: UnifiedFamily; g?: Game };
  const flat: Entry[] = order.flatMap((lane) => {
    const entries: Entry[] = [
      ...(famsByLane.get(lane) ?? []).map((fam): Entry => ({ key: `fam-${fam.familyId}`, fam })),
      ...lanes[lane].map((g): Entry => ({ key: g.id, g })),
    ];
    return entries.map((e, i) => (i === 0 ? { ...e, laneAnchor: LANE_ANCHOR[lane] } : e));
  });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <AnimatePresence mode="popLayout">
        {flat.map(({ key, laneAnchor, fam, g }) => (
          <motion.div
            key={key}
            id={laneAnchor}
            layout
            className="h-full scroll-mt-24"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.18 }}
          >
            {fam ? (
              <div
                id={boardGameAnchor(fam.primary.id)}
                className="h-full scroll-mt-24 rounded-2xl"
              >
                <GameCard game={fam.primary} family={fam} />
              </div>
            ) : (
              <div
                id={boardGameAnchor(g!.id)}
                className={
                  "h-full scroll-mt-24 rounded-2xl transition-shadow duration-300 " +
                  (highlightId === g!.id ? "ring-2 ring-brand ring-offset-2 ring-offset-canvas" : "")
                }
              >
                <GameCard game={g!} />
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
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
