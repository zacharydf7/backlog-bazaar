import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type {
  AdminUser,
  AppNotification,
  Badge,
  IssueAttachment,
  IssueComment,
  IssueKind,
  IssuePriority,
  IssueRelation,
  Issue,
  IssueStatus,
  Game,
  GameCopy,
  GameMeta,
  GameStatus,
  GameSubmission,
  LedgerEntry,
  LedgerTotals,
  MySubmission,
  Privacy,
  UserStats,
} from "./types";
import type { CatalogFields, CatalogOverride } from "./lib/submissions";
import { applyThemeId, getThemeId, setThemeId } from "./lib/theme";
import { formatPlaytime } from "./lib/playtime";
import type { PlaySession } from "./lib/platformPlaytime";
import { downscaleImage } from "./lib/image";
import { isAppearOffline, PRIVACY_KEYS } from "./lib/privacy";
import {
  computeReplayBonus,
  computeFinishReward,
  computeShelveRefund,
  REPLAY,
  SHELVE,
  STARTING_COINS,
} from "./lib/pricing";
import {
  computeFormula,
  normalizeFormula,
  DEFAULT_ECONOMY,
  DEFAULT_PRICE_FORMULA,
  DEFAULT_BOUNTY_FORMULA,
  type EconomyConfig,
  type FormulaConfig,
} from "./lib/economy";
import {
  DEFAULT_GENERAL_SLOTS,
  planSlotForGame,
  playingGames,
  type SlotDefinition,
  type TargetedSlot,
} from "./lib/slots";
import { applyLink, applyUnlink, isReplayFinish, occupantKey } from "./lib/families";
import { coerceCoinVariant, DEFAULT_COIN, type CoinVariant } from "./lib/coins";
import { isBuiltInPlatformLabel, mergePlatforms } from "./lib/platforms";
import { cleanDisplayName, validateDisplayName } from "./lib/displayName";
import {
  supabase,
  isCloudConfigured,
  rowToGame,
  rowToIssue,
  rowToIssueAttachment,
  rowToComment,
  rowToIssueRelation,
  rowToNotification,
  rowToAdminUser,
  rowToSlotDefinition,
  rowToTargetedSlot,
  rowToViewProfile,
  rowToGameSubmission,
  rowToMySubmission,
  rowToLedgerEntry,
  rowToUserStats,
  jsonToBadges,
  jsonToTitle,
  type GameRow,
  type LedgerRow,
  type GameSubmissionRow,
  type MySubmissionRow,
  type IssueRow,
  type IssueAttachmentRow,
  type CommentRow,
  type IssueRelationRow,
  type NotificationRow,
  type LeaderboardRow,
  type AdminUserRow,
  type UserStatsRow,
  type SlotDefinitionRow,
  type UserSlotRow,
  type ViewProfileRow,
} from "./lib/supabase";
import { sortLedger, computeTotals } from "./lib/transactions";
import {
  charterResale,
  DEFAULT_CHARTER_COST,
  DEFAULT_CHARTER_RESALE_PCT,
} from "./lib/charters";
import { toast } from "./lib/toast";
import { processAvatar } from "./lib/avatar";
import { prepareUpload, validateFile } from "./lib/attachment";
import { toCanonicalRelation, type RelationPerspective } from "./lib/issueRelations";
import { Store, Heart, Gamepad2, Trophy, Coins, Eye, EyeOff, Lightbulb, Clock, Pencil, Undo2, Lock, Trash2, Link2, Unlink, ImagePlus, Palette, Scroll, Stamp } from "lucide-react";

function addedToast(title: string, status: GameStatus): void {
  if (status === "wishlist") toast(`Wishlisted ${title}`, Heart);
  else if (status === "finished") toast(`Added ${title} to your collection`, Trophy);
  else toast(`Added ${title} to your Bazaar`, Store);
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** A community catalog contribution to file. `proposed.image` is already a URL
 *  (upload via uploadCatalogCover first). `before` is the snapshot for the diff. */
export interface GameSubmissionInput {
  kind: "edit" | "new";
  catalogId: string | null;
  rawgId: number | null;
  proposed: CatalogFields;
  before: CatalogFields | null;
}

// How many notifications to load per page (initial load + each lazy "load older"
// page as the panel scrolls).
const NOTIF_PAGE = 20;

// A manually-set activity status (admin tool) that overrides the auto status the
// presence heartbeat would otherwise derive from navigation. Persisted locally so
// it survives reloads; null = automatic.
const ACTIVITY_OVERRIDE_KEY = "bb-activity-override";
function loadActivityOverride(): string | null {
  try {
    const v = localStorage.getItem(ACTIVITY_OVERRIDE_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

/** The fields a user may edit on an existing game. Deliberately excludes status
 *  (that moves only through buy/finish/abandon) and coins/reward snapshots. */
export interface EditableGameFields {
  title: string;
  released?: string;
  hours?: number;
  playedHours: number;
  copies: GameCopy[];
  platforms?: string[]; // the platforms this game released on (editable)
}

// Maintenance only applies on the live production domain. Staging/preview builds
// and localhost ignore the flag, so the test site stays usable even while it
// shares a database with production.
const PRODUCTION_HOSTS = ["backlogbazaar.com", "www.backlogbazaar.com"];
function isProductionHost(): boolean {
  try {
    return PRODUCTION_HOSTS.includes(window.location.hostname);
  } catch {
    return false;
  }
}

// Owner bypass for maintenance mode: visiting with ?preview=1 stores a flag so
// you can still use the live site while everyone else sees the closed page.
// ?preview=0 clears it.
function readBypass(): boolean {
  try {
    const p = new URLSearchParams(window.location.search).get("preview");
    if (p === "1") localStorage.setItem("bb-bypass", "1");
    else if (p === "0") localStorage.removeItem("bb-bypass");
    return localStorage.getItem("bb-bypass") === "1";
  } catch {
    return false;
  }
}

// --- Local (guest) persistence -------------------------------------------
const LOCAL_KEY = "backlog-bazaar";

/** A best-effort unique id for locally-created records (guest mode). */
function newLocalId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The opening-balance baseline event for a guest ledger. */
function openingEvent(coins: number): LedgerEntry {
  return {
    id: newLocalId(),
    kind: "opening",
    coinDelta: 0,
    charterDelta: 0,
    coinBalanceAfter: coins,
    charterBalanceAfter: 0,
    gameTitle: null,
    label: "Opening balance",
    createdAt: Date.now(),
  };
}

/** A guest-mode ledger row, mirroring what the server RPCs log for cloud users.
 *  `charterDelta`/`charterAfter` default to a coins-only event. */
function localEvent(
  kind: string,
  coinDelta: number,
  coinAfter: number,
  gameTitle: string | null,
  charterDelta = 0,
  charterAfter: number | null = null,
): LedgerEntry {
  return {
    id: newLocalId(),
    kind,
    coinDelta,
    charterDelta,
    coinBalanceAfter: coinAfter,
    charterBalanceAfter: charterAfter,
    gameTitle,
    label: null,
    createdAt: Date.now(),
  };
}

function loadLocal(): {
  coins: number;
  charters: number;
  games: Game[];
  ledger: LedgerEntry[];
} {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const coins = d.coins ?? STARTING_COINS;
      const charters = typeof d.charters === "number" ? d.charters : 0;
      const ledger: LedgerEntry[] = Array.isArray(d.ledger) ? d.ledger : [];
      // Seed an opening-balance baseline so the running balance is consistent
      // from the first real event (mirrors the server-side seed for cloud users).
      if (ledger.length === 0) ledger.push(openingEvent(coins));
      return { coins, charters, games: d.games ?? [], ledger };
    }
  } catch {
    /* ignore */
  }
  return {
    coins: STARTING_COINS,
    charters: 0,
    games: [],
    ledger: [openingEvent(STARTING_COINS)],
  };
}

function saveLocal(
  coins: number,
  games: Game[],
  ledger?: LedgerEntry[],
  charters?: number,
): void {
  try {
    let led = ledger;
    let ch = charters;
    // Saves that don't touch the ledger/charters preserve what's stored.
    if (led === undefined || ch === undefined) {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        const prev = raw ? JSON.parse(raw) : {};
        if (led === undefined) led = Array.isArray(prev.ledger) ? prev.ledger : [];
        if (ch === undefined) ch = typeof prev.charters === "number" ? prev.charters : 0;
      } catch {
        if (led === undefined) led = [];
        if (ch === undefined) ch = 0;
      }
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ coins, games, ledger: led, charters: ch }));
  } catch {
    /* ignore */
  }
}

const PLATFORMS_KEY = "bb-platforms";

function loadLocalPlatforms(): string[] {
  try {
    const raw = localStorage.getItem(PLATFORMS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveLocalPlatforms(ids: string[]): void {
  try {
    localStorage.setItem(PLATFORMS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

const CUSTOM_PLATFORMS_KEY = "bb-custom-platforms";

function loadLocalCustomPlatforms(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PLATFORMS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveLocalCustomPlatforms(labels: string[]): void {
  try {
    localStorage.setItem(CUSTOM_PLATFORMS_KEY, JSON.stringify(labels));
  } catch {
    /* ignore */
  }
}

const HIDDEN_KEY = "bb-hidden-market";

function loadLocalHidden(): number[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function saveLocalHidden(ids: number[]): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

/** An in-progress "visit" to another player's Bazaar: their public header plus a
 *  read-only snapshot of their library. null = you're on your own pages. */
export interface ViewingSession {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
  theme: string | null;
  gamesFinished: number;
  hoursFinished: number;
  hideSpend: boolean;
  lastSeenAt: number | null;
  activity: string | null;
  badges: Badge[];
  title: Badge | null;
  games: Game[];
}

interface BazaarState {
  cloud: boolean; // is Supabase configured
  initialized: boolean; // init() has run
  ready: boolean; // safe to render the app
  busy: boolean; // an auth request is in flight
  error: string | null;
  notice: string | null;
  maintenance: boolean; // does the closed page apply right now (host + bypass applied)
  maintenanceFlag: boolean; // raw DB value (for the admin toggle)
  maintenanceMessage: string | null;
  shelveRefundPct: number; // "Shelve It" refund %, admin-configurable
  replayBonusPct: number; // Replay Bonus % (linked-edition re-clears), admin-configurable
  submissionReward: number; // coins paid when a catalog contribution is approved
  defaultCoin: CoinVariant; // app-wide coin skin, admin-configurable
  economy: EconomyConfig; // buy-price + finish-bounty formulas, admin-configurable

  userId: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null; // uploaded profile picture URL (null = use initials)
  isAdmin: boolean;
  submissionCount: number; // pending catalog submissions awaiting review (admins)
  generalSlots: number; // how many general Now Playing slots this player has
  myTargetedSlots: TargetedSlot[]; // targeted slots granted to this player
  blocked: boolean; // this user is banned (locked out of the app)
  blockedReason: string | null;
  providers: string[]; // linked sign-in methods, e.g. ["email", "google"]
  myPlatforms: string[]; // owned console ids (see lib/platforms)
  customPlatforms: string[]; // extra console labels the user added themselves
  hiddenMarket: number[]; // rawgIds dismissed from The Caravan
  theme: string; // this user's chosen theme id (synced to the profile)
  privacy: Privacy; // this user's visitor-privacy flags
  myBadges: Badge[]; // prestige badges this user holds
  selectedTitleId: string | null; // which held badge is shown as their title (null = none)
  activityOverride: string | null; // admin: manual presence status overriding the auto one

  coins: number;
  charters: number; // Import Charters held in the global wallet
  charterCost: number; // coins to buy one charter (admin-configurable)
  charterResalePct: number; // % of cost returned on resale (admin-configurable)
  games: Game[];
  ledger: LedgerEntry[]; // guest-mode coin/charter history (cloud users fetch from coin_events)
  // A one-shot import celebration payload; ImportCelebration shows it then clears.
  celebration: { id: number; title: string } | null;
  chartersOpen: boolean; // the Buy/Sell Import Charters modal is open
  notifications: AppNotification[];
  notificationsHasMore: boolean; // a full page came back, so older ones may remain
  notificationsLoadingMore: boolean; // a "load older" page is in flight (scroll guard)

  // Visiting another player's Bazaar (read-only). null = on your own pages.
  viewing: ViewingSession | null;
  viewingLoading: boolean;

  init: () => Promise<void>;
  applySession: (session: Session | null) => Promise<void>;

  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  unlinkGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearMessages: () => void;
  setDisplayName: (name: string) => Promise<boolean>;
  setMyPlatforms: (ids: string[]) => Promise<void>;
  setTheme: (id: string) => Promise<void>;
  setPrivacy: (key: string, value: boolean) => Promise<void>;
  setActivityOverride: (value: string | null) => void;
  setSelectedTitle: (badgeId: string | null) => Promise<void>;
  fetchBadges: () => Promise<Badge[]>;
  grantBadge: (userId: string, badgeId: string) => Promise<void>;
  revokeBadge: (userId: string, badgeId: string) => Promise<void>;
  pingPresence: (activity: string) => Promise<void>;
  openUserBazaar: (userId: string) => Promise<void>;
  closeUserBazaar: () => void;
  setAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
  addCustomPlatform: (label: string) => Promise<void>;
  removeCustomPlatform: (label: string) => Promise<void>;
  setMaintenance: (on: boolean, message: string | null) => Promise<void>;
  setShelveRefundPct: (pct: number) => Promise<void>;
  setReplayBonusPct: (pct: number) => Promise<void>;
  setDefaultCoin: (variant: CoinVariant) => Promise<void>;
  setEconomyFormulas: (price: FormulaConfig, bounty: FormulaConfig) => Promise<void>;
  setSubmissionReward: (coins: number) => Promise<void>;
  setCharterCost: (coins: number) => Promise<void>;
  setCharterResalePct: (pct: number) => Promise<void>;
  setCoins: (amount: number) => Promise<void>;

  fetchUsers: () => Promise<AdminUser[]>;
  fetchUserStats: (userId: string, from: Date | null, to: Date) => Promise<UserStats | null>;
  adminUpdateUser: (user: AdminUser) => Promise<boolean>;
  notifyUser: (userId: string, title: string, body: string) => Promise<void>;
  adminDeleteUser: (userId: string) => Promise<boolean>;

  fetchSlotDefinitions: () => Promise<SlotDefinition[]>;
  createSlotDefinition: (
    name: string,
    minHours: number | null,
    maxHours: number | null,
  ) => Promise<boolean>;
  updateSlotDefinition: (def: SlotDefinition) => Promise<boolean>;
  deleteSlotDefinition: (id: string) => Promise<boolean>;
  fetchUserSlots: (userId: string) => Promise<TargetedSlot[]>;
  grantUserSlot: (userId: string, definitionId: string) => Promise<boolean>;
  revokeUserSlot: (slotId: string) => Promise<boolean>;
  hideMarketGame: (rawgId: number) => Promise<void>;
  clearHiddenMarket: () => Promise<void>;

  addGame: (meta: GameMeta, status?: GameStatus) => Promise<void>;
  // Spend an Import Charter to move a Wishlist game into the Bazaar.
  importWithCharter: (id: string) => Promise<void>;
  buyCharter: () => Promise<void>;
  sellCharter: () => Promise<void>;
  clearCelebration: () => void;
  openCharters: () => void;
  closeCharters: () => void;
  bazaarToWishlist: (id: string) => Promise<void>;
  buyGame: (id: string) => Promise<void>;
  moveGameToSlot: (id: string, slotId: string | null) => Promise<void>;
  linkGames: (id: string, otherId: string) => Promise<void>;
  unlinkGame: (id: string) => Promise<void>;
  setFamilyName: (familyId: string, name: string) => Promise<void>;
  logPlaytime: (id: string, hours: number, platform?: string) => Promise<void>;
  setPlayedHours: (id: string, hours: number) => Promise<void>;
  // A game's logged play sessions (cloud only), for the per-version breakdown and
  // remembering which version was played last. Empty offline.
  fetchPlaySessions: (id: string) => Promise<PlaySession[]>;
  // Page through the Transaction Ledger newest-first; `done` = no older rows.
  fetchLedger: (offset: number) => Promise<{ entries: LedgerEntry[]; done: boolean }>;
  // Lifetime gain/loss totals for the current user's ledger.
  fetchLedgerTotals: () => Promise<LedgerTotals>;
  setGameCopies: (id: string, copies: GameCopy[]) => Promise<void>;
  setProgressNote: (id: string, note: string) => Promise<void>;
  editGame: (id: string, patch: EditableGameFields) => Promise<void>;
  setGameImage: (id: string, file: File) => Promise<void>;
  clearGameImage: (id: string) => Promise<void>;
  restoreGameImage: (id: string) => Promise<void>;
  restoreOriginalImage: (id: string, url: string) => Promise<void>;
  fetchCatalogGame: (rawgId: number) => Promise<CatalogOverride | null>;
  searchCatalogGames: (query: string) => Promise<GameMeta[]>;
  fetchCatalogOverrides: (rawgIds: number[]) => Promise<Record<number, CatalogOverride>>;
  uploadCatalogCover: (file: File) => Promise<string | null>;
  submitGameSubmission: (input: GameSubmissionInput) => Promise<boolean>;
  fetchMySubmissions: () => Promise<MySubmission[]>;
  fetchGameSubmissions: () => Promise<GameSubmission[]>;
  refreshSubmissionCount: () => Promise<void>;
  approveSubmission: (id: string, note: string, fields: string[] | null) => Promise<boolean>;
  rejectSubmission: (id: string, note: string) => Promise<boolean>;
  finishGame: (id: string) => Promise<void>;
  abandonGame: (id: string) => Promise<void>;
  removeGame: (id: string) => Promise<void>;

  fetchLeaderboard: () => Promise<LeaderboardRow[]>;
  fetchPlayerLibrary: (playerId: string) => Promise<Game[]>;

  fetchIssues: () => Promise<Issue[]>;
  submitIssue: (
    title: string,
    description: string,
    kind: IssueKind,
    files?: File[],
    tags?: string[],
    priority?: IssuePriority,
  ) => Promise<string | null>; // the new issue's id, or null on failure
  fetchRequestAttachments: (requestId: string) => Promise<IssueAttachment[]>;
  uploadAttachment: (
    requestId: string,
    file: File,
    commentId?: string | null,
  ) => Promise<IssueAttachment | null>;
  deleteAttachment: (att: IssueAttachment) => Promise<boolean>;
  voteIssue: (requestId: string, on: boolean) => Promise<boolean>;
  setRequestStatus: (requestId: string, status: IssueStatus) => Promise<boolean>;
  editIssue: (
    requestId: string,
    title: string,
    description: string,
    kind: IssueKind,
    tags: string[],
    priority: IssuePriority,
  ) => Promise<boolean>;
  deleteIssue: (requestId: string) => Promise<boolean>;
  respondIssue: (requestId: string, approve: boolean) => Promise<IssueStatus | null>;

  fetchRequestComments: (requestId: string) => Promise<IssueComment[]>;
  addComment: (
    requestId: string,
    body: string,
    parentId?: string | null,
    files?: File[],
  ) => Promise<boolean>;
  editComment: (commentId: string, body: string) => Promise<boolean>;
  deleteComment: (commentId: string) => Promise<boolean>;
  toggleReaction: (commentId: string, emoji: string, on: boolean) => Promise<boolean>;

  fetchRequestRelations: (requestId: string) => Promise<IssueRelation[]>;
  addRequestRelation: (
    perspective: RelationPerspective,
    sourceId: string,
    targetId: string,
  ) => Promise<boolean>;
  removeRequestRelation: (relationId: string) => Promise<boolean>;

  fetchNotifications: () => Promise<void>;
  loadMoreNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

export const useStore = create<BazaarState>((set, get) => ({
  cloud: isCloudConfigured,
  initialized: false,
  ready: false,
  busy: false,
  error: null,
  notice: null,
  maintenance: false,
  maintenanceFlag: false,
  maintenanceMessage: null,
  shelveRefundPct: SHELVE.defaultPct,
  replayBonusPct: REPLAY.defaultPct,
  submissionReward: 15,
  defaultCoin: DEFAULT_COIN,
  economy: DEFAULT_ECONOMY,

  userId: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  isAdmin: false,
  submissionCount: 0,
  generalSlots: DEFAULT_GENERAL_SLOTS,
  myTargetedSlots: [],
  blocked: false,
  blockedReason: null,
  providers: [],
  myPlatforms: [],
  customPlatforms: [],
  hiddenMarket: [],
  theme: "treasure",
  privacy: {},
  myBadges: [],
  selectedTitleId: null,
  activityOverride: loadActivityOverride(),

  coins: STARTING_COINS,
  charters: 0,
  charterCost: DEFAULT_CHARTER_COST,
  charterResalePct: DEFAULT_CHARTER_RESALE_PCT,
  games: [],
  ledger: [],
  celebration: null,
  chartersOpen: false,
  notifications: [],
  notificationsHasMore: false,
  notificationsLoadingMore: false,

  viewing: null,
  viewingLoading: false,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    if (!isCloudConfigured || !supabase) {
      // Local guest mode — same behaviour as before, no account needed.
      const { coins, charters, games, ledger } = loadLocal();
      set({
        coins,
        charters,
        games,
        ledger,
        displayName: "You",
        myPlatforms: loadLocalPlatforms(),
        customPlatforms: loadLocalCustomPlatforms(),
        hiddenMarket: loadLocalHidden(),
        theme: getThemeId(),
        ready: true,
      });
      return;
    }

    // Maintenance flag (anon-readable). A missing table is treated as "open".
    const bypass = readBypass();
    const { data: cfg } = await supabase
      .from("app_config")
      .select(
        "maintenance, message, shelve_refund_pct, replay_bonus_pct, submission_reward, charter_cost, charter_resale_pct, default_coin, price_formula, bounty_formula",
      )
      .eq("id", 1)
      .single();
    const rawMaint = Boolean(cfg?.maintenance);
    set({
      maintenanceFlag: rawMaint,
      maintenance: rawMaint && isProductionHost() && !bypass,
      maintenanceMessage: (cfg?.message as string | null) ?? null,
      shelveRefundPct:
        typeof cfg?.shelve_refund_pct === "number" ? cfg.shelve_refund_pct : SHELVE.defaultPct,
      replayBonusPct:
        typeof cfg?.replay_bonus_pct === "number" ? cfg.replay_bonus_pct : REPLAY.defaultPct,
      submissionReward:
        typeof cfg?.submission_reward === "number" ? cfg.submission_reward : 15,
      charterCost:
        typeof cfg?.charter_cost === "number" ? cfg.charter_cost : DEFAULT_CHARTER_COST,
      charterResalePct:
        typeof cfg?.charter_resale_pct === "number"
          ? cfg.charter_resale_pct
          : DEFAULT_CHARTER_RESALE_PCT,
      defaultCoin: coerceCoinVariant(cfg?.default_coin),
      economy: {
        price: normalizeFormula(cfg?.price_formula, DEFAULT_PRICE_FORMULA),
        bounty: normalizeFormula(cfg?.bounty_formula, DEFAULT_BOUNTY_FORMULA),
      },
    });

    const { data } = await supabase.auth.getSession();
    await get().applySession(data.session);
    supabase.auth.onAuthStateChange((_event, session) => {
      void get().applySession(session);
    });
    set({ ready: true });
  },

  applySession: async (session) => {
    if (!supabase) return;
    if (!session) {
      set({
        userId: null,
        email: null,
        displayName: null,
        avatarUrl: null,
        isAdmin: false,
        generalSlots: DEFAULT_GENERAL_SLOTS,
        myTargetedSlots: [],
        blocked: false,
        blockedReason: null,
        providers: [],
        myPlatforms: [],
        customPlatforms: [],
        hiddenMarket: [],
        privacy: {},
        myBadges: [],
        selectedTitleId: null,
        coins: STARTING_COINS,
        games: [],
        notifications: [],
        notificationsHasMore: false,
        notificationsLoadingMore: false,
        viewing: null,
        viewingLoading: false,
      });
      return;
    }
    const uidv = session.user.id;
    set({
      userId: uidv,
      email: session.user.email ?? null,
      providers: (session.user.identities ?? []).map((i) => i.provider),
    });

    const [{ data: prof }, { data: rows }, { data: notes }, { data: slotRows }, { data: badgeRows }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(
            "display_name, avatar_url, coins, charters, platforms, hidden_market, is_admin, general_slots, blocked, blocked_reason, custom_platforms, theme, privacy, selected_badge_id",
          )
          .eq("id", uidv)
          .single(),
        supabase
          .from("games")
          .select("*")
          .eq("user_id", uidv)
          .order("added_at", { ascending: false }),
        supabase
          .from("notifications")
          .select("*")
          .eq("user_id", uidv)
          .order("created_at", { ascending: false })
          .limit(NOTIF_PAGE),
        supabase
          .from("user_slots")
          .select("id, definition:slot_definitions(id, name, min_hours, max_hours, active)")
          .eq("user_id", uidv),
        supabase
          .from("user_badges")
          .select("badge:badges(id, slug, name, description, icon, prestige)")
          .eq("user_id", uidv)
          .is("revoked_at", null),
      ]);

    set({
      displayName: prof?.display_name ?? session.user.email ?? "Player",
      avatarUrl: (prof?.avatar_url as string | null) ?? null,
      coins: prof?.coins ?? STARTING_COINS,
      charters: typeof prof?.charters === "number" ? prof.charters : 0,
      isAdmin: Boolean(prof?.is_admin),
      generalSlots:
        typeof prof?.general_slots === "number" ? prof.general_slots : DEFAULT_GENERAL_SLOTS,
      blocked: Boolean(prof?.blocked),
      blockedReason: (prof?.blocked_reason as string | null) ?? null,
      myPlatforms: Array.isArray(prof?.platforms) ? (prof.platforms as string[]) : [],
      customPlatforms: Array.isArray(prof?.custom_platforms)
        ? (prof.custom_platforms as string[])
        : [],
      hiddenMarket: Array.isArray(prof?.hidden_market) ? (prof.hidden_market as number[]) : [],
      theme: (prof?.theme as string | null) || getThemeId(),
      privacy:
        prof?.privacy && typeof prof.privacy === "object"
          ? (prof.privacy as Privacy)
          : {},
      myBadges: jsonToBadges(
        ((badgeRows ?? []) as { badge: unknown }[])
          .map((r) => (Array.isArray(r.badge) ? r.badge[0] : r.badge))
          .filter(Boolean),
      ),
      selectedTitleId: (prof?.selected_badge_id as string | null) ?? null,
      myTargetedSlots: ((slotRows ?? []) as UserSlotRow[])
        .map(rowToTargetedSlot)
        .filter((s): s is TargetedSlot => s !== null),
      games: ((rows ?? []) as GameRow[]).map(rowToGame),
      notifications: ((notes ?? []) as NotificationRow[]).map(rowToNotification),
      notificationsHasMore: (notes ?? []).length === NOTIF_PAGE,
    });

    // Apply the saved theme so it follows the user across devices (unless they're
    // currently visiting someone else's themed Bazaar).
    if (!get().viewing) applyThemeId(get().theme);
  },

  signUp: async (email, password, displayName) => {
    if (!supabase) return;
    set({ busy: true, error: null, notice: null });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    set({ busy: false });
    if (error) {
      set({ error: error.message });
      return;
    }
    if (!data.session) {
      set({
        notice:
          "Account created. If email confirmation is enabled, check your inbox, then sign in.",
      });
    }
  },

  signIn: async (email, password) => {
    if (!supabase) return;
    set({ busy: true, error: null, notice: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ busy: false });
    if (error) set({ error: error.message });
  },

  signInWithGoogle: async () => {
    if (!supabase) return;
    set({ error: null, notice: null });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) set({ error: error.message });
    // On success the browser redirects to Google; nothing else to do here.
  },

  // Link a Google identity to the *currently signed-in* account. Requires
  // "Manual linking" to be enabled in Supabase. Redirects through Google.
  linkGoogle: async () => {
    if (!supabase) return;
    set({ error: null, notice: null });
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) set({ error: error.message });
  },

  unlinkGoogle: async () => {
    if (!supabase) return;
    set({ error: null, notice: null });
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) {
      set({ error: error.message });
      return;
    }
    const google = data?.identities?.find((i) => i.provider === "google");
    if (!google) return;
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(google);
    if (unlinkError) {
      set({ error: unlinkError.message });
      return;
    }
    // Reflect the removal immediately…
    set((s) => ({ providers: s.providers.filter((p) => p !== "google") }));
    // …then reconcile with the server's fresh user record. getSession() returns
    // the cached session (still lists the old identity), so use getUser().
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      set({ providers: (userData.user.identities ?? []).map((i) => i.provider) });
    }
  },

  signOut: async () => {
    // Drop presence first so a sign-out reads as offline immediately, instead of
    // lingering until last_seen_at ages out of the online window.
    const { userId } = get();
    if (supabase && userId) {
      await supabase
        .from("profiles")
        .update({ last_seen_at: null, activity: null })
        .eq("id", userId);
    }
    await supabase?.auth.signOut();
  },

  clearMessages: () => set({ error: null, notice: null }),

  // Change how you appear everywhere (header, leaderboard, other Bazaars).
  // Google sign-ups default to the email's local part (all lowercase); this lets
  // you fix the capitalization or pick something else entirely. Validated against
  // the same rules the UI shows so a bad value never reaches the (not-null) column.
  setDisplayName: async (name) => {
    const clean = cleanDisplayName(name);
    if (validateDisplayName(clean)) return false; // UI already blocks invalid input
    if (clean === get().displayName) return true; // nothing to do
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) {
      set({ displayName: clean }); // local mode: in-memory only
      return true;
    }
    // Don't set optimistically — names are unique, so the update can be rejected.
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: clean })
      .eq("id", userId);
    if (error) {
      // 23505 = unique violation on the case-insensitive display_name index.
      set({
        error:
          error.code === "23505"
            ? "That display name is already taken — try another."
            : error.message,
      });
      return false;
    }
    set({ displayName: clean, error: null });
    toast("Display name updated", Pencil);
    return true;
  },

  setMyPlatforms: async (ids) => {
    set({ myPlatforms: ids });
    const { cloud, userId } = get();
    if (!cloud) {
      saveLocalPlatforms(ids);
      return;
    }
    if (!supabase || !userId) return;
    const { error } = await supabase.from("profiles").update({ platforms: ids }).eq("id", userId);
    if (error) set({ error: error.message });
  },

  // Set the user's theme: apply + persist locally (so the no-flash script picks it
  // up next load) and sync to the profile (so it follows them across devices and
  // shows to visitors). Guest mode persists locally only.
  setTheme: async (id) => {
    setThemeId(id); // apply to <html> + localStorage
    set({ theme: id });
    const { cloud, userId } = get();
    if (!cloud) return;
    if (!supabase || !userId) return;
    const { error } = await supabase.from("profiles").update({ theme: id }).eq("id", userId);
    if (error) set({ error: error.message });
  },

  // Toggle one visitor-privacy flag (e.g. "hide_spend"). Persists the whole map.
  setPrivacy: async (key, value) => {
    const next: Privacy = { ...get().privacy, [key]: value };
    set({ privacy: next });
    toast(value ? "Hidden from visitors" : "Visible to visitors", value ? EyeOff : Eye);
    const { cloud, userId } = get();
    if (!cloud) return;
    if (!supabase || !userId) return;
    // Turning on "appear offline" also clears any stored presence immediately, so
    // it can't be read from the (publicly-readable) profile row.
    const patch: Record<string, unknown> = { privacy: next };
    if (key === PRIVACY_KEYS.appearOffline && value) {
      patch.last_seen_at = null;
      patch.activity = null;
    }
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) set({ error: error.message });
  },

  // Admin: set (or clear with null) a manual presence status. Persisted locally;
  // the heartbeat in App broadcasts it instead of the auto, navigation-derived
  // status while it's set. A blank value clears it (back to automatic).
  setActivityOverride: (value) => {
    const v = value && value.trim() ? value.trim() : null;
    try {
      if (v) localStorage.setItem(ACTIVITY_OVERRIDE_KEY, v);
      else localStorage.removeItem(ACTIVITY_OVERRIDE_KEY);
    } catch {
      // localStorage may be unavailable; the in-memory value still applies.
    }
    set({ activityOverride: v });
  },

  // Pick which held badge to show as your title (null = none). Server-validated
  // (set_selected_title checks you hold it); we optimistically reflect it locally.
  setSelectedTitle: async (badgeId) => {
    const prev = get().selectedTitleId;
    set({ selectedTitleId: badgeId });
    if (!supabase) return;
    const { error } = await supabase.rpc("set_selected_title", { p_badge: badgeId });
    if (error) {
      set({ selectedTitleId: prev, error: error.message });
    }
  },

  // The full badge catalog, for the admin grant UI. Public-readable.
  fetchBadges: async () => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("badges")
      .select("id, slug, name, description, icon, prestige")
      .order("prestige", { ascending: false })
      .order("name");
    if (error) {
      set({ error: error.message });
      return [];
    }
    return jsonToBadges(data);
  },

  // Admin: grant a badge to a user (idempotent server-side, notifies them).
  grantBadge: async (userId, badgeId) => {
    if (!supabase) return;
    const { error } = await supabase.rpc("admin_grant_badge", {
      p_user: userId,
      p_badge: badgeId,
    });
    if (error) set({ error: error.message });
  },

  // Admin: revoke a badge from a user (soft-revoke; preserves history).
  revokeBadge: async (userId, badgeId) => {
    if (!supabase) return;
    const { error } = await supabase.rpc("admin_revoke_badge", {
      p_user: userId,
      p_badge: badgeId,
    });
    if (error) set({ error: error.message });
  },

  // Heartbeat: record that you're active right now and what you're doing. Skipped
  // entirely when you've chosen to appear offline, so nothing is broadcast.
  pingPresence: async (activity) => {
    const { cloud, userId, privacy } = get();
    if (!cloud || !supabase || !userId || isAppearOffline(privacy)) return;
    await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString(), activity })
      .eq("id", userId);
    // Best-effort: presence failures are non-fatal and intentionally silent.
  },

  // Open another player's Bazaar read-only: fetch their public header + library,
  // then preview their theme (without clobbering your saved choice). Cloud-only.
  openUserBazaar: async (userId) => {
    if (!supabase) return;
    if (userId === get().userId) return; // that's just your own pages
    set({ viewingLoading: true, error: null });
    const [profileRes, libraryRes] = await Promise.all([
      supabase.rpc("view_profile", { p_user: userId }).single(),
      supabase.rpc("player_library", { p_user: userId }),
    ]);
    if (profileRes.error) {
      set({ viewingLoading: false, error: profileRes.error.message });
      return;
    }
    const header = rowToViewProfile(profileRes.data as ViewProfileRow);
    const games = ((libraryRes.data ?? []) as GameRow[]).map(rowToGame);
    set({
      viewing: { userId, games, ...header },
      viewingLoading: false,
    });
    applyThemeId(header.theme || "treasure");
  },

  // Leave a visit: drop the snapshot and restore your own theme.
  closeUserBazaar: () => {
    if (!get().viewing) return;
    set({ viewing: null });
    applyThemeId(get().theme);
  },

  // Resize/crop the chosen image, upload it to the user's folder in the 'avatars'
  // storage bucket (overwriting any previous one), then point the profile at the
  // new public URL. The ?v= cache-buster makes the fresh image show immediately.
  setAvatar: async (file) => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) return;
    try {
      const blob = await processAvatar(file);
      const path = `${userId}/avatar.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", userId);
      if (dbErr) throw dbErr;
      set({ avatarUrl: url });
      toast("Profile picture updated", ImagePlus);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Couldn't update your picture." });
    }
  },

  removeAvatar: async () => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) return;
    await supabase.storage.from("avatars").remove([`${userId}/avatar.jpg`]);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ avatarUrl: null });
    toast("Profile picture removed", Trash2);
  },

  // Add a custom platform/console label to the user's owned list. No-ops on a
  // blank, a duplicate (case-insensitive), or a built-in's label (use the toggle
  // for those). Persists to the profile (or localStorage in guest mode).
  addCustomPlatform: async (label) => {
    const trimmed = label.trim();
    if (!trimmed || isBuiltInPlatformLabel(trimmed)) return;
    const { customPlatforms, cloud, userId } = get();
    if (customPlatforms.some((p) => p.toLowerCase() === trimmed.toLowerCase())) return;
    const next = [...customPlatforms, trimmed];
    set({ customPlatforms: next });
    if (!cloud) {
      saveLocalCustomPlatforms(next);
      return;
    }
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from("profiles")
      .update({ custom_platforms: next })
      .eq("id", userId);
    if (error) set({ error: error.message });
  },

  removeCustomPlatform: async (label) => {
    const { customPlatforms, cloud, userId } = get();
    const next = customPlatforms.filter((p) => p !== label);
    if (next.length === customPlatforms.length) return;
    set({ customPlatforms: next });
    if (!cloud) {
      saveLocalCustomPlatforms(next);
      return;
    }
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from("profiles")
      .update({ custom_platforms: next })
      .eq("id", userId);
    if (error) set({ error: error.message });
  },

  hideMarketGame: async (rawgId) => {
    const { hiddenMarket, cloud, userId } = get();
    if (hiddenMarket.includes(rawgId)) return;
    const next = [...hiddenMarket, rawgId];
    set({ hiddenMarket: next });
    toast("Hidden from the Caravan", EyeOff);
    if (!cloud) {
      saveLocalHidden(next);
      return;
    }
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from("profiles")
      .update({ hidden_market: next })
      .eq("id", userId);
    if (error) set({ error: error.message });
  },

  clearHiddenMarket: async () => {
    const { cloud, userId } = get();
    set({ hiddenMarket: [] });
    if (!cloud) {
      saveLocalHidden([]);
      return;
    }
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from("profiles")
      .update({ hidden_market: [] })
      .eq("id", userId);
    if (error) set({ error: error.message });
  },

  setMaintenance: async (on, message) => {
    if (!supabase || !get().isAdmin) return;
    const { error } = await supabase
      .from("app_config")
      .update({ maintenance: on, message })
      .eq("id", 1);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({
      maintenanceFlag: on,
      maintenance: on && isProductionHost() && !readBypass(),
      maintenanceMessage: message,
    });
  },

  setShelveRefundPct: async (pct) => {
    const next = Math.max(0, Math.min(100, Math.round(pct)));
    const { cloud, isAdmin } = get();
    if (!cloud) {
      // Local guest mode has no admins/DB; just keep it in memory for the session.
      set({ shelveRefundPct: next });
      toast(`Shelve refund set to ${next}%`, Undo2);
      return;
    }
    if (!supabase || !isAdmin) return;
    const { error } = await supabase
      .from("app_config")
      .update({ shelve_refund_pct: next })
      .eq("id", 1);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ shelveRefundPct: next });
    toast(`Shelve refund set to ${next}%`, Undo2);
  },

  setReplayBonusPct: async (pct) => {
    const next = Math.max(0, Math.min(100, Math.round(pct)));
    const { cloud, isAdmin } = get();
    if (!cloud) {
      set({ replayBonusPct: next });
      toast(`Replay bonus set to ${next}%`, Trophy);
      return;
    }
    if (!supabase || !isAdmin) return;
    const { error } = await supabase
      .from("app_config")
      .update({ replay_bonus_pct: next })
      .eq("id", 1);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ replayBonusPct: next });
    toast(`Replay bonus set to ${next}%`, Trophy);
  },

  // Admin-set the app-wide coin skin (shown for everyone). Persists to
  // app_config in cloud mode; in-memory for the local/guest session.
  setDefaultCoin: async (variant) => {
    const { cloud, isAdmin } = get();
    if (!cloud) {
      set({ defaultCoin: variant });
      toast("Coin skin updated", Coins);
      return;
    }
    if (!supabase || !isAdmin) return;
    const { error } = await supabase
      .from("app_config")
      .update({ default_coin: variant })
      .eq("id", 1);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ defaultCoin: variant });
    toast("Coin skin updated", Coins);
  },

  // Admin-set the buy-price and finish-bounty formulas (live for everyone).
  // Normalized before saving so a partial/edited draft can't corrupt the config.
  setEconomyFormulas: async (price, bounty) => {
    const economy: EconomyConfig = {
      price: normalizeFormula(price, DEFAULT_PRICE_FORMULA),
      bounty: normalizeFormula(bounty, DEFAULT_BOUNTY_FORMULA),
    };
    const { cloud, isAdmin } = get();
    if (!cloud) {
      set({ economy });
      toast("Economy formulas updated", Coins);
      return;
    }
    if (!supabase || !isAdmin) return;
    const { error } = await supabase
      .from("app_config")
      .update({ price_formula: economy.price, bounty_formula: economy.bounty })
      .eq("id", 1);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ economy });
    toast("Economy formulas updated", Coins);
  },

  // Admin-set the coin reward paid when a catalog contribution is approved.
  setSubmissionReward: async (coins) => {
    const next = Math.max(0, Math.min(1000, Math.floor(coins)));
    const { cloud, isAdmin } = get();
    if (!cloud) {
      set({ submissionReward: next });
      toast(`Contribution reward set to ${next}`, Coins);
      return;
    }
    if (!supabase || !isAdmin) return;
    const { error } = await supabase
      .from("app_config")
      .update({ submission_reward: next })
      .eq("id", 1);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ submissionReward: next });
    toast(`Contribution reward set to ${next}`, Coins);
  },

  // Admin-set the coin cost of an Import Charter.
  setCharterCost: async (coins) => {
    const next = Math.max(0, Math.min(100000, Math.floor(coins)));
    const { cloud, isAdmin } = get();
    if (!cloud) {
      set({ charterCost: next });
      toast(`Charter cost set to ${next}`, Scroll);
      return;
    }
    if (!supabase || !isAdmin) return;
    const { error } = await supabase.from("app_config").update({ charter_cost: next }).eq("id", 1);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ charterCost: next });
    toast(`Charter cost set to ${next}`, Scroll);
  },

  // Admin-set the resale percentage returned when selling a charter back.
  setCharterResalePct: async (pct) => {
    const next = Math.max(0, Math.min(100, Math.floor(pct)));
    const { cloud, isAdmin } = get();
    if (!cloud) {
      set({ charterResalePct: next });
      toast(`Charter resale set to ${next}%`, Scroll);
      return;
    }
    if (!supabase || !isAdmin) return;
    const { error } = await supabase
      .from("app_config")
      .update({ charter_resale_pct: next })
      .eq("id", 1);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ charterResalePct: next });
    toast(`Charter resale set to ${next}%`, Scroll);
  },

  setCoins: async (amount) => {
    const next = Math.max(0, Math.floor(amount));
    const { cloud, games, isAdmin } = get();

    if (!cloud) {
      set({ coins: next });
      saveLocal(next, games);
      toast(`Coins set to ${next}`, Coins);
      return;
    }
    if (!supabase || !isAdmin) return;
    const { data, error } = await supabase.rpc("admin_set_coins", { p_coins: next });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ coins: data as number });
    toast(`Coins set to ${data as number}`, Coins);
  },

  fetchUsers: async () => {
    if (!supabase || !get().isAdmin) return [];
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as AdminUserRow[]).map(rowToAdminUser);
  },

  // Admin Stats dashboard: a user's rolled-up analytics for a [from, to) window
  // (null from = All-Time). The aggregation is server-side (admin_user_stats),
  // which re-checks the caller is an admin.
  fetchUserStats: async (userId, from, to) => {
    if (!supabase || !get().isAdmin) return null;
    const { data, error } = await supabase.rpc("admin_user_stats", {
      p_user: userId,
      p_from: from ? from.toISOString() : null,
      p_to: to.toISOString(),
    });
    if (error) {
      set({ error: error.message });
      return null;
    }
    const rows = (data ?? []) as UserStatsRow[];
    return rows[0] ? rowToUserStats(rows[0]) : null;
  },

  adminUpdateUser: async (user) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase.rpc("admin_update_user", {
      p_user: user.id,
      p_display_name: user.displayName,
      p_coins: user.coins,
      p_general_slots: user.generalSlots,
      p_is_admin: user.isAdmin,
      p_blocked: user.blocked,
      p_blocked_reason: user.blockedReason,
      p_hidden: user.hidden,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    // If an admin edited their own row, reflect the header-facing bits locally.
    if (user.id === get().userId) {
      set({
        displayName: user.displayName,
        coins: user.coins,
        generalSlots: user.generalSlots,
        isAdmin: user.isAdmin,
      });
    }
    toast(`Saved ${user.displayName}`, Pencil);
    return true;
  },

  // Send an affected user a notification about an admin action (best-effort —
  // a failure here never blocks the underlying change). The RPC enforces admin
  // rights and skips self-notifications.
  notifyUser: async (userId, title, body) => {
    if (!supabase || !get().isAdmin || userId === get().userId) return;
    await supabase.rpc("admin_notify", { p_user: userId, p_title: title, p_body: body });
  },

  adminDeleteUser: async (userId) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase.rpc("admin_delete_user", { p_user: userId });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("User deleted", Trash2);
    return true;
  },

  fetchSlotDefinitions: async () => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("slot_definitions")
      .select("id, name, min_hours, max_hours, active, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as SlotDefinitionRow[]).map(rowToSlotDefinition);
  },

  createSlotDefinition: async (name, minHours, maxHours) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase.from("slot_definitions").insert({
      name: name.trim(),
      min_hours: minHours,
      max_hours: maxHours,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast(`Created "${name.trim()}" slot type`, Gamepad2);
    return true;
  },

  updateSlotDefinition: async (def) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase
      .from("slot_definitions")
      .update({
        name: def.name.trim(),
        min_hours: def.minHours,
        max_hours: def.maxHours,
        active: def.active,
      })
      .eq("id", def.id);
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast(`Saved "${def.name.trim()}"`, Pencil);
    return true;
  },

  deleteSlotDefinition: async (id) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase.from("slot_definitions").delete().eq("id", id);
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Slot type deleted", Trash2);
    return true;
  },

  fetchUserSlots: async (userId) => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("user_slots")
      .select("id, definition:slot_definitions(id, name, min_hours, max_hours, active)")
      .eq("user_id", userId);
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as UserSlotRow[])
      .map(rowToTargetedSlot)
      .filter((s): s is TargetedSlot => s !== null);
  },

  grantUserSlot: async (userId, definitionId) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase
      .from("user_slots")
      .insert({ user_id: userId, definition_id: definitionId });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  revokeUserSlot: async (slotId) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase.from("user_slots").delete().eq("id", slotId);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  addGame: async (meta, status = "backlog") => {
    const { cloud, userId, games, coins } = get();
    if (meta.rawgId && games.some((g) => g.rawgId === meta.rawgId)) return;

    // Any platform typed on a copy that isn't built-in becomes an owned custom
    // platform, so it's offered everywhere from now on (addCustomPlatform skips
    // built-ins and duplicates).
    for (const label of new Set((meta.copies ?? []).map((c) => c.platform.trim()).filter(Boolean))) {
      await get().addCustomPlatform(label);
    }

    if (!cloud) {
      const game: Game = {
        ...meta,
        id: uid(),
        status,
        addedAt: Date.now(),
        finishedAt: status === "finished" ? Date.now() : undefined,
        playedHours: meta.playedHours ?? 0,
        copies: meta.copies ?? [],
      };
      const next = [game, ...games];
      set({ games: next });
      saveLocal(coins, next);
      addedToast(meta.title, status);
      return;
    }
    if (!userId || !supabase) return;

    const { data, error } = await supabase
      .from("games")
      .insert({
        user_id: userId,
        rawg_id: meta.rawgId ?? null,
        title: meta.title,
        released: meta.released ?? null,
        hours: meta.hours ?? null,
        rating: meta.rating ?? null,
        metacritic: meta.metacritic ?? null,
        genres: meta.genres ?? [],
        image: meta.image ?? null,
        stock_image: meta.image ?? null,
        original_image: meta.image ?? null,
        platforms: meta.platforms ?? [],
        developers: meta.developers ?? [],
        esrb: meta.esrb ?? null,
        played_hours: meta.playedHours ?? 0,
        copies: meta.copies ?? [],
        catalog_id: meta.catalogId ?? null,
        status,
        finished_at: status === "finished" ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: [rowToGame(data as GameRow), ...get().games] });
    addedToast(meta.title, status);
  },

  importWithCharter: async (id) => {
    const { cloud, games, coins, charters } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "wishlist") return;
    if (charters < 1) {
      toast("You need an Import Charter first", Scroll);
      return;
    }

    const celebrate = () =>
      set({ celebration: { id: Date.now(), title: game.title } });

    if (!cloud) {
      const nextCharters = charters - 1;
      const next = games.map((g) => (g.id === id ? { ...g, status: "backlog" as const } : g));
      const led = [
        localEvent("charter_consume", 0, coins, game.title, -1, nextCharters),
        ...get().ledger,
      ];
      set({ games: next, charters: nextCharters, ledger: led });
      saveLocal(coins, next, led, nextCharters);
      celebrate();
      toast(`Imported ${game.title} to your Bazaar`, Stamp);
      return;
    }
    if (!supabase) return;
    const { data, error } = await supabase.rpc("import_with_charter", { p_game: id });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({
      charters: data as number,
      games: get().games.map((g) => (g.id === id ? { ...g, status: "backlog" } : g)),
    });
    celebrate();
    toast(`Imported ${game.title} to your Bazaar`, Stamp);
  },

  buyCharter: async () => {
    const { cloud, coins, charters, charterCost } = get();

    if (!cloud) {
      if (coins < charterCost) {
        toast("Not enough coins for a charter", Coins);
        return;
      }
      const nc = coins - charterCost;
      const nch = charters + 1;
      const led = [localEvent("charter_buy", -charterCost, nc, null, 1, nch), ...get().ledger];
      set({ coins: nc, charters: nch, ledger: led });
      saveLocal(nc, get().games, led, nch);
      toast("Bought an Import Charter", Scroll);
      return;
    }
    if (!supabase) return;
    const { data, error } = await supabase.rpc("buy_charter").single();
    if (error) {
      set({ error: error.message });
      return;
    }
    const { coins: nc, charters: nch } = data as { coins: number; charters: number };
    set({ coins: nc, charters: nch });
    toast("Bought an Import Charter", Scroll);
  },

  sellCharter: async () => {
    const { cloud, coins, charters, charterCost, charterResalePct } = get();
    if (charters < 1) return;

    if (!cloud) {
      const resale = charterResale(charterCost, charterResalePct);
      const nc = coins + resale;
      const nch = charters - 1;
      const led = [localEvent("charter_sell", resale, nc, null, -1, nch), ...get().ledger];
      set({ coins: nc, charters: nch, ledger: led });
      saveLocal(nc, get().games, led, nch);
      toast(`Sold a charter for ${resale} coins`, Coins);
      return;
    }
    if (!supabase) return;
    const { data, error } = await supabase.rpc("sell_charter").single();
    if (error) {
      set({ error: error.message });
      return;
    }
    const { coins: nc, charters: nch } = data as { coins: number; charters: number };
    set({ coins: nc, charters: nch });
    toast("Sold an Import Charter", Coins);
  },

  clearCelebration: () => set({ celebration: null }),
  openCharters: () => set({ chartersOpen: true }),
  closeCharters: () => set({ chartersOpen: false }),

  bazaarToWishlist: async (id) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "backlog") return;

    if (!cloud) {
      const next = games.map((g) =>
        g.id === id ? { ...g, status: "wishlist" as const } : g,
      );
      set({ games: next });
      saveLocal(coins, next);
      toast(`Moved ${game.title} to your wishlist`, Heart);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.from("games").update({ status: "wishlist" }).eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: games.map((g) => (g.id === id ? { ...g, status: "wishlist" } : g)) });
    toast(`Moved ${game.title} to your wishlist`, Heart);
  },

  buyGame: async (id) => {
    const { cloud, games, coins, generalSlots, myTargetedSlots } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "backlog") return;
    const plan = planSlotForGame(game, playingGames(games), generalSlots, myTargetedSlots);
    if (!plan.ok) {
      toast("No open Now Playing slot — finish or shelve a game first", Lock);
      return;
    }
    const price = computeFormula(game, get().economy.price);
    if (coins < price) return;

    if (!cloud) {
      const next = games.map((g) =>
        g.id === id
          ? {
              ...g,
              status: "playing" as const,
              startedAt: Date.now(),
              pricePaid: price,
              slotId: plan.slotId,
            }
          : g,
      );
      const nc = coins - price;
      const led = [localEvent("purchase", -price, nc, game.title), ...get().ledger];
      set({ games: next, coins: nc, ledger: led });
      saveLocal(nc, next, led);
      toast(`Bought ${game.title} — now playing!`, Gamepad2);
      return;
    }
    if (!supabase) return;

    const { data, error } = await supabase
      .rpc("apply_purchase", { p_game: id, p_price: price })
      .single();
    if (error) {
      set({ error: error.message });
      return;
    }
    const { coins: newCoins, slot_id } = data as { coins: number; slot_id: string | null };
    set({
      coins: newCoins,
      games: games.map((g) =>
        g.id === id
          ? { ...g, status: "playing", startedAt: Date.now(), pricePaid: price, slotId: slot_id }
          : g,
      ),
    });
    toast(`Bought ${game.title} — now playing!`, Gamepad2);
  },

  // Reassign a playing game to a different Now Playing slot. slotId null = a
  // general slot; otherwise a targeted slot the game fits. Used to shift a short
  // game out of a general slot into a matching targeted one, freeing the general.
  moveGameToSlot: async (id, slotId) => {
    const { cloud, games, coins, myTargetedSlots } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing" || (game.slotId ?? null) === slotId) return;
    const slotName =
      slotId == null
        ? "general"
        : (myTargetedSlots.find((s) => s.id === slotId)?.definition.name ?? "slot");

    // A linked family shares one slot, so the whole playing unit moves together.
    const unit = occupantKey(game);
    const moveUnit = (gs: Game[]) =>
      gs.map((g) =>
        g.status === "playing" && occupantKey(g) === unit ? { ...g, slotId } : g,
      );

    if (!cloud) {
      const next = moveUnit(games);
      set({ games: next });
      saveLocal(coins, next);
      toast(`Moved ${game.title} to your ${slotName} slot`, Gamepad2);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("move_game_to_slot", { p_game: id, p_slot: slotId });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: moveUnit(get().games) });
    toast(`Moved ${game.title} to your ${slotName} slot`, Gamepad2);
  },

  // Link two of your games as editions of the same title (a "Game Family").
  // applyLink also merges their existing families if either already had one.
  linkGames: async (id, otherId) => {
    const { cloud, games, coins } = get();
    const a = games.find((g) => g.id === id);
    const b = games.find((g) => g.id === otherId);
    if (!a || !b || id === otherId || (a.familyId != null && a.familyId === b.familyId)) return;

    if (!cloud) {
      const next = applyLink(games, id, otherId);
      set({ games: next });
      saveLocal(coins, next);
      toast(`Linked ${a.title} & ${b.title}`, Link2);
      return;
    }
    if (!supabase) return;
    const { data, error } = await supabase.rpc("link_games", { p_game: id, p_other: otherId });
    if (error) {
      set({ error: error.message });
      return;
    }
    // The RPC returns the resolved family id; reflect the merge locally so any
    // pre-existing members on both sides adopt the same family.
    const fam = data as string;
    const oldFams = new Set(
      [a.familyId, b.familyId].filter((f): f is string => f != null),
    );
    set({
      games: get().games.map((g) =>
        g.id === id || g.id === otherId || (g.familyId != null && oldFams.has(g.familyId))
          ? { ...g, familyId: fam }
          : g,
      ),
    });
    toast(`Linked ${a.title} & ${b.title}`, Link2);
  },

  // Detach a game from its family. If only one member would remain, that lonely
  // member is unlinked too (mirrors applyUnlink / the unlink_game RPC).
  unlinkGame: async (id) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.familyId == null) return;

    if (!cloud) {
      const next = applyUnlink(games, id);
      set({ games: next });
      saveLocal(coins, next);
      toast(`Unlinked ${game.title}`, Unlink);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("unlink_game", { p_game: id });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: applyUnlink(get().games, id) });
    toast(`Unlinked ${game.title}`, Unlink);
  },

  // Rename a Game Family (the title on its Master Card). The name is stored on
  // every member of the family (denormalized, like family_id), so it's set on all
  // of them at once. An empty name clears it, reverting to the edition's title.
  setFamilyName: async (familyId, name) => {
    const { cloud, games, coins } = get();
    if (!familyId || !games.some((g) => g.familyId === familyId)) return;
    const value = name.trim() || undefined;
    const next = games.map((g) => (g.familyId === familyId ? { ...g, familyName: value } : g));
    set({ games: next });

    if (!cloud) {
      saveLocal(coins, next);
      toast("Family name saved", Pencil);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase
      .from("games")
      .update({ family_name: value ?? null })
      .eq("family_id", familyId);
    if (error) {
      set({ error: error.message });
      return;
    }
    toast("Family name saved", Pencil);
  },

  logPlaytime: async (id, hours, platform) => {
    const { cloud, games } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing" || !(hours > 0)) return;
    // Logging time tracks your hours for stats; coins are paid as a flat bounty
    // when you finish, not per hour (see finishGame).

    if (!cloud) {
      const played = (game.playedHours ?? 0) + hours;
      const next = games.map((g) => (g.id === id ? { ...g, playedHours: played } : g));
      set({ games: next });
      saveLocal(get().coins, next);
      toast(`${formatPlaytime(hours)} logged`, Gamepad2);
      return;
    }
    if (!supabase) return;

    const { data, error } = await supabase
      .rpc("log_playtime", { p_game: id, p_hours: hours, p_platform: platform ?? null })
      .single();
    if (error) {
      set({ error: error.message });
      return;
    }
    const { coins: newCoins, played_hours } = data as { coins: number; played_hours: number };
    set({
      coins: newCoins,
      games: get().games.map((g) => (g.id === id ? { ...g, playedHours: played_hours } : g)),
    });
    toast(`${formatPlaytime(hours)} logged`, Gamepad2);
  },

  // Set a game's total played hours directly — used to record time you'd already
  // put in before tracking. Deliberately awards NO coins (only logPlaytime does).
  setPlayedHours: async (id, hours) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game) return;
    const played = Math.max(0, Math.round(hours * 60) / 60); // clamp ≥0, snap to the minute

    if (!cloud) {
      const next = games.map((g) => (g.id === id ? { ...g, playedHours: played } : g));
      set({ games: next });
      saveLocal(coins, next);
      toast(`Playtime set to ${played}h`, Clock);
      return;
    }
    if (!supabase) return;

    const { error } = await supabase.from("games").update({ played_hours: played }).eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: games.map((g) => (g.id === id ? { ...g, playedHours: played } : g)) });
    toast(`Playtime set to ${played}h`, Clock);
  },

  // The caller's own logged play sessions for one game (newest first), read from
  // the append-only playtime_events log (RLS limits it to your own rows). Powers
  // the per-version time breakdown and the "remember last version" picker default.
  // Cloud-only — offline mode keeps no per-session history.
  fetchPlaySessions: async (id) => {
    if (!supabase || !get().cloud) return [];
    const { data, error } = await supabase
      .from("playtime_events")
      .select("platform, hours, created_at")
      .eq("game_id", id)
      .order("created_at", { ascending: false });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      platform: typeof r.platform === "string" ? r.platform : null,
      hours: typeof r.hours === "number" ? r.hours : 0,
      createdAt: r.created_at ? Date.parse(r.created_at as string) : 0,
    }));
  },

  // Replace a game's list of copies (the platforms you own it on + what each
  // cost). Purely informational metadata — never touches coins or status.
  setGameCopies: async (id, copies) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game) return;
    const next = games.map((g) => (g.id === id ? { ...g, copies } : g));
    set({ games: next });

    if (!cloud) {
      saveLocal(coins, next);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.from("games").update({ copies }).eq("id", id);
    if (error) set({ error: error.message });
  },

  // Set/overwrite a game's single progress note ("where I left off"). Empty
  // string clears it. One mutable string per game — no history.
  setProgressNote: async (id, note) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game) return;
    const trimmed = note.trim();
    const value = trimmed || undefined;
    const next = games.map((g) => (g.id === id ? { ...g, progressNote: value } : g));
    set({ games: next });

    if (!cloud) {
      saveLocal(coins, next);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase
      .from("games")
      .update({ progress_note: trimmed || null })
      .eq("id", id);
    if (error) set({ error: error.message });
  },

  // Edit a game's user-facing fields in one go (used by the Edit Game modal).
  // Like setPlayedHours, changing playedHours here awards NO coins. Status, coins
  // and reward snapshots are intentionally not editable.
  editGame: async (id, patch) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game) return;

    // Pick up any newly-typed custom platforms from the edited copies.
    for (const label of new Set(patch.copies.map((c) => c.platform.trim()).filter(Boolean))) {
      await get().addCustomPlatform(label);
    }

    const title = patch.title.trim() || game.title;
    const released = patch.released?.trim() ? patch.released : undefined;
    const hours = Number.isFinite(patch.hours) && (patch.hours ?? 0) >= 0 ? patch.hours : undefined;
    const playedHours = Math.max(0, Math.round(patch.playedHours * 60) / 60); // ≥0, snap to the minute
    const copies = patch.copies;
    const platforms = patch.platforms ? mergePlatforms(patch.platforms) : (game.platforms ?? []);

    const next = games.map((g) =>
      g.id === id ? { ...g, title, released, hours, playedHours, copies, platforms } : g,
    );
    set({ games: next });

    if (!cloud) {
      saveLocal(coins, next);
      toast(`Saved ${title}`, Pencil);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase
      .from("games")
      .update({
        title,
        released: released ?? null,
        hours: hours ?? null,
        played_hours: playedHours,
        copies,
        platforms,
      })
      .eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    // Platform/metadata changes are no longer shared instantly — global catalog
    // edits go through the moderation queue (Suggest Edit). This edit only
    // touches the user's own copy.
    toast(`Saved ${title}`, Pencil);
  },

  // Fetch the moderated catalog record for a RAWG game, so every approved edit
  // (not just platforms) becomes the default when the game is added or re-added.
  // Cloud-only; returns null when there's no catalog row or on error.
  fetchCatalogGame: async (rawgId) => {
    if (!supabase || !get().cloud || !rawgId) return null;
    const { data } = await supabase
      .from("catalog_games")
      .select("id, title, image, platforms, genres, developers, released, hours")
      .eq("rawg_id", rawgId)
      .maybeSingle();
    if (!data) return null;
    const r = data as Record<string, unknown>;
    return {
      catalogId: r.id as string,
      title: typeof r.title === "string" ? r.title : "",
      image: typeof r.image === "string" ? r.image : "",
      platforms: Array.isArray(r.platforms) ? (r.platforms as string[]) : [],
      genres: Array.isArray(r.genres) ? (r.genres as string[]) : [],
      developers: Array.isArray(r.developers) ? (r.developers as string[]) : [],
      released: typeof r.released === "string" ? r.released : "",
      hours: typeof r.hours === "number" ? r.hours : null,
    };
  },

  // Search the moderated catalog by title: community-added games RAWG doesn't know
  // about AND RAWG games whose approved title differs from RAWG's (so a renamed
  // game is findable by its new name). Merged into the Add-game suggestions.
  // Cloud-only. (Catalog rows that only carry platforms have a null title and are
  // skipped, so this doesn't surface every backfilled entry.)
  searchCatalogGames: async (query) => {
    const q = query.trim();
    if (!supabase || !get().cloud || q.length < 2) return [];
    const { data } = await supabase
      .from("catalog_games")
      .select("id, rawg_id, title, image, platforms, genres, developers, released, hours")
      .not("title", "is", null)
      .ilike("title", `%${q}%`)
      .limit(8);
    return ((data ?? []) as Record<string, unknown>[])
      .filter((r) => typeof r.title === "string" && (r.title as string).trim())
      .map((r) => ({
        title: r.title as string,
        released: (r.released as string | null) ?? undefined,
        hours: typeof r.hours === "number" ? r.hours : undefined,
        image: (r.image as string | null) ?? undefined,
        genres: Array.isArray(r.genres) ? (r.genres as string[]) : [],
        platforms: Array.isArray(r.platforms) ? (r.platforms as string[]) : [],
        developers: Array.isArray(r.developers) ? (r.developers as string[]) : [],
        rawgId: (r.rawg_id as number | null) ?? undefined,
        catalogId: r.id as string,
      }));
  },

  // Batch-fetch catalog overrides for a set of RAWG ids, so search results can be
  // enriched with approved edits (title, cover, etc.) before they're shown.
  fetchCatalogOverrides: async (rawgIds) => {
    const out: Record<number, CatalogOverride> = {};
    if (!supabase || !get().cloud || rawgIds.length === 0) return out;
    const { data } = await supabase
      .from("catalog_games")
      .select("id, rawg_id, title, image, platforms, genres, developers, released, hours")
      .in("rawg_id", rawgIds);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      if (typeof r.rawg_id !== "number") continue;
      out[r.rawg_id] = {
        catalogId: r.id as string,
        title: typeof r.title === "string" ? r.title : "",
        image: typeof r.image === "string" ? r.image : "",
        platforms: Array.isArray(r.platforms) ? (r.platforms as string[]) : [],
        genres: Array.isArray(r.genres) ? (r.genres as string[]) : [],
        developers: Array.isArray(r.developers) ? (r.developers as string[]) : [],
        released: typeof r.released === "string" ? r.released : "",
        hours: typeof r.hours === "number" ? r.hours : null,
      };
    }
    return out;
  },

  // Upload a proposed cover (downscaled JPEG) to the user's folder in the
  // 'catalog' bucket and return its public URL (used by the submission form).
  uploadCatalogCover: async (file) => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) return null;
    try {
      const blob = await downscaleImage(file, 1000);
      const path = `${userId}/${uid()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("catalog")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("catalog").getPublicUrl(path);
      return `${data.publicUrl}?v=${Date.now()}`;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Couldn't upload that image." });
      return null;
    }
  },

  // File a catalog contribution (edit or new game) into the moderation queue. The
  // proposed cover should already be a URL (upload via uploadCatalogCover first).
  submitGameSubmission: async (input) => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) {
      toast("Sign in to suggest catalog changes.", Lightbulb);
      return false;
    }
    const p = input.proposed;
    const { error } = await supabase.from("game_submissions").insert({
      submitter: userId,
      kind: input.kind,
      catalog_id: input.catalogId,
      rawg_id: input.rawgId,
      title: p.title.trim(),
      image: p.image.trim() || null,
      platforms: p.platforms,
      genres: p.genres,
      developers: p.developers,
      released: p.released.trim() || null,
      hours: p.hours,
      before: input.before,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Thanks! Your suggestion is awaiting review.", Lightbulb);
    return true;
  },

  // The caller's own contributions, newest first, with their review status.
  fetchMySubmissions: async () => {
    const { cloud, userId } = get();
    if (!supabase || !cloud || !userId) return [];
    const { data, error } = await supabase
      .from("game_submissions")
      .select(
        "id, kind, title, image, platforms, genres, developers, released, hours, before, status, review_note, reward, approved_fields, created_at, reviewed_at",
      )
      .eq("submitter", userId)
      .order("created_at", { ascending: false });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as MySubmissionRow[]).map(rowToMySubmission);
  },

  // Admin: the pending moderation queue with diff baselines.
  fetchGameSubmissions: async () => {
    if (!supabase || !get().isAdmin) return [];
    const { data, error } = await supabase.rpc("list_game_submissions");
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as GameSubmissionRow[]).map(rowToGameSubmission);
  },

  // Admin: how many submissions are awaiting review (drives the sidebar badge).
  // Returns 0 for non-admins / local mode.
  refreshSubmissionCount: async () => {
    if (!supabase || !get().cloud || !get().isAdmin) {
      set({ submissionCount: 0 });
      return;
    }
    // Server-side count that excludes hidden (test/bot) accounts.
    const { data, error } = await supabase.rpc("pending_submission_count");
    if (!error) set({ submissionCount: typeof data === "number" ? data : 0 });
  },

  // Admin: approve a submission — commits the master record, cascades to every
  // copy, rewards the submitter, and notifies them (all server-side).
  approveSubmission: async (id, note, fields) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase.rpc("approve_game_submission", {
      p_id: id,
      p_note: note,
      p_fields: fields, // null = approve all (full reward); a subset is partial
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast(fields ? "Partly approved — selected changes are live." : "Approved — changes are live.", Trophy);
    void get().refreshSubmissionCount();
    return true;
  },

  // Admin: reject a submission and notify the submitter.
  rejectSubmission: async (id, note) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase.rpc("reject_game_submission", { p_id: id, p_note: note });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Submission rejected.", Undo2);
    void get().refreshSubmissionCount();
    return true;
  },

  // Upload a custom cover image for a game (downscaled JPEG) to the user's folder
  // in the 'covers' bucket, then point game.image at the new public URL. Cloud-
  // only (mirrors setAvatar — storage needs an account). The ?v= cache-buster
  // makes a replacement show immediately.
  setGameImage: async (id, file) => {
    const { cloud, userId, games } = get();
    if (!cloud || !supabase || !userId) return;
    const game = games.find((g) => g.id === id);
    if (!game) return;
    try {
      const blob = await downscaleImage(file, 1000);
      const path = `${userId}/${id}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("covers")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("covers").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase.from("games").update({ image: url }).eq("id", id);
      if (dbErr) throw dbErr;
      set({ games: get().games.map((g) => (g.id === id ? { ...g, image: url } : g)) });
      toast("Cover image updated", ImagePlus);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Couldn't update that cover." });
    }
  },

  // Remove a game's custom cover (best-effort storage delete) and clear the image.
  clearGameImage: async (id) => {
    const { cloud, userId, games } = get();
    if (!cloud || !supabase || !userId) return;
    const game = games.find((g) => g.id === id);
    if (!game) return;
    await supabase.storage.from("covers").remove([`${userId}/${id}.jpg`]);
    const { error } = await supabase.from("games").update({ image: null }).eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map((g) => (g.id === id ? { ...g, image: undefined } : g)) });
    toast("Cover image removed", Trash2);
  },

  // Revert to the original catalog cover (games.stock_image), undoing a custom
  // upload or removal. Best-effort deletes the custom cover blob since it's no
  // longer referenced. No-op if there's no stock image to restore.
  restoreGameImage: async (id) => {
    const { cloud, userId, games } = get();
    if (!cloud || !supabase || !userId) return;
    const game = games.find((g) => g.id === id);
    if (!game?.stockImage) return;
    await supabase.storage.from("covers").remove([`${userId}/${id}.jpg`]);
    const { error } = await supabase.from("games").update({ image: game.stockImage }).eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map((g) => (g.id === id ? { ...g, image: game.stockImage } : g)) });
    toast("Default cover restored", ImagePlus);
  },

  // Revert a game's cover to the supplied original URL (the copy's stored
  // original_image, or the cover re-fetched from RAWG). Best-effort deletes the
  // custom cover blob since it's no longer referenced.
  restoreOriginalImage: async (id, url) => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId || !url) return;
    await supabase.storage.from("covers").remove([`${userId}/${id}.jpg`]);
    const { error } = await supabase.from("games").update({ image: url }).eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map((g) => (g.id === id ? { ...g, image: url } : g)) });
    toast("Original cover restored", ImagePlus);
  },

  finishGame: async (id) => {
    const { cloud, games, coins, replayBonusPct } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing") return;
    // A linked edition only pays full the first time its family is cleared;
    // later re-clears of other editions pay the smaller Replay Bonus.
    const replay = isReplayFinish(games, game);
    const fullReward = computeFormula(game, get().economy.bounty);
    const reward = computeFinishReward(replay, fullReward, replayBonusPct);

    const finishToast = () =>
      toast(
        replay
          ? `Replay clear · ${game.title} · +🪙 ${reward}`
          : `Finished ${game.title} · +🪙 ${reward}`,
        Trophy,
      );

    if (!cloud) {
      const next = games.map((g) =>
        g.id === id
          ? { ...g, status: "finished" as const, finishedAt: Date.now(), reward, slotId: null }
          : g,
      );
      const nc = coins + reward;
      const led = [
        localEvent(replay ? "replay_bonus" : "bounty", reward, nc, game.title),
        ...get().ledger,
      ];
      set({ games: next, coins: nc, ledger: led });
      saveLocal(nc, next, led);
      finishToast();
      return;
    }
    if (!supabase) return;

    // The server re-decides replay vs. first-clear (so the reward can't be
    // farmed) and returns the coins actually awarded.
    const { data, error } = await supabase
      .rpc("apply_finish", {
        p_game: id,
        p_full_reward: fullReward,
        p_replay_reward: computeReplayBonus(fullReward, replayBonusPct),
      })
      .single();
    if (error) {
      set({ error: error.message });
      return;
    }
    const { coins: newCoins, reward: awarded, replay: wasReplay } = data as {
      coins: number;
      reward: number;
      replay: boolean;
    };
    set({
      coins: newCoins,
      games: games.map((g) =>
        g.id === id
          ? { ...g, status: "finished", finishedAt: Date.now(), reward: awarded, slotId: null }
          : g,
      ),
    });
    toast(
      wasReplay
        ? `Replay clear · ${game.title} · +🪙 ${awarded}`
        : `Finished ${game.title} · +🪙 ${awarded}`,
      Trophy,
    );
  },

  // "Shelve It": drop a game from Now Playing back to the backlog. You're
  // refunded shelveRefundPct% of what you paid for it; the rest is forfeited.
  abandonGame: async (id) => {
    const { cloud, games, coins, shelveRefundPct } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing") return;

    if (!cloud) {
      const base = game.pricePaid ?? computeFormula(game, get().economy.price);
      const refund = computeShelveRefund(base, shelveRefundPct);
      const next = games.map((g) =>
        g.id === id
          ? {
              ...g,
              status: "backlog" as const,
              startedAt: undefined,
              pricePaid: undefined,
              slotId: null,
            }
          : g,
      );
      const nc = coins + refund;
      const led = [localEvent("shelve_refund", refund, nc, game.title), ...get().ledger];
      set({ games: next, coins: nc, ledger: led });
      saveLocal(nc, next, led);
      toast(
        refund > 0 ? `Shelved ${game.title} · +🪙 ${refund} refunded` : `Shelved ${game.title}`,
        Undo2,
      );
      return;
    }
    if (!supabase) return;

    const { data, error } = await supabase.rpc("apply_shelve", { p_game: id }).single();
    if (error) {
      set({ error: error.message });
      return;
    }
    const { coins: newCoins, refund } = data as { coins: number; refund: number };
    set({
      coins: newCoins,
      games: games.map((g) =>
        g.id === id
          ? { ...g, status: "backlog", startedAt: undefined, pricePaid: undefined, slotId: null }
          : g,
      ),
    });
    toast(
      refund > 0 ? `Shelved ${game.title} · +🪙 ${refund} refunded` : `Shelved ${game.title}`,
      Undo2,
    );
  },

  // Page through the immutable economy ledger, newest-first. Cloud reads from
  // coin_events (RLS limits it to the caller's own rows); guest mode pages the
  // locally-mirrored ledger. `done` signals there are no older rows to load.
  fetchLedger: async (offset) => {
    const PAGE = 50;
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) {
      const all = sortLedger(get().ledger);
      const entries = all.slice(offset, offset + PAGE);
      return { entries, done: offset + entries.length >= all.length };
    }
    const { data, error } = await supabase
      .from("coin_events")
      .select(
        "id, kind, coin_delta, charter_delta, coin_balance_after, charter_balance_after, game_title, label, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) {
      set({ error: error.message });
      return { entries: [], done: true };
    }
    const rows = (data ?? []) as LedgerRow[];
    return { entries: rows.map(rowToLedgerEntry), done: rows.length < PAGE };
  },

  fetchLedgerTotals: async () => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) return computeTotals(get().ledger);
    const { data, error } = await supabase.rpc("ledger_totals").single();
    if (error || !data) {
      if (error) set({ error: error.message });
      return { coinsIn: 0, coinsOut: 0, chartersIn: 0, chartersOut: 0 };
    }
    const d = data as {
      coins_in: number;
      coins_out: number;
      charters_in: number;
      charters_out: number;
    };
    return {
      coinsIn: Number(d.coins_in),
      coinsOut: Number(d.coins_out),
      chartersIn: Number(d.charters_in),
      chartersOut: Number(d.charters_out),
    };
  },

  removeGame: async (id) => {
    const { cloud, games, coins } = get();
    if (!cloud) {
      const next = games.filter((g) => g.id !== id);
      set({ games: next });
      saveLocal(coins, next);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.from("games").delete().eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: games.filter((g) => g.id !== id) });
  },

  fetchLeaderboard: async () => {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("leaderboard");
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as {
      id: string;
      display_name: string;
      avatar_url: string | null;
      coins: number;
      games_finished: number;
      hours_finished: number;
      last_seen_at: string | null;
      activity: string | null;
      title: unknown;
    }[]).map((r) => ({
      id: r.id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url ?? null,
      coins: r.coins,
      gamesFinished: Number(r.games_finished),
      hoursFinished: Number(r.hours_finished),
      lastSeenAt: r.last_seen_at ? Date.parse(r.last_seen_at) : null,
      activity: r.activity ?? null,
      title: jsonToTitle(r.title),
    }));
  },

  fetchPlayerLibrary: async (playerId) => {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("player_library", { p_user: playerId });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as GameRow[]).map(rowToGame);
  },

  fetchIssues: async () => {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("list_feature_requests");
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as IssueRow[]).map(rowToIssue);
  },

  submitIssue: async (title, description, kind, files = [], tags = [], priority = "medium") => {
    const { userId, isAdmin } = get();
    if (!supabase || !userId) return null;
    const { data, error } = await supabase
      .from("issues")
      .insert({
        user_id: userId,
        kind,
        title: title.trim(),
        description: description.trim() || null,
        is_admin_item: isAdmin,
        tags,
        priority,
      })
      .select("id")
      .single();
    if (error) {
      set({ error: error.message });
      return null;
    }
    // Attachments need the new request's id, so they upload after the insert.
    const requestId = (data as { id: string }).id;
    for (const file of files) {
      await get().uploadAttachment(requestId, file);
    }
    toast("Request submitted", Lightbulb);
    return requestId;
  },

  fetchRequestAttachments: async (requestId) => {
    if (!supabase) return [];
    // Report-level attachments only — comment attachments (comment_id set) come
    // back embedded in list_request_comments.
    const { data, error } = await supabase
      .from("issue_attachments")
      .select("*")
      .eq("request_id", requestId)
      .is("comment_id", null)
      .order("created_at", { ascending: true });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as IssueAttachmentRow[]).map(rowToIssueAttachment);
  },

  // Process (downscale images) + upload one file to the 'attachments' bucket under
  // <uid>/<requestId>/, then record it. Returns the stored attachment, or null on
  // a rejected/failed file (with an error message set).
  uploadAttachment: async (requestId, file, commentId = null) => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) return null;
    const reason = validateFile(file);
    if (reason) {
      set({ error: reason });
      return null;
    }
    try {
      const { blob, contentType, name } = await prepareUpload(file);
      const safe = name.replace(/[^\w.\-]+/g, "_");
      const path = `${userId}/${requestId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, blob, { contentType, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("attachments").getPublicUrl(path);
      const { data: row, error: dbErr } = await supabase
        .from("issue_attachments")
        .insert({
          request_id: requestId,
          comment_id: commentId,
          user_id: userId,
          url: pub.publicUrl,
          path,
          name,
          content_type: contentType,
          size: blob.size,
        })
        .select("*")
        .single();
      if (dbErr) throw dbErr;
      return rowToIssueAttachment(row as IssueAttachmentRow);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Couldn't upload that file." });
      return null;
    }
  },

  deleteAttachment: async (att) => {
    if (!supabase) return false;
    // Remove the DB row first (RLS-guarded), then best-effort delete the file
    // (only its owner can; an admin deleting someone else's leaves a harmless,
    // unreferenced object in the public bucket).
    const { error } = await supabase.from("issue_attachments").delete().eq("id", att.id);
    if (error) {
      set({ error: error.message });
      return false;
    }
    await supabase.storage.from("attachments").remove([att.path]);
    return true;
  },

  voteIssue: async (requestId, on) => {
    const { userId } = get();
    if (!supabase || !userId) return false;
    const { error } = on
      ? await supabase.from("issue_votes").insert({ request_id: requestId, user_id: userId })
      : await supabase
          .from("issue_votes")
          .delete()
          .eq("request_id", requestId)
          .eq("user_id", userId);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  setRequestStatus: async (requestId, status) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase
      .from("issues")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", requestId);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  editIssue: async (requestId, title, description, kind, tags, priority) => {
    if (!supabase) return false;
    const { error } = await supabase.rpc("edit_feature_request", {
      p_id: requestId,
      p_title: title.trim(),
      p_description: description.trim(),
      p_kind: kind,
      p_tags: tags,
      p_priority: priority,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  deleteIssue: async (requestId) => {
    if (!supabase) return false;
    // Best-effort: clear this request's attachment files first (the DB rows
    // cascade-delete with the request). Storage RLS only lets the owner remove
    // their files, so an admin deleting someone else's report just leaves the
    // (harmless, public) objects behind.
    const paths = (await get().fetchRequestAttachments(requestId)).map((a) => a.path);
    if (paths.length) await supabase.storage.from("attachments").remove(paths);
    const { error } = await supabase.from("issues").delete().eq("id", requestId);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  // Submitter sign-off on an item awaiting their feedback: approve (-> done) or
  // request changes (-> in_progress). The RPC enforces owner + awaiting_feedback.
  respondIssue: async (requestId, approve) => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("respond_feature_request", {
      p_id: requestId,
      p_approve: approve,
    });
    if (error) {
      set({ error: error.message });
      return null;
    }
    toast(approve ? "Approved — marked done" : "Changes requested", Lightbulb);
    return data as IssueStatus;
  },

  fetchRequestComments: async (requestId) => {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("list_request_comments", { p_request: requestId });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as CommentRow[]).map(rowToComment);
  },

  addComment: async (requestId, body, parentId = null, files = []) => {
    const { userId } = get();
    if (!supabase || !userId) return false;
    const trimmed = body.trim();
    if (!trimmed) return false;
    const { data, error } = await supabase
      .from("issue_comments")
      .insert({
        request_id: requestId,
        user_id: userId,
        parent_id: parentId,
        body: trimmed,
      })
      .select("id")
      .single();
    if (error) {
      set({ error: error.message });
      return false;
    }
    // Attachments need the new comment's id, so they upload after the insert.
    const commentId = (data as { id: string }).id;
    for (const file of files) {
      await get().uploadAttachment(requestId, file, commentId);
    }
    return true;
  },

  editComment: async (commentId, body) => {
    if (!supabase) return false;
    const trimmed = body.trim();
    if (!trimmed) return false;
    const { error } = await supabase
      .from("issue_comments")
      .update({ body: trimmed, updated_at: new Date().toISOString() })
      .eq("id", commentId);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  deleteComment: async (commentId) => {
    if (!supabase) return false;
    const { error } = await supabase.from("issue_comments").delete().eq("id", commentId);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  // All links touching a request (either direction). The caller resolves each
  // related issue's title/status from the already-loaded board list.
  fetchRequestRelations: async (requestId) => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("issue_relations")
      .select("*")
      .or(`from_request.eq.${requestId},to_request.eq.${requestId}`);
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as IssueRelationRow[]).map(rowToIssueRelation);
  },

  addRequestRelation: async (perspective, sourceId, targetId) => {
    const { userId } = get();
    if (!supabase || !userId) return false;
    if (sourceId === targetId) return false;
    const { fromRequest, toRequest, kind } = toCanonicalRelation(perspective, sourceId, targetId);
    const { error } = await supabase.from("issue_relations").insert({
      from_request: fromRequest,
      to_request: toRequest,
      kind,
      created_by: userId,
    });
    if (error) {
      // A duplicate link (unique violation) isn't a real failure — the link the
      // user wanted already exists, so treat it as success.
      if (error.code === "23505") return true;
      set({ error: error.message });
      return false;
    }
    return true;
  },

  removeRequestRelation: async (relationId) => {
    if (!supabase) return false;
    const { error } = await supabase.from("issue_relations").delete().eq("id", relationId);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  toggleReaction: async (commentId, emoji, on) => {
    const { userId } = get();
    if (!supabase || !userId) return false;
    const { error } = on
      ? await supabase
          .from("comment_reactions")
          .insert({ comment_id: commentId, user_id: userId, emoji })
      : await supabase
          .from("comment_reactions")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", userId)
          .eq("emoji", emoji);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  // Refresh the newest page (called when the bell opens). Resets pagination.
  fetchNotifications: async () => {
    const { userId } = get();
    if (!supabase || !userId) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(NOTIF_PAGE);
    if (error) {
      set({ error: error.message });
      return;
    }
    const list = ((data ?? []) as NotificationRow[]).map(rowToNotification);
    set({ notifications: list, notificationsHasMore: list.length === NOTIF_PAGE });
  },

  // Append the next page of older notifications (driven by scrolling the panel).
  // Guards against re-entrancy and the end of the list; dedupes by id so a new
  // notification arriving mid-scroll can't double up at a page boundary.
  loadMoreNotifications: async () => {
    const { userId, notifications, notificationsHasMore, notificationsLoadingMore } = get();
    if (!supabase || !userId || !notificationsHasMore || notificationsLoadingMore) return;
    set({ notificationsLoadingMore: true });
    const from = notifications.length;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, from + NOTIF_PAGE - 1);
    if (error) {
      set({ error: error.message, notificationsLoadingMore: false });
      return;
    }
    const page = ((data ?? []) as NotificationRow[]).map(rowToNotification);
    const have = new Set(get().notifications.map((n) => n.id));
    set({
      notifications: [...get().notifications, ...page.filter((n) => !have.has(n.id))],
      notificationsHasMore: page.length === NOTIF_PAGE,
      notificationsLoadingMore: false,
    });
  },

  markNotificationRead: async (id) => {
    const { notifications } = get();
    const target = notifications.find((n) => n.id === id);
    if (!target || target.readAt) return;
    const now = Date.now();
    set({ notifications: notifications.map((n) => (n.id === id ? { ...n, readAt: now } : n)) });
    if (!supabase) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date(now).toISOString() })
      .eq("id", id);
    if (error) set({ error: error.message });
  },

  markAllNotificationsRead: async () => {
    const { notifications, userId } = get();
    if (!notifications.some((n) => !n.readAt)) return;
    const now = Date.now();
    set({ notifications: notifications.map((n) => (n.readAt ? n : { ...n, readAt: now })) });
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date(now).toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) set({ error: error.message });
  },
}));
