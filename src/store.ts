import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type {
  AdminUser,
  AppNotification,
  Badge,
  IssueAttachment,
  IssueComment,
  IssueEffort,
  IssueKind,
  IssuePriority,
  IssueRelation,
  Issue,
  IssueStatus,
  Compilation,
  CopyFormat,
  Game,
  GameCopy,
  GameMeta,
  GameStatus,
  GameSubmission,
  LedgerEntry,
  LedgerTotals,
  MySubmission,
  Privacy,
  Role,
  UserStats,
  Friend,
  FriendRequest,
  FriendshipStatus,
  UserSearchResult,
  ActivityEvent,
  Message,
  MessageImage,
  Conversation,
  PendingUndo,
  Report,
  ReportKind,
  ReportReason,
  ReportAction,
} from "./types";
import { PERMISSION_KEYS, type Permission } from "./lib/permissions";
import type { CatalogFields, CatalogOverride, CommunityCatalogEntry } from "./lib/submissions";
import { revertResultMessage, normalizeCatalogFields } from "./lib/submissions";
import { applyThemeId, getThemeId, setThemeId } from "./lib/theme";
import { formatPlaytime } from "./lib/playtime";
import {
  splitEvenly,
  toCents,
  fromCents,
  distributeAcrossCopies,
  withBundleReleased,
  type CompilationChildDraft,
  type CompilationContainerDraft,
} from "./lib/compilations";
import { templateSignature, templateGamesToChildDrafts } from "./lib/compilationTemplates";
import type {
  CompilationTemplate,
  CompilationTemplateSubmission,
  ParentTemplate,
  TemplateContent,
  TemplateGame,
} from "./lib/compilationTemplates";
import { summarizePlatformPlaytime, type PlaySession } from "./lib/platformPlaytime";
import { downscaleImage } from "./lib/image";
import { isAppearOffline, PRIVACY_KEYS } from "./lib/privacy";
import {
  computeReplayBonus,
  computeFinishReward,
  computeCompletionBonus,
  computeCompletionReward,
  computeShelveRefund,
  computeFamilyDiscountPrice,
  REPLAY,
  COMPLETION,
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
  isReplaySlot,
  canEnterRotation,
  canEnterLane,
  laneOf,
  type Lane,
  type SlotChoice,
  type SlotDefinition,
  type SlotPlan,
  type TargetedSlot,
} from "./lib/slots";
import {
  rotationPeriodStart,
  DEFAULT_ROTATION_SLOTS,
  DEFAULT_ROTATION_CHECKIN_REWARD,
  DEFAULT_ROTATION_RESET,
  type RotationResetConfig,
} from "./lib/rotation";
import { autoFinishTag, type FinishTag } from "./lib/finishTags";
import { applyLink, applyUnlink, isReplayFinish, isFamilyDiscounted, occupantKey } from "./lib/families";
import { isPrerequisiteLocked, wouldCreateCycle } from "./lib/prerequisites";
import { coerceMilestoneRow, sortMilestones, type GameMilestone, type MilestoneKind } from "./lib/milestones";
import { coerceCoinVariant, DEFAULT_COIN, type CoinVariant } from "./lib/coins";
import { isBuiltInPlatformLabel, mergePlatforms } from "./lib/platforms";
import { cleanDisplayName, validateDisplayName } from "./lib/displayName";
import {
  supabase,
  isCloudConfigured,
  rowToGame,
  rowToCompilation,
  rowToCompilationTemplate,
  rowToCompilationSubmission,
  rowToParentTemplate,
  type ParentTemplateRow,
  rowToIssue,
  rowToIssueAttachment,
  rowToComment,
  rowToIssueRelation,
  rowToNotification,
  rowToAdminUser,
  rowToRole,
  rowToSlotDefinition,
  rowToTargetedSlot,
  rowToViewProfile,
  rowToGameSubmission,
  rowToMySubmission,
  rowToCommunityCatalog,
  rowToLedgerEntry,
  rowToUserStats,
  rowToUserSearchResult,
  rowToFriend,
  rowToFriendRequest,
  rowToActivityEvent,
  rowToMessage,
  rowToConversation,
  rowToReport,
  jsonToBadges,
  jsonToTitle,
  type GameRow,
  type CompilationRow,
  type CompilationTemplateRow,
  type CompilationSubmissionRow,
  type LedgerRow,
  type GameSubmissionRow,
  type MySubmissionRow,
  type CommunityCatalogRow,
  type IssueRow,
  type IssueAttachmentRow,
  type CommentRow,
  type IssueRelationRow,
  type NotificationRow,
  type LeaderboardRow,
  type AdminUserRow,
  type RoleRow,
  type UserStatsRow,
  type SlotDefinitionRow,
  type UserSlotRow,
  type ViewProfileRow,
  type UserSearchRow,
  type FriendRow,
  type FriendRequestRow,
  type ActivityEventRow,
  type MessageRow,
  type ConversationRow,
  type ReportRow,
} from "./lib/supabase";
import { sortLedger, computeTotals } from "./lib/transactions";
import {
  charterResale,
  DEFAULT_CHARTER_COST,
  DEFAULT_CHARTER_RESALE_PCT,
  cheapestBazaarPrice,
  activeIncomeGameCount,
  wouldSoftLock,
} from "./lib/charters";
import { DEFAULT_ONBOARDING_VOUCHERS } from "./lib/vouchers";
import {
  canonicalizeTerms,
  sortTerms,
  renameTerm,
  DEFAULT_PLATFORM_NAMES,
  DEFAULT_GENRE_NAMES,
  type TaxonomyRemoveResult,
} from "./lib/taxonomy";
import { toast, toastAction } from "./lib/toast";
import { catalogKey } from "./lib/ownershipMerge";
import { mergeWishlistIntoOwned, type VersionHours } from "./lib/addRouting";
import { totalCost as copiesTotalCost } from "./lib/copies";
import { processAvatar } from "./lib/avatar";
import { processBanner } from "./lib/banner";
import { resolveAccent, BIO_MAX } from "./lib/accent";
import { prepareUpload, validateFile, isImage } from "./lib/attachment";
import { toCanonicalRelation, type RelationPerspective } from "./lib/issueRelations";
import { coachTargetFor, type CoachTarget } from "./lib/onboarding";
import { Store, Heart, Gamepad2, Trophy, Coins, Eye, EyeOff, Lightbulb, Clock, Pencil, Undo2, Lock, Trash2, Link2, Unlink, ImagePlus, Layers, Palette, Scroll, Stamp, Package, Ticket, AlertTriangle, UserPlus, UserCheck, UserMinus, PartyPopper, Send, Archive, Flag, Sparkles, Check } from "lucide-react";

function addedToast(title: string, status: GameStatus): void {
  if (status === "wishlist") toast(`Wishlisted ${title}`, Heart);
  else if (status === "finished") toast(`Added ${title} to your collection`, Trophy);
  else toast(`Added ${title} to your Bazaar`, Store);
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** The slot_definitions columns to select wherever a SlotDefinition is read
 *  (kept in one place so the criteria fields can't drift between callers). */
const SLOT_DEF_COLUMNS =
  "id, name, kind, min_hours, max_hours, min_year, max_year, min_metacritic, max_metacritic, genres, platforms, default_grant_count, active";

/** Serialize a SlotDefinition to its DB row (snake_case). Criteria are forced
 *  empty for endless/replay kinds (they're criteria-agnostic), mirroring the
 *  server. `default_grant_count` applies to any kind (the default loadout). */
function slotDefToRow(def: Omit<SlotDefinition, "id">) {
  const standard = def.kind === "standard";
  return {
    name: def.name.trim(),
    kind: def.kind,
    min_hours: standard ? def.minHours : null,
    max_hours: standard ? def.maxHours : null,
    min_year: standard ? def.minYear : null,
    max_year: standard ? def.maxYear : null,
    min_metacritic: standard ? def.minMetacritic : null,
    max_metacritic: standard ? def.maxMetacritic : null,
    genres: standard ? def.genres : [],
    platforms: standard ? def.platforms : [],
    default_grant_count: Math.max(0, Math.floor(def.defaultGrantCount || 0)),
  };
}

/** Translate a start-slot choice into the RPC args (`p_slot`/`p_general`) and the
 *  offline target slot. `auto` defers to the computed plan (and is blocked when the
 *  plan found no room). Shared by buyGame and redeemVoucher. */
function resolveSlotChoice(
  choice: SlotChoice,
  plan: SlotPlan,
): { pSlot: string | null; pGeneral: boolean; offlineSlot: string | null; ok: boolean } {
  switch (choice.kind) {
    case "slot":
      return { pSlot: choice.id, pGeneral: false, offlineSlot: choice.id, ok: true };
    case "general":
      return { pSlot: null, pGeneral: true, offlineSlot: null, ok: true };
    default: // "auto"
      return { pSlot: null, pGeneral: false, offlineSlot: plan.ok ? plan.slotId : null, ok: plan.ok };
  }
}

/** Serialize a compilation child for the create/update RPCs (snake_case, with the
 *  resolved cost share in dollars). `game_id` distinguishes an existing child
 *  (update) from a newly added one (insert). `copies` is the child's cent-exact
 *  slice of every container copy (one entry per copy); the scalar `cost` (its
 *  share of the grand total) stays as the legacy fallback. */
function childToRpc(
  c: CompilationChildDraft,
  costDollars: number,
  copies?: { platform?: string; format?: CopyFormat; cost?: number }[],
) {
  return {
    game_id: c.gameId ?? null,
    name: c.name.trim(),
    hours: c.hours ?? null,
    cost: costDollars,
    copies: copies ?? null,
    image: c.image ?? null,
    rawg_id: c.rawgId ?? null,
    released: c.released ?? null,
    genres: c.genres ?? [],
    metacritic: c.metacritic ?? null,
    platforms: c.platforms ?? [],
    developers: c.developers ?? [],
    esrb: c.esrb ?? null,
    catalog_id: c.catalogId ?? null,
    status: c.status ?? null,
  };
}

/** The catalog metadata fields for a locally-built child Game (offline mode),
 *  taken from whatever the creator picked from search. */
function childGameMeta(c: CompilationChildDraft) {
  return {
    hours: c.hours,
    rawgId: c.rawgId,
    released: c.released,
    genres: c.genres ?? [],
    image: c.image,
    stockImage: c.image,
    originalImage: c.image,
    metacritic: c.metacritic ?? null,
    platforms: c.platforms ?? [],
    developers: c.developers ?? [],
    esrb: c.esrb,
    catalogId: c.catalogId,
  };
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

// How many activity-feed posts to load per page (keyset-paginated on created_at).
const FEED_PAGE = 30;

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

// Edition-level time tracking preference, persisted locally so guest mode keeps
// it across reloads (cloud accounts load it from the profile instead).
const TRACK_EDITIONS_KEY = "bb-track-editions";
function loadTrackEditions(): boolean {
  try {
    return localStorage.getItem(TRACK_EDITIONS_KEY) === "1";
  } catch {
    return false;
  }
}

/** The fields a user may edit on an existing game. Deliberately excludes status
 *  (that moves only through buy/finish/abandon) and coins/reward snapshots. */
export interface EditableGameFields {
  title: string;
  released?: string;
  hours?: number;
  // Total played hours. Optional: the cloud Edit Game modal manages playtime
  // per-version via setPlatformPlaytime and leaves this undefined so the two
  // paths don't both write played_hours. Offline still sets it here.
  playedHours?: number;
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
    voucherDelta: 0,
    coinBalanceAfter: coins,
    charterBalanceAfter: 0,
    voucherBalanceAfter: 0,
    gameTitle: null,
    label: "Opening balance",
    createdAt: Date.now(),
  };
}

/** Backfill voucher (and charter) fields onto a ledger row parsed from older
 *  localStorage, so totals/filters never see an undefined currency delta. New
 *  values from the stored row always win over the defaults. */
function normalizeLocalEvent(e: Partial<LedgerEntry>): LedgerEntry {
  return { charterDelta: 0, charterBalanceAfter: null, voucherDelta: 0, voucherBalanceAfter: null, ...e } as LedgerEntry;
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
  voucherDelta = 0,
  voucherAfter: number | null = null,
): LedgerEntry {
  return {
    id: newLocalId(),
    kind,
    coinDelta,
    charterDelta,
    voucherDelta,
    coinBalanceAfter: coinAfter,
    charterBalanceAfter: charterAfter,
    voucherBalanceAfter: voucherAfter,
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
      const ledger: LedgerEntry[] = Array.isArray(d.ledger) ? d.ledger.map(normalizeLocalEvent) : [];
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

const COMPILATIONS_KEY = "bb-compilations";

function loadLocalCompilations(): Compilation[] {
  try {
    const raw = localStorage.getItem(COMPILATIONS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Compilation[]) : [];
    // Rows saved before the expand/collapse feature lack the new fields — they
    // must default to expanded (today's rendering), never to collapsed.
    return parsed.map((c) => ({
      ...c,
      expanded: c.expanded ?? true,
      carryoverHours: c.carryoverHours ?? 0,
    }));
  } catch {
    return [];
  }
}

function saveLocalCompilations(compilations: Compilation[]): void {
  try {
    localStorage.setItem(COMPILATIONS_KEY, JSON.stringify(compilations));
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
  aboutMe: string | null;
  bannerUrl: string | null;
  accent: string | null;
  games: Game[];
}

interface BazaarState {
  cloud: boolean; // is Supabase configured
  initialized: boolean; // init() has run
  ready: boolean; // safe to render the app
  // True once the signed-in user's profile + library have actually loaded. Gates
  // anything that must not act on the transient cross-account state during an
  // auth switch (userId flips before the new account's data lands) — e.g. the
  // onboarding tour.
  sessionLoaded: boolean;
  busy: boolean; // an auth request is in flight
  error: string | null;
  notice: string | null;
  maintenance: boolean; // does the closed page apply right now (host + bypass applied)
  maintenanceFlag: boolean; // raw DB value (for the admin toggle)
  maintenanceMessage: string | null;
  shelveRefundPct: number; // "Shelve It" refund %, admin-configurable
  replayBonusPct: number; // Replay Bonus % (linked-edition re-clears), admin-configurable
  completionBonusPct: number; // Completion Bonus % (Completionist-lane completions), admin-configurable
  submissionReward: number; // coins paid when a catalog contribution is approved
  defaultCoin: CoinVariant; // app-wide coin skin, admin-configurable
  economy: EconomyConfig; // buy-price + finish-bounty formulas, admin-configurable
  rotationCheckinReward: number; // coins per weekly Rotation-lane check-in, admin-configurable
  rotationReset: RotationResetConfig; // the weekly Rotation reset schedule, admin-configurable
  rotationCheckedIn: string[]; // gameIds already checked in this weekly Rotation period
  defaultRotationSlots: number; // admin default Rotation-lane capacity for new accounts
  defaultReplaySlots: number; // admin default Replay-lane capacity for new accounts
  defaultCompletionistSlots: number; // admin default Completionist-lane capacity for new accounts

  userId: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null; // uploaded profile picture URL (null = use initials)
  bannerUrl: string | null; // Profile Hub banner image URL (null = none)
  aboutMe: string | null; // Profile Hub "About Me" bio (null = none)
  accent: string | null; // Profile Hub accent (curated id or #hex; null = theme default)
  isAdmin: boolean; // super-admin: implicitly holds every permission
  permissions: Permission[]; // effective permissions from assigned roles (my_permissions RPC)
  submissionCount: number; // pending catalog submissions awaiting review (admins)
  generalSlots: number; // this player's Focus-lane capacity (general Now Playing slots)
  rotationSlots: number; // this player's Rotation-lane capacity (live-service games)
  replaySlots: number; // this player's Replay-lane capacity (finished games pulled back)
  completionistSlots: number; // this player's Completionist-lane capacity (100% runs)
  defaultGeneralSlots: number; // admin default general-slot count for new accounts
  myTargetedSlots: TargetedSlot[]; // targeted slots granted to this player
  blocked: boolean; // this user is banned (locked out of the app)
  blockedReason: string | null;
  providers: string[]; // linked sign-in methods, e.g. ["email", "google"]
  myPlatforms: string[]; // owned console ids (see lib/platforms)
  customPlatforms: string[]; // legacy free-text console labels (grandfathered; no longer added)
  platformList: string[]; // controlled master list of platform names (every dropdown's source)
  genreList: string[]; // controlled master list of genre names
  hiddenMarket: number[]; // rawgIds dismissed from The Caravan
  theme: string; // this user's chosen theme id (synced to the profile)
  trackEditions: boolean; // log time per copy (platform+format) vs aggregated by platform
  privacy: Privacy; // this user's visitor-privacy flags
  myBadges: Badge[]; // prestige badges this user holds
  selectedTitleId: string | null; // which held badge is shown as their title (null = none)
  activityOverride: string | null; // admin: manual presence status overriding the auto one

  coins: number;
  charters: number; // Import Charters held in the global wallet
  vouchers: number; // Onboarding Free Game Vouchers held in the global wallet
  onboardingCompletedAt: number | null; // when the Jumpstart tour was finished/dismissed (null = not yet)
  onboardingVouchersPending: boolean; // tutorial phase unfinished (fresh signup / reset / Fresh Start)
  onboardingVouchersGrantedAt: number | null; // starter vouchers claimed (null = still on the welcome cards)
  accountCreatedAt: number | null; // signup time, to tell a fresh account from an established one
  charterCost: number; // coins to buy one charter (admin-configurable)
  charterResalePct: number; // % of cost returned on resale (admin-configurable)
  onboardingVouchers: number; // vouchers granted to each new account (admin-configurable)
  games: Game[];
  compilations: Compilation[]; // the user's compilation purchases (the financial containers)
  // Shared templates a moderator linked to a parent catalog game — the lookup
  // that lets an owned single card offer "Expand compilation". Cloud-only.
  parentTemplates: ParentTemplate[];
  ledger: LedgerEntry[]; // guest-mode coin/charter history (cloud users fetch from coin_events)
  // A one-shot import celebration payload; ImportCelebration shows it then clears.
  celebration: { id: number; title: string } | null;
  chartersOpen: boolean; // the Buy/Sell Import Charters modal is open
  notifications: AppNotification[];
  notificationsHasMore: boolean; // a full page came back, so older ones may remain
  notificationsLoadingMore: boolean; // a "load older" page is in flight (scroll guard)

  // Social: friends, pending requests, and the activity feed of friends' milestones.
  friends: Friend[];
  friendRequests: FriendRequest[]; // both incoming and outgoing pending
  friendRequestCount: number; // incoming pending — drives the social badge
  feed: ActivityEvent[];
  feedHasMore: boolean;
  feedLoadingMore: boolean;
  // Messaging (Phase 2): per-friend conversations, the open thread, + the unread badge.
  conversations: Conversation[];
  conversationsLoading: boolean;
  thread: Message[]; // the currently-open conversation's messages (oldest first)
  threadLoading: boolean;
  unreadMessageCount: number;

  // Visiting another player's Bazaar (read-only). null = on your own pages.
  viewing: ViewingSession | null;
  viewingLoading: boolean;

  // True after arriving via a password-recovery email link (Supabase signs the
  // user in and fires PASSWORD_RECOVERY); App shows the set-new-password modal.
  passwordRecovery: boolean;

  init: () => Promise<void>;
  applySession: (session: Session | null) => Promise<void>;
  // Does the current user hold a permission? A super-admin holds all of them.
  // The UX gate; the server re-checks every action authoritatively.
  can: (key: Permission) => boolean;

  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  // Email a password-reset link (works signed out; deliberately vague notice).
  resetPassword: (email: string) => Promise<void>;
  // Set a new password after a recovery link. Returns an error message to show
  // inline, or null on success (which also clears the recovery flag).
  updatePassword: (password: string) => Promise<string | null>;
  clearPasswordRecovery: () => void;
  linkGoogle: () => Promise<void>;
  unlinkGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  // Account Danger Zone (self-service, behind typed confirmations in the UI).
  // freshStart wipes the caller's collection/backlog + economy back to the
  // newborn state (identity, friends, DMs, badges and community posts survive);
  // works for guests too (clears this browser's local data). deleteMyAccount
  // permanently deletes the account + data (cloud only). Both return success.
  freshStart: () => Promise<boolean>;
  deleteMyAccount: () => Promise<boolean>;
  clearMessages: () => void;
  setDisplayName: (name: string) => Promise<boolean>;
  setMyPlatforms: (ids: string[]) => Promise<void>;
  setTheme: (id: string) => Promise<void>;
  setTrackEditions: (value: boolean) => Promise<void>;
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
  setBanner: (file: File) => Promise<void>;
  removeBanner: () => Promise<void>;
  setAboutMe: (text: string) => Promise<void>;
  setAccent: (value: string | null) => Promise<void>;
  addCustomPlatform: (label: string) => Promise<void>;
  removeCustomPlatform: (label: string) => Promise<void>;
  addPlatform: (name: string) => Promise<boolean>; // admin: extend the master platform list
  addGenre: (name: string) => Promise<boolean>; // admin: extend the master genre list
  // admin: remove a term. Returns "in_use" (not an error toast) when it's still
  // referenced, so the caller can offer to replace it first.
  removePlatform: (name: string) => Promise<TaxonomyRemoveResult>;
  removeGenre: (name: string) => Promise<TaxonomyRemoveResult>;
  // admin: reassign every usage of a term to another (existing or brand-new), then
  // remove the old term. Server-authoritative, audited; the caller's own library
  // rows are mirrored locally on success.
  replacePlatform: (oldName: string, newName: string) => Promise<boolean>;
  replaceGenre: (oldName: string, newName: string) => Promise<boolean>;
  setMaintenance: (on: boolean, message: string | null) => Promise<void>;
  setShelveRefundPct: (pct: number) => Promise<void>;
  setReplayBonusPct: (pct: number) => Promise<void>;
  setCompletionBonusPct: (pct: number) => Promise<void>;
  setDefaultCoin: (variant: CoinVariant) => Promise<void>;
  setEconomyFormulas: (price: FormulaConfig, bounty: FormulaConfig) => Promise<void>;
  setSubmissionReward: (coins: number) => Promise<void>;
  setCharterCost: (coins: number) => Promise<void>;
  setCharterResalePct: (pct: number) => Promise<void>;
  setOnboardingVouchers: (count: number) => Promise<void>;
  setCoins: (amount: number) => Promise<void>;

  fetchUsers: () => Promise<AdminUser[]>;
  fetchUserStats: (userId: string, from: Date | null, to: Date) => Promise<UserStats | null>;
  adminUpdateUser: (user: AdminUser) => Promise<boolean>;
  // Admin: clear a user's onboarding timestamp so the walkthrough runs for them
  // again. Returns true on success.
  adminResetOnboarding: (userId: string) => Promise<boolean>;
  notifyUser: (userId: string, title: string, body: string) => Promise<void>;
  adminDeleteUser: (userId: string) => Promise<boolean>;

  // Roles & permissions. fetchRoles lists the catalog (with member counts);
  // upsert/delete are super-admin-only; assign/revoke attach a role to a user
  // (subset-bounded for delegates server-side). All cloud-only (no-op offline).
  fetchRoles: () => Promise<Role[]>;
  upsertRole: (role: {
    id: string | null;
    key: string;
    name: string;
    description: string;
    permissions: Permission[];
  }) => Promise<boolean>;
  deleteRole: (id: string) => Promise<boolean>;
  assignRole: (userId: string, roleId: string) => Promise<boolean>;
  revokeRole: (userId: string, roleId: string) => Promise<boolean>;

  fetchSlotDefinitions: () => Promise<SlotDefinition[]>;
  createSlotDefinition: (def: Omit<SlotDefinition, "id">) => Promise<boolean>;
  updateSlotDefinition: (def: SlotDefinition) => Promise<boolean>;
  deleteSlotDefinition: (id: string) => Promise<boolean>;
  // The admin "default loadout" general-slot count for new accounts (app_config).
  setDefaultGeneralSlots: (n: number) => Promise<boolean>;
  // The admin "default loadout" Rotation-lane capacity for new accounts (app_config).
  setDefaultRotationSlots: (n: number) => Promise<boolean>;
  // The admin "default loadout" Replay/Completionist lane capacities (app_config).
  setDefaultReplaySlots: (n: number) => Promise<boolean>;
  setDefaultCompletionistSlots: (n: number) => Promise<boolean>;
  // The Rotation lane economy: weekly check-in reward + the weekly reset schedule.
  setRotationConfig: (reward: number, reset: RotationResetConfig) => Promise<boolean>;
  fetchUserSlots: (userId: string) => Promise<TargetedSlot[]>;
  grantUserSlot: (userId: string, definitionId: string) => Promise<boolean>;
  revokeUserSlot: (slotId: string) => Promise<boolean>;
  hideMarketGame: (rawgId: number) => Promise<void>;
  clearHiddenMarket: () => Promise<void>;

  // `opts.versionHours` records the Add form's per-version starting playtime;
  // when present it fully replaces the single meta.playedHours path (never both
  // — the played_hours trigger would double-count).
  addGame: (
    meta: GameMeta,
    status?: GameStatus,
    finishTag?: FinishTag | null,
    opts?: { versionHours?: VersionHours[] },
  ) => Promise<void>;
  // Attach additional copies (a new platform/format) to a game already in the
  // library instead of creating a duplicate card, optionally recording starting
  // playtime per version. See src/lib/addRouting.ts for the routing decisions.
  attachCopies: (id: string, copies: GameCopy[], versionHours?: VersionHours[]) => Promise<void>;
  // Create a compilation purchase plus one standalone child game per bundled
  // title. `container.copies` lists every copy of the bundle (platform/format/
  // cost each; totalCost = their sum); each child's share of the grand total is
  // applied to every copy cent-exactly. `released` fills (never overwrites)
  // children's release dates. `templateId` links the shared template.
  addCompilation: (
    container: CompilationContainerDraft,
    children: CompilationChildDraft[],
    status?: GameStatus,
    templateId?: string,
  ) => Promise<void>;
  // Edit a compilation: update the container and reconcile its games (update kept
  // children, insert newly added ones, delete those removed in the editor).
  editCompilation: (
    id: string,
    container: CompilationContainerDraft,
    children: CompilationChildDraft[],
  ) => Promise<void>;
  // Delete a whole compilation and all of its child games (the only way to remove
  // a compilation's games — they can't be deleted individually).
  deleteCompilation: (id: string) => Promise<void>;
  // Move one compilation child between Bazaar (backlog) and Finished after the fact
  // — the post-add counterpart to choosing each game's status when adding. A direct
  // status set (no coins/slots), matching how the add-time choice worked.
  setCompilationChildStatus: (id: string, status: Extract<GameStatus, "backlog" | "finished">) => Promise<void>;
  // Toggle a compilation between individual child cards (expanded) and one
  // collapsed rollup card. Presentation-only: never touches any child's status.
  setCompilationExpanded: (id: string, expanded: boolean) => Promise<void>;
  // Set / clear the cover on the collapsed rollup card (compilations.
  // parent_image). Uploading needs storage so it's cloud-only (like
  // setGameImage); clearing works offline too and falls back to the first
  // child's cover in the rollup.
  setCompilationParentImage: (id: string, file: File) => Promise<void>;
  clearCompilationParentImage: (id: string) => Promise<void>;
  // Convert an owned single parent card into a full compilation using the
  // moderator-linked shared template: children are created with an even cost
  // split, the parent's hours become bundle carryover, a started parent's
  // activation fee is refunded, and the parent card is removed.
  expandGameToCompilation: (gameId: string, template: ParentTemplate) => Promise<void>;
  // Re-fetch the moderator-linked parent templates (after an admin edits a link).
  refreshParentTemplates: () => Promise<void>;
  // Spend an Import Charter to move a Wishlist game into the Bazaar.
  importWithCharter: (id: string) => Promise<void>;
  buyCharter: () => Promise<void>;
  sellCharter: () => Promise<void>;
  clearCelebration: () => void;
  openCharters: () => void;
  closeCharters: () => void;
  bazaarToWishlist: (id: string) => Promise<void>;
  // Buy a Bazaar game into Now Playing. The optional SlotChoice directs placement
  // (auto / force a general slot / a specific slot); omitted = auto-place.
  buyGame: (id: string, choice?: SlotChoice) => Promise<void>;
  // Redeem one Onboarding Voucher to move a Bazaar game into Now Playing for free
  // (bypasses the coin activation fee). Strictly backlog → playing. choice as buyGame.
  redeemVoucher: (id: string, choice?: SlotChoice) => Promise<void>;
  // Pull a Finished game back into the Replay lane — free (it's already owned).
  // Re-finishing pays the smaller Replay Bonus. Capacity = replaySlots.
  replayGame: (id: string) => Promise<void>;
  // Back out of a replay: send a game in the Replay lane straight back to Finished
  // without claiming any bounty (the inverse of replayGame).
  abortReplay: (id: string) => Promise<void>;
  // Move a game into the Completionist lane (going for 100%) — free, from a playing
  // game or a finished one (pulled back). Capacity = completionistSlots.
  enterCompletionist: (id: string) => Promise<void>;
  // Leave the Completionist lane without finishing: the game stays playing and falls
  // back to its prior lane (Replay if resumed, else Focus).
  exitCompletionist: (id: string) => Promise<void>;
  // Abandon a 100% run: conclude a Completionist game to Finished (tag "Beaten"),
  // zero coins. The non-penalizing exit (distinct from exitCompletionist).
  abandonCompletion: (id: string) => Promise<void>;
  // Move an ongoing game into the Rotation lane for free (from parked or playing).
  enterRotation: (id: string) => Promise<void>;
  // Remove an ongoing game from the Rotation lane, back to parked (free).
  exitRotation: (id: string) => Promise<void>;
  // Retire an ongoing game from Rotation: conclude it to Finished (tag "Endless", or
  // its existing narrative tag for a hybrid), zero coins.
  retireRotation: (id: string) => Promise<void>;
  // Convert a Finished game into an ongoing Rotation game (post-game "Convert to
  // Endless"); preserves its finish tag, capacity-checked.
  convertToEndless: (id: string) => Promise<void>;
  // Manually set/override a finished game's status tag (Beaten/Completed/Endless).
  setFinishTag: (id: string, tag: FinishTag) => Promise<void>;
  // A just-finished Focus game awaiting the post-game routing prompt (App renders the
  // modal). Null = no prompt. Set by finishGame; cleared when the user routes/dismisses.
  pendingRouteId: string | null;
  setPendingRoute: (id: string | null) => void;
  // Weekly "still playing" check-in on a Rotation-lane game — credits the small
  // configured reward at most once per weekly reset period.
  rotationCheckin: (id: string) => Promise<void>;
  // Mark the Jumpstart onboarding walkthrough finished/dismissed (durable).
  completeOnboarding: () => Promise<void>;
  // Credit the starter vouchers up front when the player enters the Getting
  // Started checklist (the tutorial spends a real voucher). Idempotent; no-op
  // for guests, already-claimed accounts, and accounts outside the tutorial.
  claimOnboardingVouchers: () => Promise<void>;
  moveGameToSlot: (id: string, slotId: string | null) => Promise<void>;
  linkGames: (id: string, otherId: string) => Promise<void>;
  unlinkGame: (id: string) => Promise<void>;
  setFamilyName: (familyId: string, name: string) => Promise<void>;
  setFamilyCoverImage: (familyId: string, file: File) => Promise<void>;
  setFamilyCoverGame: (familyId: string, gameId: string | null) => Promise<void>;
  clearFamilyCover: (familyId: string) => Promise<void>;
  setFamilySplit: (familyId: string, split: boolean) => Promise<void>;
  setPrerequisite: (id: string, prereqId: string | null) => Promise<void>;
  logPlaytime: (id: string, hours: number, platform?: string, format?: CopyFormat) => Promise<void>;
  setPlayedHours: (id: string, hours: number) => Promise<void>;
  // A game's logged play sessions (cloud only), for the per-version breakdown and
  // remembering which version was played last. Empty offline.
  fetchPlaySessions: (id: string) => Promise<PlaySession[]>;
  fetchGameMilestones: (gameId: string) => Promise<GameMilestone[]>;
  addGameMilestone: (
    gameId: string,
    kind: MilestoneKind,
    occurredOn: string,
  ) => Promise<GameMilestone | null>;
  updateGameMilestone: (id: string, occurredOn: string) => Promise<boolean>;
  removeGameMilestone: (id: string) => Promise<boolean>;
  // Set the total logged hours for one version (platform + format) of a game — or
  // the Unspecified bucket when platform is null — logging an attributed
  // correction. Cloud only; used by the per-version playtime editor.
  setPlatformPlaytime: (
    id: string,
    platform: string | null,
    format: CopyFormat | null,
    hours: number,
  ) => Promise<void>;
  // Page through the Transaction Ledger newest-first; `done` = no older rows.
  fetchLedger: (offset: number) => Promise<{ entries: LedgerEntry[]; done: boolean }>;
  // Lifetime gain/loss totals for the current user's ledger.
  fetchLedgerTotals: () => Promise<LedgerTotals>;
  setGameCopies: (id: string, copies: GameCopy[]) => Promise<void>;
  setGamePrivate: (id: string, value: boolean) => Promise<void>;
  setProgressNote: (id: string, note: string) => Promise<void>;
  editGame: (id: string, patch: EditableGameFields) => Promise<void>;
  setGameImage: (id: string, file: File) => Promise<void>;
  clearGameImage: (id: string) => Promise<void>;
  restoreGameImage: (id: string) => Promise<void>;
  restoreOriginalImage: (id: string, url: string) => Promise<void>;
  fetchCatalogGame: (rawgId: number) => Promise<CatalogOverride | null>;
  searchCatalogGames: (query: string) => Promise<GameMeta[]>;
  fetchCatalogOverrides: (rawgIds: number[]) => Promise<Record<number, CatalogOverride>>;
  // A catalog game's approved screenshots, by RAWG id and/or catalog id (covers
  // both RAWG-backed and community-added games). Cloud-only; [] when none/offline.
  fetchGameScreenshots: (ref: { rawgId?: number | null; catalogId?: string | null }) => Promise<string[]>;
  uploadCatalogCover: (file: File) => Promise<string | null>;
  submitGameSubmission: (input: GameSubmissionInput) => Promise<boolean>;
  fetchMySubmissions: () => Promise<MySubmission[]>;
  // A submitter retracts their own still-pending contribution (game catalog or
  // compilation) from My contributions. Server-scoped to the caller's pending rows.
  withdrawGameSubmission: (id: string) => Promise<boolean>;
  withdrawCompilationSubmission: (id: string) => Promise<boolean>;
  fetchGameSubmissions: () => Promise<GameSubmission[]>;
  refreshSubmissionCount: () => Promise<void>;
  approveSubmission: (id: string, note: string, fields: string[] | null) => Promise<boolean>;
  rejectSubmission: (id: string, note: string) => Promise<boolean>;
  // Community compilation templates (moderated, mirrors the catalog submission flow).
  searchCompilationTemplates: (query: string) => Promise<CompilationTemplate[]>;
  submitCompilationTemplate: (input: {
    kind: "new" | "edit";
    templateId?: string | null;
    title: string;
    platform?: string;
    format?: CopyFormat;
    games: TemplateGame[];
    before?: TemplateContent | null;
  }) => Promise<{ ok: boolean; duplicate?: boolean }>;
  fetchMyCompilationSubmissions: () => Promise<CompilationTemplateSubmission[]>;
  fetchCompilationSubmissions: () => Promise<CompilationTemplateSubmission[]>;
  approveCompilationSubmission: (id: string, note: string) => Promise<boolean>;
  rejectCompilationSubmission: (id: string, note: string) => Promise<boolean>;
  // Admin: soft-delete a submission (removes it from the active queue, preserving
  // history). Deleting a compilation submission also removes its shared template.
  deleteSubmission: (id: string) => Promise<boolean>;
  revertSubmission: (id: string) => Promise<boolean>;
  deleteCompilationSubmission: (id: string) => Promise<boolean>;
  // Admin community-catalog manager: browse, directly edit, and delete community
  // catalog entries (rawg_id null). Edits cascade to every copy and log an audit row.
  fetchCommunityCatalog: () => Promise<CommunityCatalogEntry[]>;
  adminEditCatalogGame: (id: string, fields: CatalogFields) => Promise<boolean>;
  adminDeleteCatalogGame: (id: string) => Promise<boolean>;
  // Admin management of shared compilation templates (the catalog manager).
  fetchCompilationCatalog: () => Promise<CompilationTemplate[]>;
  // Ensure a RAWG game picked as a template parent has a catalog_games row
  // (fill-blanks-only upsert via admin_ensure_catalog_game) and return its id.
  // The parent picker searches the full game database (RAWG + community), but
  // parent_catalog_id is an FK into catalog_games — this bridges the gap for
  // RAWG games nobody has added yet. Cloud + catalog.manage only.
  ensureCatalogParent: (meta: {
    rawgId: number;
    title: string;
    image?: string;
    released?: string;
  }) => Promise<string | null>;
  // parentCatalogId is the moderator link enabling expand/collapse for owners of
  // that single game — always passed (null clears it) so an edit can't wipe an
  // existing link by accident.
  adminEditCompilationTemplate: (
    id: string,
    title: string,
    games: TemplateGame[],
    parentCatalogId: string | null,
  ) => Promise<boolean>;
  adminDeleteCompilationTemplate: (id: string) => Promise<boolean>;
  finishGame: (id: string) => Promise<void>;
  abandonGame: (id: string) => Promise<void>;
  // Reverse a recent concluding action (Finish/Complete, Retire, Convert to
  // Endless) from its undo descriptor: restore the prior lane/flags and roll back
  // any coins awarded. Server-authoritative on the cloud (undo_action RPC).
  undoAction: (undo: PendingUndo) => Promise<void>;
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
    effort?: IssueEffort,
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
    effort: IssueEffort,
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

  // Social actions (no-ops without cloud).
  fetchFriends: () => Promise<void>;
  fetchFriendRequests: () => Promise<void>;
  searchUsers: (query: string) => Promise<UserSearchResult[]>;
  sendFriendRequest: (userId: string) => Promise<FriendshipStatus | null>;
  respondFriendRequest: (id: string, accept: boolean) => Promise<boolean>;
  cancelFriendRequest: (id: string) => Promise<boolean>;
  removeFriend: (userId: string) => Promise<boolean>;
  fetchFeed: () => Promise<void>;
  loadMoreFeed: () => Promise<void>;
  cheerActivity: (eventId: string) => Promise<void>;
  uncheerActivity: (eventId: string) => Promise<void>;

  // Messaging actions (conversation/thread model).
  fetchConversations: () => Promise<void>;
  fetchThread: (otherId: string) => Promise<void>;
  // Resolves to null on success, or an error message to show inline in the thread
  // (e.g. the friends-only guard) — kept out of the global error banner. `replyTo`
  // quotes an earlier message; `images` are already-uploaded attachments.
  sendMessage: (
    recipient: string,
    body: string,
    gameId?: string | null,
    replyTo?: string | null,
    images?: MessageImage[],
  ) => Promise<string | null>;
  // Upload one image for a message to the attachments bucket; returns its path+url.
  uploadMessageImage: (file: File) => Promise<MessageImage | null>;
  editMessage: (id: string, body: string) => Promise<boolean>;
  deleteMessage: (id: string) => Promise<void>;
  // Toggle an emoji reaction on a message in the open thread (optimistic).
  toggleMessageReaction: (messageId: string, emoji: string, on: boolean) => Promise<boolean>;
  markThreadRead: (otherId: string) => Promise<void>;
  archiveConversation: (otherId: string, archived?: boolean) => Promise<void>;
  removeConversation: (otherId: string) => Promise<void>;
  fetchUnreadMessageCount: () => Promise<void>;

  // Reporting (user/content abuse). submitReport is for any signed-in viewer; the
  // rest are the moderation queue, gated on reports.moderate.
  reportCount: number; // open reports awaiting review (drives the admin badge)
  submitReport: (input: {
    reportedUser: string;
    kind: ReportKind;
    reason: ReportReason;
    details?: string;
    gameId?: string | null;
  }) => Promise<boolean>;
  fetchReports: (status?: "open" | "dismissed" | "actioned" | "all") => Promise<Report[]>;
  resolveReport: (
    report: Report,
    action: ReportAction,
    note?: string,
  ) => Promise<boolean>;
  refreshReportCount: () => Promise<void>;
}

export const useStore = create<BazaarState>((set, get) => ({
  cloud: isCloudConfigured,
  initialized: false,
  ready: false,
  sessionLoaded: false,
  busy: false,
  error: null,
  notice: null,
  maintenance: false,
  maintenanceFlag: false,
  maintenanceMessage: null,
  shelveRefundPct: SHELVE.defaultPct,
  replayBonusPct: REPLAY.defaultPct,
  completionBonusPct: COMPLETION.defaultPct,
  submissionReward: 15,
  defaultCoin: DEFAULT_COIN,
  economy: DEFAULT_ECONOMY,
  rotationCheckinReward: DEFAULT_ROTATION_CHECKIN_REWARD,
  rotationReset: DEFAULT_ROTATION_RESET,
  rotationCheckedIn: [],
  pendingRouteId: null,
  defaultRotationSlots: DEFAULT_ROTATION_SLOTS,
  defaultReplaySlots: 2,
  defaultCompletionistSlots: 2,

  userId: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  bannerUrl: null,
  aboutMe: null,
  accent: null,
  isAdmin: false,
  permissions: [],
  submissionCount: 0,
  reportCount: 0,
  generalSlots: DEFAULT_GENERAL_SLOTS,
  rotationSlots: DEFAULT_ROTATION_SLOTS,
  replaySlots: 2,
  completionistSlots: 2,
  defaultGeneralSlots: DEFAULT_GENERAL_SLOTS,
  myTargetedSlots: [],
  blocked: false,
  blockedReason: null,
  providers: [],
  myPlatforms: [],
  customPlatforms: [],
  platformList: DEFAULT_PLATFORM_NAMES,
  genreList: DEFAULT_GENRE_NAMES,
  hiddenMarket: [],
  theme: "midnight",
  trackEditions: loadTrackEditions(),
  privacy: {},
  myBadges: [],
  selectedTitleId: null,
  activityOverride: loadActivityOverride(),

  coins: STARTING_COINS,
  charters: 0,
  vouchers: 0,
  onboardingCompletedAt: null,
  onboardingVouchersPending: false,
  onboardingVouchersGrantedAt: null,
  accountCreatedAt: null,
  charterCost: DEFAULT_CHARTER_COST,
  charterResalePct: DEFAULT_CHARTER_RESALE_PCT,
  onboardingVouchers: DEFAULT_ONBOARDING_VOUCHERS,
  games: [],
  compilations: [],
  parentTemplates: [],
  ledger: [],
  celebration: null,
  chartersOpen: false,
  notifications: [],
  notificationsHasMore: false,
  notificationsLoadingMore: false,

  friends: [],
  friendRequests: [],
  friendRequestCount: 0,
  feed: [],
  feedHasMore: false,
  feedLoadingMore: false,
  conversations: [],
  conversationsLoading: false,
  thread: [],
  threadLoading: false,
  unreadMessageCount: 0,

  viewing: null,
  viewingLoading: false,

  passwordRecovery: false,

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
        compilations: loadLocalCompilations(),
        ledger,
        displayName: "You",
        myPlatforms: loadLocalPlatforms(),
        customPlatforms: loadLocalCustomPlatforms(),
        hiddenMarket: loadLocalHidden(),
        theme: getThemeId(),
        ready: true,
        sessionLoaded: true,
      });
      return;
    }

    // Maintenance flag (anon-readable). A missing table is treated as "open".
    const bypass = readBypass();
    const { data: cfg } = await supabase
      .from("app_config")
      .select(
        "maintenance, message, shelve_refund_pct, replay_bonus_pct, completion_bonus_pct, submission_reward, charter_cost, charter_resale_pct, onboarding_vouchers, default_general_slots, default_rotation_slots, default_replay_slots, default_completionist_slots, rotation_checkin_reward, rotation_reset_dow, rotation_reset_hour, rotation_reset_tz, default_coin, price_formula, bounty_formula",
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
      completionBonusPct:
        typeof cfg?.completion_bonus_pct === "number" ? cfg.completion_bonus_pct : COMPLETION.defaultPct,
      submissionReward:
        typeof cfg?.submission_reward === "number" ? cfg.submission_reward : 15,
      charterCost:
        typeof cfg?.charter_cost === "number" ? cfg.charter_cost : DEFAULT_CHARTER_COST,
      charterResalePct:
        typeof cfg?.charter_resale_pct === "number"
          ? cfg.charter_resale_pct
          : DEFAULT_CHARTER_RESALE_PCT,
      onboardingVouchers:
        typeof cfg?.onboarding_vouchers === "number"
          ? cfg.onboarding_vouchers
          : DEFAULT_ONBOARDING_VOUCHERS,
      defaultGeneralSlots:
        typeof cfg?.default_general_slots === "number"
          ? cfg.default_general_slots
          : DEFAULT_GENERAL_SLOTS,
      defaultRotationSlots:
        typeof cfg?.default_rotation_slots === "number"
          ? cfg.default_rotation_slots
          : DEFAULT_ROTATION_SLOTS,
      defaultReplaySlots:
        typeof cfg?.default_replay_slots === "number" ? cfg.default_replay_slots : 2,
      defaultCompletionistSlots:
        typeof cfg?.default_completionist_slots === "number"
          ? cfg.default_completionist_slots
          : 2,
      rotationCheckinReward:
        typeof cfg?.rotation_checkin_reward === "number"
          ? cfg.rotation_checkin_reward
          : DEFAULT_ROTATION_CHECKIN_REWARD,
      rotationReset: {
        resetDow:
          typeof cfg?.rotation_reset_dow === "number"
            ? cfg.rotation_reset_dow
            : DEFAULT_ROTATION_RESET.resetDow,
        resetHour:
          typeof cfg?.rotation_reset_hour === "number"
            ? cfg.rotation_reset_hour
            : DEFAULT_ROTATION_RESET.resetHour,
        resetTz:
          typeof cfg?.rotation_reset_tz === "string" && cfg.rotation_reset_tz
            ? cfg.rotation_reset_tz
            : DEFAULT_ROTATION_RESET.resetTz,
      },
      defaultCoin: coerceCoinVariant(cfg?.default_coin),
      economy: {
        price: normalizeFormula(cfg?.price_formula, DEFAULT_PRICE_FORMULA),
        bounty: normalizeFormula(cfg?.bounty_formula, DEFAULT_BOUNTY_FORMULA),
      },
    });

    const { data } = await supabase.auth.getSession();
    await get().applySession(data.session);
    supabase.auth.onAuthStateChange((event, session) => {
      // A password-recovery link signs the user in and fires this event; flag
      // it so App can prompt for the new password.
      if (event === "PASSWORD_RECOVERY") set({ passwordRecovery: true });
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
        bannerUrl: null,
        aboutMe: null,
        accent: null,
        isAdmin: false,
        permissions: [],
        generalSlots: DEFAULT_GENERAL_SLOTS,
        rotationSlots: DEFAULT_ROTATION_SLOTS,
        replaySlots: 2,
        completionistSlots: 2,
        myTargetedSlots: [],
        blocked: false,
        blockedReason: null,
        providers: [],
        myPlatforms: [],
        customPlatforms: [],
        hiddenMarket: [],
        trackEditions: loadTrackEditions(),
        privacy: {},
        myBadges: [],
        selectedTitleId: null,
        coins: STARTING_COINS,
        vouchers: 0,
        onboardingCompletedAt: null,
        onboardingVouchersPending: false,
        onboardingVouchersGrantedAt: null,
        accountCreatedAt: null,
        games: [],
        notifications: [],
        notificationsHasMore: false,
        notificationsLoadingMore: false,
        viewing: null,
        viewingLoading: false,
        sessionLoaded: false,
      });
      return;
    }
    const uidv = session.user.id;
    set({
      userId: uidv,
      email: session.user.email ?? null,
      providers: (session.user.identities ?? []).map((i) => i.provider),
      // Not yet loaded for THIS user — block the onboarding tour from acting on
      // the previous account's lingering state during the switch.
      sessionLoaded: false,
    });

    const [
      { data: prof },
      { data: rows },
      { data: compRows },
      { data: notes },
      { data: slotRows },
      { data: badgeRows },
      { data: permData },
      { data: platformRows },
      { data: genreRows },
    ] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "display_name, avatar_url, banner_url, about_me, accent, coins, charters, vouchers, onboarding_completed_at, onboarding_vouchers_pending, onboarding_vouchers_granted_at, created_at, platforms, hidden_market, is_admin, general_slots, rotation_slots, replay_slots, completionist_slots, blocked, blocked_reason, custom_platforms, theme, track_editions, privacy, selected_badge_id",
          )
          .eq("id", uidv)
          .single(),
        supabase
          .from("games")
          .select("*")
          .eq("user_id", uidv)
          .order("added_at", { ascending: false }),
        supabase
          .from("compilations")
          .select("*")
          .eq("user_id", uidv)
          .order("created_at", { ascending: false }),
        supabase
          .from("notifications")
          .select("*")
          .eq("user_id", uidv)
          .order("created_at", { ascending: false })
          .limit(NOTIF_PAGE),
        supabase
          .from("user_slots")
          .select(`id, definition:slot_definitions(${SLOT_DEF_COLUMNS})`)
          .eq("user_id", uidv),
        supabase
          .from("user_badges")
          .select("badge:badges(id, slug, name, description, icon, prestige)")
          .eq("user_id", uidv)
          .is("revoked_at", null),
        // Effective permissions for the granular role gates (super-admin → all).
        supabase.rpc("my_permissions"),
        // The controlled taxonomy master lists (read-all) that drive every
        // platform/genre dropdown.
        supabase.from("platforms").select("name").order("name"),
        supabase.from("genres").select("name").order("name"),
      ]);

    set({
      displayName: prof?.display_name ?? session.user.email ?? "Player",
      avatarUrl: (prof?.avatar_url as string | null) ?? null,
      bannerUrl: (prof?.banner_url as string | null) ?? null,
      aboutMe: (prof?.about_me as string | null) ?? null,
      accent: (prof?.accent as string | null) ?? null,
      coins: prof?.coins ?? STARTING_COINS,
      charters: typeof prof?.charters === "number" ? prof.charters : 0,
      vouchers: typeof prof?.vouchers === "number" ? prof.vouchers : 0,
      onboardingCompletedAt: prof?.onboarding_completed_at
        ? Date.parse(prof.onboarding_completed_at as string)
        : null,
      onboardingVouchersPending: Boolean(prof?.onboarding_vouchers_pending),
      onboardingVouchersGrantedAt: prof?.onboarding_vouchers_granted_at
        ? Date.parse(prof.onboarding_vouchers_granted_at as string)
        : null,
      accountCreatedAt: prof?.created_at ? Date.parse(prof.created_at as string) : null,
      isAdmin: Boolean(prof?.is_admin),
      permissions: (Array.isArray(permData) ? (permData as string[]) : []).filter(
        (p): p is Permission => PERMISSION_KEYS.includes(p as Permission),
      ),
      generalSlots:
        typeof prof?.general_slots === "number" ? prof.general_slots : DEFAULT_GENERAL_SLOTS,
      rotationSlots:
        typeof prof?.rotation_slots === "number" ? prof.rotation_slots : DEFAULT_ROTATION_SLOTS,
      replaySlots: typeof prof?.replay_slots === "number" ? prof.replay_slots : 2,
      completionistSlots:
        typeof prof?.completionist_slots === "number" ? prof.completionist_slots : 2,
      blocked: Boolean(prof?.blocked),
      blockedReason: (prof?.blocked_reason as string | null) ?? null,
      myPlatforms: Array.isArray(prof?.platforms) ? (prof.platforms as string[]) : [],
      customPlatforms: Array.isArray(prof?.custom_platforms)
        ? (prof.custom_platforms as string[])
        : [],
      platformList: Array.isArray(platformRows) && platformRows.length
        ? (platformRows as { name: string }[]).map((r) => r.name)
        : DEFAULT_PLATFORM_NAMES,
      genreList: Array.isArray(genreRows) && genreRows.length
        ? (genreRows as { name: string }[]).map((r) => r.name)
        : DEFAULT_GENRE_NAMES,
      hiddenMarket: Array.isArray(prof?.hidden_market) ? (prof.hidden_market as number[]) : [],
      theme: (prof?.theme as string | null) || getThemeId(),
      trackEditions: prof?.track_editions === true,
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
      myTargetedSlots: ((slotRows ?? []) as unknown as UserSlotRow[])
        .map(rowToTargetedSlot)
        .filter((s): s is TargetedSlot => s !== null),
      games: ((rows ?? []) as GameRow[]).map(rowToGame),
      compilations: ((compRows ?? []) as CompilationRow[]).map(rowToCompilation),
      notifications: ((notes ?? []) as NotificationRow[]).map(rowToNotification),
      notificationsHasMore: (notes ?? []).length === NOTIF_PAGE,
      // The new account's profile + library are now in state — safe for the
      // onboarding tour to evaluate against consistent data.
      sessionLoaded: true,
    });

    // Which Rotation-lane games are already checked in this weekly period, so the
    // check-in button can be gated without a round-trip (the server still enforces
    // the once-per-period cap authoritatively).
    const period = rotationPeriodStart(new Date(), get().rotationReset);
    const { data: checkins } = await supabase
      .from("rotation_checkins")
      .select("game_id")
      .eq("user_id", uidv)
      .gte("created_at", period.toISOString());
    set({
      rotationCheckedIn: ((checkins ?? []) as { game_id: string | null }[])
        .map((r) => r.game_id)
        .filter((g): g is string => Boolean(g)),
    });

    // Templates a moderator linked to a parent catalog game (read-all RLS, tiny
    // set) — the lookup behind "Expand compilation" on owned single cards.
    await get().refreshParentTemplates();

    // Apply the saved theme so it follows the user across devices (unless they're
    // currently visiting someone else's themed Bazaar).
    if (!get().viewing) applyThemeId(get().theme);
  },

  can: (key) => {
    const s = get();
    return s.isAdmin || s.permissions.includes(key);
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

  resetPassword: async (email) => {
    if (!supabase) return;
    set({ busy: true, error: null, notice: null });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    set({ busy: false });
    if (error) set({ error: error.message });
    else
      set({
        // Deliberately vague — don't confirm whether an account exists.
        notice: "If an account exists for that email, a reset link is on its way.",
      });
  },

  updatePassword: async (password) => {
    if (!supabase) return "Cloud sync is not configured.";
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return error.message;
    set({ passwordRecovery: false });
    toast("Password updated.");
    return null;
  },

  clearPasswordRecovery: () => set({ passwordRecovery: false }),

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

  // Fresh Start: wipe your collection/backlog + economy and return to the
  // newborn state. Identity, friends, DMs, notifications, badges/titles and
  // community posts all survive — this resets the core loop, not the account.
  freshStart: async () => {
    const { cloud, userId } = get();

    if (!cloud || !supabase || !userId) {
      // Guest mode: the "account" is this browser's local data. Clear the
      // collection/economy keys and reset the in-memory state to match.
      try {
        localStorage.removeItem(LOCAL_KEY);
        localStorage.removeItem(COMPILATIONS_KEY);
        localStorage.removeItem(PLATFORMS_KEY);
        localStorage.removeItem(CUSTOM_PLATFORMS_KEY);
        localStorage.removeItem(HIDDEN_KEY);
        localStorage.removeItem(TRACK_EDITIONS_KEY);
      } catch {
        /* ignore */
      }
      set({
        coins: STARTING_COINS,
        charters: 0,
        vouchers: 0,
        games: [],
        compilations: [],
        ledger: [openingEvent(STARTING_COINS)],
        myPlatforms: [],
        customPlatforms: [],
        hiddenMarket: [],
        trackEditions: false,
      });
      toast("Fresh start complete — welcome back to day one", Sparkles);
      return true;
    }

    // Best-effort: clear the cover-art folder (game + compilation art). The
    // rows are about to go server-side; an orphaned file is invisible either
    // way, so a storage hiccup never blocks the reset.
    try {
      const { data: files } = await supabase.storage.from("covers").list(userId, { limit: 1000 });
      if (files && files.length > 0) {
        await supabase.storage.from("covers").remove(files.map((f) => `${userId}/${f.name}`));
      }
    } catch {
      /* best-effort */
    }

    // The RPC wipes + re-seeds atomically, every statement scoped to auth.uid().
    const { error } = await supabase.rpc("fresh_start");
    if (error) {
      set({ error: error.message });
      return false;
    }

    // Drop the lazily-loaded slices that now hold wiped rows, then re-hydrate
    // everything else straight from the DB — the source of truth for the reset.
    set({ ledger: [], feed: [], rotationCheckedIn: [] });
    const { data } = await supabase.auth.getSession();
    await get().applySession(data.session);
    toast("Fresh start complete — welcome back to day one", Sparkles);
    return true;
  },

  // Permanent self-service account deletion. Storage first (no DB cascade
  // reaches the buckets), then the RPC (audit tombstone → comment blanking →
  // auth.users delete, which cascades everything else), then a local sign-out.
  deleteMyAccount: async () => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) return false;

    // Best-effort storage cleanup. avatars/ + covers/ are wholly the user's.
    // In attachments/ only the dm/ subfolder goes: issue attachments under
    // `${uid}/${requestId}/` must SURVIVE — their rows are tombstoned, not
    // deleted, so the files keep serving the shared board.
    try {
      for (const bucket of ["avatars", "covers"] as const) {
        const { data: files } = await supabase.storage.from(bucket).list(userId, { limit: 1000 });
        if (files && files.length > 0) {
          await supabase.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
        }
      }
      const { data: dmFiles } = await supabase.storage
        .from("attachments")
        .list(`${userId}/dm`, { limit: 1000 });
      if (dmFiles && dmFiles.length > 0) {
        await supabase.storage
          .from("attachments")
          .remove(dmFiles.map((f) => `${userId}/dm/${f.name}`));
      }
    } catch {
      /* best-effort */
    }

    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      set({ error: error.message });
      return false;
    }

    // The auth user is gone; drop the local session (the server may already
    // consider it invalid — that's fine) and clear the lazily-loaded social
    // slices so nothing of the deleted account lingers in memory.
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    set({
      ledger: [],
      feed: [],
      friends: [],
      friendRequests: [],
      friendRequestCount: 0,
      conversations: [],
      thread: [],
      unreadMessageCount: 0,
      rotationCheckedIn: [],
    });
    return true;
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

  // Toggle edition-level time tracking (off = aggregate by platform, the default).
  // A personal display/attribution preference — never touches coins or totals.
  // Persists to the profile (cloud) and always to localStorage (so guest mode and
  // the no-account-yet state keep it across reloads).
  setTrackEditions: async (value) => {
    set({ trackEditions: value });
    try {
      if (value) localStorage.setItem(TRACK_EDITIONS_KEY, "1");
      else localStorage.removeItem(TRACK_EDITIONS_KEY);
    } catch {
      // localStorage may be unavailable; the in-memory value still applies.
    }
    toast(value ? "Tracking time per copy" : "Tracking time per platform", Clock);
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) return;
    const { error } = await supabase
      .from("profiles")
      .update({ track_editions: value })
      .eq("id", userId);
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
    applyThemeId(header.theme || "midnight");
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

  // Profile Hub banner: same flow as setAvatar (crop/downscale, upload to the user's
  // folder in the shared 'avatars' bucket, point the profile at the new public URL).
  setBanner: async (file) => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) return;
    try {
      const blob = await processBanner(file);
      const path = `${userId}/banner.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ banner_url: url })
        .eq("id", userId);
      if (dbErr) throw dbErr;
      set({ bannerUrl: url });
      toast("Banner updated", ImagePlus);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Couldn't update your banner." });
    }
  },

  removeBanner: async () => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) return;
    await supabase.storage.from("avatars").remove([`${userId}/banner.jpg`]);
    const { error } = await supabase.from("profiles").update({ banner_url: null }).eq("id", userId);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ bannerUrl: null });
    toast("Banner removed", Trash2);
  },

  // Profile Hub "About Me" bio. Clamped to BIO_MAX (the DB enforces the same cap).
  setAboutMe: async (text) => {
    const { cloud, userId, aboutMe } = get();
    const trimmed = text.slice(0, BIO_MAX);
    const value = trimmed.trim() === "" ? null : trimmed;
    if (value === aboutMe) return;
    set({ aboutMe: value });
    if (!cloud || !supabase || !userId) return;
    const { error } = await supabase.from("profiles").update({ about_me: value }).eq("id", userId);
    if (error) {
      set({ error: error.message, aboutMe });
      return;
    }
    toast("About Me updated", Pencil);
  },

  // Profile Hub accent (a curated swatch id or a #hex). Validated to a real color,
  // else cleared back to the theme default.
  setAccent: async (value) => {
    const { cloud, userId, accent } = get();
    const next = value && resolveAccent(value) ? value.trim() : null;
    if (next === accent) return;
    set({ accent: next });
    if (!cloud || !supabase || !userId) return;
    const { error } = await supabase.from("profiles").update({ accent: next }).eq("id", userId);
    if (error) {
      set({ error: error.message, accent });
      return;
    }
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

  // Admin: add a platform/genre to the controlled master lists (taxonomy.manage).
  // Server-authoritative + case-insensitive idempotent; on success the new term is
  // folded into the in-memory list (sorted) so every dropdown sees it immediately.
  addPlatform: async (name) => {
    const trimmed = name.trim();
    if (!trimmed || !get().can("taxonomy.manage")) return false;
    if (get().platformList.some((p) => p.toLowerCase() === trimmed.toLowerCase())) return true;
    if (!supabase) return false;
    const { error } = await supabase.rpc("admin_add_platform", { p_name: trimmed });
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ platformList: sortTerms([...get().platformList, trimmed]) });
    toast(`Added platform ${trimmed}`, Stamp);
    return true;
  },

  addGenre: async (name) => {
    const trimmed = name.trim();
    if (!trimmed || !get().can("taxonomy.manage")) return false;
    if (get().genreList.some((g) => g.toLowerCase() === trimmed.toLowerCase())) return true;
    if (!supabase) return false;
    const { error } = await supabase.rpc("admin_add_genre", { p_name: trimmed });
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ genreList: sortTerms([...get().genreList, trimmed]) });
    toast(`Added genre ${trimmed}`, Stamp);
    return true;
  },

  // Admin: remove a platform/genre from the master lists. The server refuses while
  // the term is still in use anywhere (so removal can't orphan data). That surfaces
  // as "in_use" (no toast) so the Taxonomy manager can offer to replace it; a real
  // failure toasts and returns "error".
  removePlatform: async (name) => {
    if (!get().can("taxonomy.manage") || !supabase) return "error";
    const { error } = await supabase.rpc("admin_remove_platform", { p_name: name });
    if (error) {
      if (error.message.includes("PLATFORM_IN_USE")) return "in_use";
      toast("Couldn't remove that platform.", AlertTriangle);
      return "error";
    }
    set({ platformList: get().platformList.filter((p) => p.toLowerCase() !== name.toLowerCase()) });
    toast(`Removed platform ${name}`, Trash2);
    return "removed";
  },

  removeGenre: async (name) => {
    if (!get().can("taxonomy.manage") || !supabase) return "error";
    const { error } = await supabase.rpc("admin_remove_genre", { p_name: name });
    if (error) {
      if (error.message.includes("GENRE_IN_USE")) return "in_use";
      toast("Couldn't remove that genre.", AlertTriangle);
      return "error";
    }
    set({ genreList: get().genreList.filter((g) => g.toLowerCase() !== name.toLowerCase()) });
    toast(`Removed genre ${name}`, Trash2);
    return "removed";
  },

  // Admin: replace every usage of a term with another (existing or brand-new) and
  // remove the old one. Server-authoritative (value-preserving rename across the
  // catalog, all library games/copies, submissions and templates; audited). On
  // success the master list + the caller's own in-memory games are rewritten to
  // match, so their dropdowns/cards reflect it without a reload.
  replacePlatform: async (oldName, newName) => {
    const o = oldName.trim();
    const n = newName.trim();
    if (!o || !n || o.toLowerCase() === n.toLowerCase()) return false;
    if (!get().can("taxonomy.manage") || !supabase) return false;
    const { error } = await supabase.rpc("admin_replace_platform", { p_old: o, p_new: n });
    if (error) {
      set({ error: error.message });
      toast("Couldn't replace that platform.", AlertTriangle);
      return false;
    }
    const lo = o.toLowerCase();
    const list = get().platformList.filter((p) => p.toLowerCase() !== lo);
    if (!list.some((p) => p.toLowerCase() === n.toLowerCase())) list.push(n);
    set({
      platformList: sortTerms(list),
      games: get().games.map((g) => ({
        ...g,
        platforms: renameTerm(g.platforms, lo, n) ?? g.platforms,
        copies: g.copies?.map((c) =>
          c.platform.toLowerCase() === lo ? { ...c, platform: n } : c,
        ),
      })),
    });
    toast(`Replaced platform ${o} with ${n}`, Stamp);
    return true;
  },

  replaceGenre: async (oldName, newName) => {
    const o = oldName.trim();
    const n = newName.trim();
    if (!o || !n || o.toLowerCase() === n.toLowerCase()) return false;
    if (!get().can("taxonomy.manage") || !supabase) return false;
    const { error } = await supabase.rpc("admin_replace_genre", { p_old: o, p_new: n });
    if (error) {
      set({ error: error.message });
      toast("Couldn't replace that genre.", AlertTriangle);
      return false;
    }
    const lo = o.toLowerCase();
    const list = get().genreList.filter((p) => p.toLowerCase() !== lo);
    if (!list.some((p) => p.toLowerCase() === n.toLowerCase())) list.push(n);
    set({
      genreList: sortTerms(list),
      games: get().games.map((g) => ({ ...g, genres: renameTerm(g.genres, lo, n) ?? g.genres })),
    });
    toast(`Replaced genre ${o} with ${n}`, Stamp);
    return true;
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
    if (!supabase || !get().can("site.maintenance")) return;
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
    const { cloud, can } = get();
    if (!cloud) {
      // Local guest mode has no admins/DB; just keep it in memory for the session.
      set({ shelveRefundPct: next });
      toast(`Shelve refund set to ${next}%`, Undo2);
      return;
    }
    if (!supabase || !can("economy.edit")) return;
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
    const { cloud, can } = get();
    if (!cloud) {
      set({ replayBonusPct: next });
      toast(`Replay bonus set to ${next}%`, Trophy);
      return;
    }
    if (!supabase || !can("economy.edit")) return;
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

  setCompletionBonusPct: async (pct) => {
    const next = Math.max(0, Math.min(100, Math.round(pct)));
    const { cloud, can } = get();
    if (!cloud) {
      set({ completionBonusPct: next });
      toast(`Completion bonus set to ${next}%`, Trophy);
      return;
    }
    if (!supabase || !can("economy.edit")) return;
    const { error } = await supabase
      .from("app_config")
      .update({ completion_bonus_pct: next })
      .eq("id", 1);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ completionBonusPct: next });
    toast(`Completion bonus set to ${next}%`, Trophy);
  },

  // Admin-set the app-wide coin skin (shown for everyone). Persists to
  // app_config in cloud mode; in-memory for the local/guest session.
  setDefaultCoin: async (variant) => {
    const { cloud, can } = get();
    if (!cloud) {
      set({ defaultCoin: variant });
      toast("Coin skin updated", Coins);
      return;
    }
    if (!supabase || !can("site.maintenance")) return;
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
    const { cloud, can } = get();
    if (!cloud) {
      set({ economy });
      toast("Economy formulas updated", Coins);
      return;
    }
    if (!supabase || !can("economy.edit")) return;
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
    const { cloud, can } = get();
    if (!cloud) {
      set({ submissionReward: next });
      toast(`Contribution reward set to ${next}`, Coins);
      return;
    }
    if (!supabase || !can("economy.edit")) return;
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
    const { cloud, can } = get();
    if (!cloud) {
      set({ charterCost: next });
      toast(`Charter cost set to ${next}`, Scroll);
      return;
    }
    if (!supabase || !can("economy.edit")) return;
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
    const { cloud, can } = get();
    if (!cloud) {
      set({ charterResalePct: next });
      toast(`Charter resale set to ${next}%`, Scroll);
      return;
    }
    if (!supabase || !can("economy.edit")) return;
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

  // Admin-set how many Onboarding Vouchers each NEW account is granted at signup.
  // Affects future signups only (the grant fires in handle_new_user); existing
  // users are unchanged.
  setOnboardingVouchers: async (count) => {
    const next = Math.max(0, Math.min(100, Math.floor(count)));
    const { cloud, can } = get();
    if (!cloud) {
      set({ onboardingVouchers: next });
      toast(`Onboarding vouchers set to ${next}`, Ticket);
      return;
    }
    if (!supabase || !can("economy.edit")) return;
    const { error } = await supabase
      .from("app_config")
      .update({ onboarding_vouchers: next })
      .eq("id", 1);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ onboardingVouchers: next });
    toast(`Onboarding vouchers set to ${next}`, Ticket);
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
    if (!supabase || !get().can("users.view")) return [];
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
    if (!supabase || !get().can("stats.view")) return null;
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
    // Server enforces per-field authority; this is the coarse UI gate.
    if (!supabase || !(get().can("users.economy") || get().can("users.block"))) return false;
    const { error } = await supabase.rpc("admin_update_user", {
      p_user: user.id,
      p_display_name: user.displayName,
      p_coins: user.coins,
      p_general_slots: user.generalSlots,
      p_rotation_slots: user.rotationSlots,
      p_replay_slots: user.replaySlots,
      p_completionist_slots: user.completionistSlots,
      p_is_admin: user.isAdmin,
      p_blocked: user.blocked,
      p_blocked_reason: user.blockedReason,
      p_hidden: user.hidden,
      p_vouchers: user.vouchers,
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
        vouchers: user.vouchers,
        generalSlots: user.generalSlots,
        rotationSlots: user.rotationSlots,
        replaySlots: user.replaySlots,
        completionistSlots: user.completionistSlots,
        isAdmin: user.isAdmin,
      });
    }
    toast(`Saved ${user.displayName}`, Pencil);
    return true;
  },

  adminResetOnboarding: async (userId) => {
    if (!supabase || !get().can("users.onboarding")) return false;
    const { error } = await supabase.rpc("admin_reset_onboarding", { p_user: userId });
    if (error) {
      set({ error: error.message });
      return false;
    }
    // If you reset your own account, let the full tour resurface immediately.
    if (userId === get().userId) {
      set({
        onboardingCompletedAt: null,
        onboardingVouchersPending: true,
        onboardingVouchersGrantedAt: null,
      });
    }
    toast("Tutorial reset — they'll get the full tour again", Ticket);
    return true;
  },

  // Send an affected user a notification about an admin action (best-effort —
  // a failure here never blocks the underlying change). The RPC enforces admin
  // rights and skips self-notifications.
  notifyUser: async (userId, title, body) => {
    if (!supabase || !get().can("users.notify") || userId === get().userId) return;
    await supabase.rpc("admin_notify", { p_user: userId, p_title: title, p_body: body });
  },

  adminDeleteUser: async (userId) => {
    if (!supabase || !get().can("users.delete")) return false;
    const { error } = await supabase.rpc("admin_delete_user", { p_user: userId });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("User deleted", Trash2);
    return true;
  },

  // The role catalog (with member counts). Visible to anyone who can assign roles
  // (super-admins included); returns nothing otherwise.
  fetchRoles: async () => {
    if (!supabase || !(get().isAdmin || get().can("roles.assign"))) return [];
    const { data, error } = await supabase.rpc("list_roles");
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as RoleRow[]).map(rowToRole);
  },

  // Create (id null) or update a role. Super-admin only; the RPC validates the
  // permission keys and records the change.
  upsertRole: async (role) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase.rpc("upsert_role", {
      p_id: role.id,
      p_key: role.key,
      p_name: role.name,
      p_description: role.description,
      p_permissions: role.permissions,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast(role.id ? `Saved "${role.name}"` : `Created "${role.name}"`, role.id ? Pencil : Stamp);
    return true;
  },

  deleteRole: async (id) => {
    if (!supabase || !get().isAdmin) return false;
    const { error } = await supabase.rpc("delete_role", { p_id: id });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Role deleted", Trash2);
    return true;
  },

  // Attach/detach a role to a user. The RPC re-checks roles.assign and enforces
  // the subset rule for non-super-admin delegates.
  assignRole: async (userId, roleId) => {
    if (!supabase || !(get().isAdmin || get().can("roles.assign"))) return false;
    const { error } = await supabase.rpc("assign_role", { p_user: userId, p_role: roleId });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  revokeRole: async (userId, roleId) => {
    if (!supabase || !(get().isAdmin || get().can("roles.assign"))) return false;
    const { error } = await supabase.rpc("revoke_role", { p_user: userId, p_role: roleId });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  fetchSlotDefinitions: async () => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("slot_definitions")
      .select(SLOT_DEF_COLUMNS + ", created_at")
      .order("created_at", { ascending: true });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as unknown as SlotDefinitionRow[]).map(rowToSlotDefinition);
  },

  createSlotDefinition: async (def) => {
    if (!supabase || !get().can("slots.manage")) return false;
    const { error } = await supabase.from("slot_definitions").insert(slotDefToRow(def));
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast(`Created "${def.name.trim()}" slot type`, Gamepad2);
    return true;
  },

  updateSlotDefinition: async (def) => {
    if (!supabase || !get().can("slots.manage")) return false;
    const { error } = await supabase
      .from("slot_definitions")
      .update({ ...slotDefToRow(def), active: def.active })
      .eq("id", def.id);
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast(`Saved "${def.name.trim()}"`, Pencil);
    return true;
  },

  setDefaultGeneralSlots: async (n) => {
    if (!supabase || !get().can("economy.edit")) return false;
    const next = Math.max(0, Math.min(99, Math.floor(n)));
    const { error } = await supabase.from("app_config").update({ default_general_slots: next }).eq("id", 1);
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ defaultGeneralSlots: next });
    toast(`New accounts now start with ${next} general slot${next === 1 ? "" : "s"}`, Gamepad2);
    return true;
  },

  setDefaultRotationSlots: async (n) => {
    if (!supabase || !get().can("economy.edit")) return false;
    const next = Math.max(0, Math.min(99, Math.floor(n)));
    const { error } = await supabase.from("app_config").update({ default_rotation_slots: next }).eq("id", 1);
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ defaultRotationSlots: next });
    toast(`New accounts now start with ${next} Rotation slot${next === 1 ? "" : "s"}`, Gamepad2);
    return true;
  },

  setDefaultReplaySlots: async (n) => {
    if (!supabase || !get().can("economy.edit")) return false;
    const next = Math.max(0, Math.min(99, Math.floor(n)));
    const { error } = await supabase.from("app_config").update({ default_replay_slots: next }).eq("id", 1);
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ defaultReplaySlots: next });
    toast(`New accounts now start with ${next} Replay slot${next === 1 ? "" : "s"}`, Gamepad2);
    return true;
  },

  setDefaultCompletionistSlots: async (n) => {
    if (!supabase || !get().can("economy.edit")) return false;
    const next = Math.max(0, Math.min(99, Math.floor(n)));
    const { error } = await supabase
      .from("app_config")
      .update({ default_completionist_slots: next })
      .eq("id", 1);
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ defaultCompletionistSlots: next });
    toast(`New accounts now start with ${next} Completionist slot${next === 1 ? "" : "s"}`, Gamepad2);
    return true;
  },

  setRotationConfig: async (reward, reset) => {
    if (!supabase || !get().can("economy.edit")) return false;
    const nextReward = Math.max(0, Math.min(100000, Math.floor(reward)));
    const nextReset: RotationResetConfig = {
      resetDow: (((Math.trunc(reset.resetDow) % 7) + 7) % 7),
      resetHour: Math.max(0, Math.min(23, Math.trunc(reset.resetHour))),
      resetTz: reset.resetTz.trim() || "UTC",
    };
    const { error } = await supabase
      .from("app_config")
      .update({
        rotation_checkin_reward: nextReward,
        rotation_reset_dow: nextReset.resetDow,
        rotation_reset_hour: nextReset.resetHour,
        rotation_reset_tz: nextReset.resetTz,
      })
      .eq("id", 1);
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ rotationCheckinReward: nextReward, rotationReset: nextReset });
    toast("Rotation lane settings saved", Pencil);
    return true;
  },

  deleteSlotDefinition: async (id) => {
    if (!supabase || !get().can("slots.manage")) return false;
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
      .select(`id, definition:slot_definitions(${SLOT_DEF_COLUMNS})`)
      .eq("user_id", userId);
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as unknown as UserSlotRow[])
      .map(rowToTargetedSlot)
      .filter((s): s is TargetedSlot => s !== null);
  },

  grantUserSlot: async (userId, definitionId) => {
    if (!supabase || !get().can("slots.manage")) return false;
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
    if (!supabase || !get().can("slots.manage")) return false;
    const { error } = await supabase.from("user_slots").delete().eq("id", slotId);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  addGame: async (meta, status = "backlog", finishTag = null, opts) => {
    const { cloud, userId, games, coins, platformList, genreList } = get();
    // Last-resort duplicate guard (AddGameModal routes duplicates to attach /
    // intercept flows before calling this; other callers — the Caravan, message
    // embeds — still rely on it). Matched by shared catalog identity, and
    // partitioned wishlist-vs-library so an owned game CAN be wishlisted for
    // another version (the modal validates the versions).
    const key = catalogKey(meta);
    if (
      key &&
      games.some(
        (g) =>
          g.compilationId == null &&
          catalogKey(g) === key &&
          (status === "wishlist" ? g.status === "wishlist" : g.status !== "wishlist"),
      )
    )
      return;

    // A game added straight to Finished can carry the conclusion tag the player
    // picked (Beaten / Completed / Endless); it's only meaningful for that board.
    const tag: FinishTag | null = status === "finished" ? finishTag : null;

    // Controlled taxonomy: canonicalize imported (RAWG/catalog) genres & platforms
    // and each owned-copy platform to the master lists, dropping any off-list term.
    // The server triggers reject unknown terms; this guarantees we never send one.
    meta = {
      ...meta,
      genres: canonicalizeTerms(meta.genres, genreList),
      platforms: canonicalizeTerms(meta.platforms, platformList),
      copies: (meta.copies ?? [])
        .map((c) => {
          const [p] = canonicalizeTerms([c.platform], platformList);
          return p ? { ...c, platform: p } : null;
        })
        .filter((c): c is NonNullable<typeof c> => c !== null),
    };

    // Canonicalize the per-version starting playtime against the same master
    // list as the copies; entries on unknown platforms are dropped with them.
    const versionHours = (opts?.versionHours ?? [])
      .map((vh) => {
        const [p] = canonicalizeTerms([vh.platform], platformList);
        return p ? { ...vh, platform: p } : null;
      })
      .filter((vh): vh is NonNullable<typeof vh> => vh !== null && vh.hours > 0);
    const versionTotal = versionHours.reduce((sum, vh) => sum + vh.hours, 0);

    if (!cloud) {
      const game: Game = {
        ...meta,
        id: uid(),
        status,
        addedAt: Date.now(),
        finishedAt: status === "finished" ? Date.now() : undefined,
        finishTag: tag,
        // versionHours replaces the single playedHours path; offline has no
        // event log, so the per-version detail collapses into the total.
        playedHours: opts?.versionHours ? versionTotal : (meta.playedHours ?? 0),
        copies: meta.copies ?? [],
      };
      const next = [game, ...games];
      set({ games: next });
      saveLocal(coins, next);
      addedToast(meta.title, status);
      return;
    }
    if (!userId || !supabase) return;

    // Any "time already played" entered at add time is applied via a follow-up
    // update (below), not the insert. The playtime log is populated only by the
    // played_hours trigger, which fires on UPDATE — inserting played_hours
    // directly would set the game's total with no matching playtime_events row, so
    // the per-version editor would read zero and later double-count edits.
    // When per-version hours were captured, they replace this path entirely and
    // are written through set_platform_playtime after the insert instead.
    const initialPlayed = opts?.versionHours ? 0 : Math.max(0, meta.playedHours ?? 0);

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
        played_hours: 0,
        copies: meta.copies ?? [],
        catalog_id: meta.catalogId ?? null,
        ongoing: meta.ongoing ?? false,
        status,
        finished_at: status === "finished" ? new Date().toISOString() : null,
        finish_tag: tag,
      })
      .select()
      .single();

    if (error) {
      set({ error: error.message });
      return;
    }
    let row = data as GameRow;

    // Record the starting playtime through an update so the trigger logs a
    // playtime_events row (auto-attributed to the single owned copy, else the
    // Unspecified bucket). This keeps the total in step with the event log the
    // per-version editor reads.
    if (initialPlayed > 0) {
      const { data: played, error: playError } = await supabase
        .from("games")
        .update({ played_hours: initialPlayed })
        .eq("id", row.id)
        .select()
        .single();
      if (playError) {
        set({ error: playError.message });
      } else {
        row = played as GameRow;
      }
    }
    set({ games: [rowToGame(row), ...get().games] });
    // Per-version starting playtime: sequential set_platform_playtime calls (the
    // RPC needs the row to exist, and each logs an attributed playtime event and
    // mirrors the new total into state via setPlatformPlaytime).
    for (const vh of versionHours) {
      await get().setPlatformPlaytime(row.id, vh.platform, vh.format, vh.hours);
    }
    addedToast(meta.title, status);
  },

  attachCopies: async (id, copies, versionHours) => {
    const { cloud, games, coins, platformList } = get();
    const game = games.find((g) => g.id === id);
    if (!game) return;
    // Same canonicalization as addGame — the server trigger rejects unknown terms.
    const canonical = copies
      .map((c) => {
        const [p] = canonicalizeTerms([c.platform], platformList);
        return p ? { ...c, platform: p } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    const hours = (versionHours ?? [])
      .map((vh) => {
        const [p] = canonicalizeTerms([vh.platform], platformList);
        return p ? { ...vh, platform: p } : null;
      })
      .filter((vh): vh is NonNullable<typeof vh> => vh !== null && vh.hours > 0);
    if (canonical.length === 0 && hours.length === 0) return;

    // Append — never rewrite. Owning two copies of the same version is
    // legitimate, so no dedupe here (the confirm dialog surfaces duplicates).
    const merged = [...(game.copies ?? []), ...canonical];

    if (!cloud) {
      const added = hours.reduce((sum, vh) => sum + vh.hours, 0);
      const next = games.map((g) =>
        g.id === id ? { ...g, copies: merged, playedHours: (g.playedHours ?? 0) + added } : g,
      );
      set({ games: next });
      saveLocal(coins, next);
      toast(`Added a new copy of ${game.title}`, Package);
      return;
    }
    if (!supabase) return;
    set({ games: games.map((g) => (g.id === id ? { ...g, copies: merged } : g)) });
    const { error } = await supabase.from("games").update({ copies: merged }).eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    // Starting playtime for the new versions lands on top of the existing log:
    // read the version's current hours and add the entered time, so attaching a
    // copy never clobbers time already tracked on that platform.
    if (hours.length > 0) {
      const sessions = await get().fetchPlaySessions(id);
      const breakdown = summarizePlatformPlaytime(sessions);
      for (const vh of hours) {
        const current =
          breakdown.byVersion.find(
            (v) => v.platform === vh.platform && (v.format ?? null) === (vh.format ?? null),
          )?.hours ?? 0;
        await get().setPlatformPlaytime(id, vh.platform, vh.format, current + vh.hours);
      }
    }
    toast(`Added a new copy of ${game.title}`, Package);
  },

  addCompilation: async (container, children, status = "backlog", templateId) => {
    const { cloud, userId, coins, platformList, genreList } = get();
    // Controlled taxonomy: canonicalize each child's genres/platforms and the
    // container's platform to the master lists (drop off-list terms) so the games
    // the RPC inserts never trip the server's taxonomy triggers.
    const named = children
      .filter((c) => c.name.trim())
      .map((c) => ({
        ...c,
        genres: canonicalizeTerms(c.genres, genreList),
        platforms: canonicalizeTerms(c.platforms, platformList),
      }));
    if (!container.title.trim() || named.length === 0) return;
    // Every container copy's platform is canonicalized like the old single one.
    const copies = container.copies.map((c) => ({
      platform: c.platform?.trim()
        ? canonicalizeTerms([c.platform], platformList)[0]
        : undefined,
      format: c.format,
      cost: c.cost,
      note: c.note?.trim() || undefined,
    }));
    if (copies.length === 0) return;

    // Each child's USD share of the GRAND total (sum of copy costs): trust the
    // modal's per-child split when it's complete, else fall back to an even
    // split. The share fractions then apply to every copy cent-exactly.
    const copyCents = copies.map((c) => toCents(c.cost ?? 0));
    const totalCents = copyCents.reduce((a, b) => a + b, 0);
    const provided = named.map((c) => c.cost);
    const shares = provided.every((c) => typeof c === "number")
      ? provided.map((c) => toCents(c as number))
      : splitEvenly(totalCents, named.length);
    const matrix = distributeAcrossCopies(copyCents, shares);
    const childCopies = (i: number) =>
      copies.map((cp, k) => ({
        platform: cp.platform,
        format: cp.format,
        cost: fromCents(matrix[k][i]),
      }));

    if (!cloud) {
      const compId = uid();
      const comp: Compilation = {
        id: compId,
        title: container.title.trim(),
        totalCost: fromCents(totalCents),
        copies: copies.map((c) => ({ ...c, id: uid(), platform: c.platform ?? "" })),
        released: container.released,
        platform: copies[0]?.platform,
        format: copies[0]?.format,
        createdAt: Date.now(),
        expanded: true,
        templateId: templateId ?? null,
        carryoverHours: 0,
      };
      const newGames: Game[] = named.map((c, i) => {
        const childStatus = c.status ?? status; // per-game override, else the container default
        return {
        id: uid(),
        title: c.name.trim(),
        ...childGameMeta(c),
        // Fill-blanks: the child's own (catalog) date wins over the bundle's.
        released: c.released ?? container.released,
        status: childStatus,
        addedAt: Date.now(),
        finishedAt: childStatus === "finished" ? Date.now() : undefined,
        playedHours: 0,
        copies: childCopies(i).map((cp) => ({ ...cp, id: uid(), platform: cp.platform ?? "" })),
        compilationId: compId,
        compilationName: container.title.trim(),
        };
      });
      const nextGames = [...newGames, ...get().games];
      const nextComps = [comp, ...get().compilations];
      set({ games: nextGames, compilations: nextComps });
      saveLocal(coins, nextGames);
      saveLocalCompilations(nextComps);
      toast(`Added compilation ${container.title.trim()}`, Package);
      return;
    }
    if (!userId || !supabase) return;

    const { data, error } = await supabase.rpc("create_compilation", {
      p_title: container.title.trim(),
      p_total: fromCents(totalCents),
      p_platform: copies[0]?.platform ?? null,
      p_format: copies[0]?.format ?? null,
      p_status: status,
      p_children: named.map((c, i) => childToRpc(c, fromCents(shares[i]), childCopies(i))),
      p_template: templateId ?? null,
      p_copies: copies,
      p_released: container.released ?? null,
    });
    if (error) {
      set({ error: error.message });
      return;
    }
    const newGames = ((data ?? []) as GameRow[]).map(rowToGame);
    const compId = newGames[0]?.compilationId ?? undefined;
    const comp: Compilation | null = compId
      ? {
          id: compId,
          title: container.title.trim(),
          totalCost: fromCents(totalCents),
          copies: copies.map((c) => ({ ...c, id: uid(), platform: c.platform ?? "" })),
          released: container.released,
          platform: copies[0]?.platform,
          format: copies[0]?.format,
          createdAt: Date.now(),
          expanded: true,
          templateId: templateId ?? null,
          carryoverHours: 0,
        }
      : null;
    set({
      games: [...newGames, ...get().games],
      compilations: comp ? [comp, ...get().compilations] : get().compilations,
    });
    toast(`Added compilation ${container.title.trim()}`, Package);
  },

  editCompilation: async (id, container, children) => {
    const { cloud, games, compilations, coins, platformList } = get();
    if (!compilations.some((c) => c.id === id)) return;
    const named = children.filter((c) => c.name.trim());
    if (!container.title.trim() || named.length === 0) return;

    for (const c of container.copies) {
      if (c.platform?.trim()) await get().addCustomPlatform(c.platform.trim());
    }
    const copies = container.copies.map((c) => ({
      platform: c.platform?.trim()
        ? canonicalizeTerms([c.platform], platformList)[0] ?? c.platform.trim()
        : undefined,
      format: c.format,
      cost: c.cost,
      note: c.note?.trim() || undefined,
    }));
    if (copies.length === 0) return;

    const copyCents = copies.map((c) => toCents(c.cost ?? 0));
    const totalCents = copyCents.reduce((a, b) => a + b, 0);
    const provided = named.map((c) => c.cost);
    const shares = provided.every((c) => typeof c === "number")
      ? provided.map((c) => toCents(c as number))
      : splitEvenly(totalCents, named.length);
    const matrix = distributeAcrossCopies(copyCents, shares);
    const childCopies = (i: number) =>
      copies.map((cp, k) => ({
        platform: cp.platform,
        format: cp.format,
        cost: fromCents(matrix[k][i]),
      }));
    const title = container.title.trim();

    const patchComp = (cs: Compilation[]) =>
      cs.map((c) =>
        c.id === id
          ? {
              ...c,
              title,
              totalCost: fromCents(totalCents),
              copies: copies.map((cp) => ({ ...cp, id: uid(), platform: cp.platform ?? "" })),
              released: container.released,
              platform: copies[0]?.platform,
              format: copies[0]?.format,
            }
          : c,
      );

    if (!cloud) {
      // Rebuild the compilation's games: keep+update listed existing children,
      // insert newly added ones, drop existing children no longer listed.
      const childGames: Game[] = named.map((c, i) => {
        const newCopies = childCopies(i).map((cp) => ({
          ...cp,
          id: uid(),
          platform: cp.platform ?? "",
        }));
        const existing = c.gameId ? games.find((g) => g.id === c.gameId) : undefined;
        if (existing) {
          // An explicit per-game status moves the game (Bazaar/Finished); absent
          // it, the child keeps its current status. Mirrors update_compilation: a
          // direct move (no coins), freeing any slot and stamping/clearing finish.
          // Release date fills a blank, never overwrites the child's own.
          const moved = c.status != null && c.status !== existing.status;
          return {
            ...existing,
            title: c.name.trim(),
            hours: c.hours,
            compilationName: title,
            copies: newCopies,
            released: existing.released ?? c.released ?? container.released,
            ...(moved
              ? {
                  status: c.status!,
                  slotId: null,
                  finishedAt:
                    c.status === "finished" ? existing.finishedAt ?? Date.now() : undefined,
                }
              : {}),
          };
        }
        const childStatus = c.status ?? "backlog"; // new children take their chosen status
        return {
          id: uid(),
          title: c.name.trim(),
          ...childGameMeta(c),
          released: c.released ?? container.released,
          status: childStatus,
          addedAt: Date.now(),
          finishedAt: childStatus === "finished" ? Date.now() : undefined,
          playedHours: 0,
          copies: newCopies,
          compilationId: id,
          compilationName: title,
        };
      });
      const nextGames = [...childGames, ...games.filter((g) => g.compilationId !== id)];
      const nextComps = patchComp(compilations);
      set({ games: nextGames, compilations: nextComps });
      saveLocal(coins, nextGames);
      saveLocalCompilations(nextComps);
      toast(`Updated ${title}`, Package);
      return;
    }
    if (!supabase) return;

    const { data, error } = await supabase.rpc("update_compilation", {
      p_id: id,
      p_title: title,
      p_total: fromCents(totalCents),
      p_platform: copies[0]?.platform ?? null,
      p_format: copies[0]?.format ?? null,
      p_children: named.map((c, i) => childToRpc(c, fromCents(shares[i]), childCopies(i))),
      p_copies: copies,
      p_released: container.released ?? null,
    });
    if (error) {
      set({ error: error.message });
      return;
    }
    const rows = ((data ?? []) as GameRow[]).map(rowToGame);
    set({
      games: [...rows, ...get().games.filter((g) => g.compilationId !== id)],
      compilations: patchComp(get().compilations),
    });
    toast(`Updated ${title}`, Package);
  },

  deleteCompilation: async (id) => {
    const { cloud, games, compilations, coins } = get();
    const comp = compilations.find((c) => c.id === id);
    if (!comp) return;

    if (!cloud) {
      const nextGames = games.filter((g) => g.compilationId !== id);
      const nextComps = compilations.filter((c) => c.id !== id);
      set({ games: nextGames, compilations: nextComps });
      saveLocal(coins, nextGames);
      saveLocalCompilations(nextComps);
      toast(`Deleted ${comp.title}`, Trash2);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("delete_compilation", { p_id: id });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({
      games: get().games.filter((g) => g.compilationId !== id),
      compilations: get().compilations.filter((c) => c.id !== id),
    });
    toast(`Deleted ${comp.title}`, Trash2);
  },

  setCompilationChildStatus: async (id, status) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    // Only for compilation children; no-op if it's already there.
    if (!game || game.compilationId == null || game.status === status) return;
    const finishedAt = status === "finished" ? Date.now() : undefined;
    const icon = status === "finished" ? Trophy : Store;
    const where = status === "finished" ? "Finished" : "your Bazaar";

    if (!cloud) {
      const next = games.map((g) => (g.id === id ? { ...g, status, finishedAt } : g));
      set({ games: next });
      saveLocal(coins, next);
      toast(`Moved ${game.title} to ${where}`, icon);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase
      .from("games")
      .update({ status, finished_at: finishedAt ? new Date(finishedAt).toISOString() : null })
      .eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: games.map((g) => (g.id === id ? { ...g, status, finishedAt } : g)) });
    toast(`Moved ${game.title} to ${where}`, icon);
  },

  refreshParentTemplates: async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("compilation_templates")
      .select(
        "id, title, games, parent_catalog_id, parent:catalog_games!compilation_templates_parent_catalog_id_fkey(rawg_id)",
      )
      .not("parent_catalog_id", "is", null);
    set({
      parentTemplates: ((data ?? []) as unknown as ParentTemplateRow[]).map(rowToParentTemplate),
    });
  },

  setCompilationExpanded: async (id, expanded) => {
    const { cloud, games, compilations } = get();
    const comp = compilations.find((c) => c.id === id);
    if (!comp || comp.expanded === expanded) return;
    // Mirror the server guard: a bundle with a Now Playing child can't collapse
    // (its card must never vanish from the lane while it holds a slot).
    if (!expanded && games.some((g) => g.compilationId === id && g.status === "playing")) {
      toast("Finish or shelve the Now Playing game in this bundle first", AlertTriangle);
      return;
    }

    const patch = (cs: Compilation[]) => cs.map((c) => (c.id === id ? { ...c, expanded } : c));
    const next = patch(compilations);
    set({ compilations: next });
    if (!cloud) {
      saveLocalCompilations(next);
      toast(expanded ? `Expanded ${comp.title}` : `Collapsed into ${comp.title}`, Package);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("set_compilation_expanded", {
      p_id: id,
      p_expanded: expanded,
    });
    if (error) {
      // Roll the optimistic flip back — the server is authoritative.
      set({
        compilations: get().compilations.map((c) => (c.id === id ? { ...c, expanded: comp.expanded } : c)),
        error: error.message,
      });
      return;
    }
    toast(expanded ? `Expanded ${comp.title}` : `Collapsed into ${comp.title}`, Package);
  },

  setCompilationParentImage: async (id, file) => {
    const { cloud, userId, compilations } = get();
    if (!cloud || !supabase || !userId) return;
    if (!compilations.some((c) => c.id === id)) return;
    try {
      const blob = await downscaleImage(file, 1000);
      const path = `${userId}/comp-${id}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("covers")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("covers").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase.rpc("set_compilation_parent_image", {
        p_id: id,
        p_image: url,
      });
      if (dbErr) throw dbErr;
      set({
        compilations: get().compilations.map((c) => (c.id === id ? { ...c, parentImage: url } : c)),
      });
      toast("Cover image updated", ImagePlus);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Couldn't update that cover." });
    }
  },

  clearCompilationParentImage: async (id) => {
    const { cloud, userId, compilations } = get();
    const comp = compilations.find((c) => c.id === id);
    if (!comp || comp.parentImage == null) return;
    const patch = (cs: Compilation[]) =>
      cs.map((c) => (c.id === id ? { ...c, parentImage: undefined } : c));
    if (!cloud) {
      const next = patch(compilations);
      set({ compilations: next });
      saveLocalCompilations(next);
      toast("Cover image removed", Trash2);
      return;
    }
    if (!supabase || !userId) return;
    // Best-effort blob cleanup; the row update is what matters.
    await supabase.storage.from("covers").remove([`${userId}/comp-${id}.jpg`]);
    const { error } = await supabase.rpc("set_compilation_parent_image", {
      p_id: id,
      p_image: null,
    });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ compilations: patch(get().compilations) });
    toast("Cover image removed", Trash2);
  },

  expandGameToCompilation: async (gameId, template) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === gameId);
    if (!game || game.status === "wishlist" || game.compilationId != null) return;
    const drafts = templateGamesToChildDrafts(template.games);
    if (drafts.length === 0) return;

    if (!cloud) {
      // Same conversion as the RPC, mirrored locally: EVERY parent copy becomes
      // a compilation copy, each split evenly (to the cent) across the children;
      // bundle-level carryover hours; full refund of a started parent's fee.
      const compId = uid();
      const parentCopies = game.copies ?? [];
      const total = copiesTotalCost(parentCopies);
      // Per-copy even splits: children[i] gets slice i of every copy's cents.
      const perCopyShares = parentCopies.map((cp) =>
        splitEvenly(toCents(cp.cost ?? 0), drafts.length),
      );
      const comp: Compilation = {
        id: compId,
        title: template.title,
        totalCost: total,
        copies: parentCopies.map((cp) => ({ ...cp, id: uid() })),
        released: game.released,
        platform: parentCopies[0]?.platform || undefined,
        format: parentCopies[0]?.format,
        createdAt: Date.now(),
        expanded: true,
        templateId: template.id,
        carryoverHours: game.playedHours ?? 0,
        parentImage: game.image,
      };
      const childStatus = game.status === "finished" ? ("finished" as const) : ("backlog" as const);
      const children: Game[] = drafts.map((c, i) => ({
        id: uid(),
        title: c.name.trim(),
        ...childGameMeta(c),
        released: c.released ?? game.released,
        status: childStatus,
        addedAt: Date.now(),
        finishedAt: childStatus === "finished" ? (game.finishedAt ?? Date.now()) : undefined,
        playedHours: 0,
        copies: parentCopies.length
          ? parentCopies.map((cp, k) => ({
              id: uid(),
              platform: cp.platform || "",
              format: cp.format,
              cost: fromCents(perCopyShares[k][i]),
            }))
          : [{ id: uid(), platform: "" }],
        compilationId: compId,
        compilationName: template.title,
      }));
      const refund = game.status === "playing" ? (game.pricePaid ?? 0) : 0;
      const nc = coins + refund;
      const nextGames = [...children, ...games.filter((g) => g.id !== gameId)];
      const nextComps = [comp, ...get().compilations];
      const led = refund > 0
        ? [localEvent("expand_refund", refund, nc, game.title), ...get().ledger]
        : get().ledger;
      set({ games: nextGames, compilations: nextComps, coins: nc, ledger: led });
      saveLocal(nc, nextGames, led);
      saveLocalCompilations(nextComps);
      toast(
        refund > 0
          ? `Expanded into ${template.title} · +${refund} refunded`
          : `Expanded into ${template.title}`,
        Package,
      );
      return;
    }
    if (!supabase) return;

    const { data, error } = await supabase
      .rpc("expand_game_to_compilation", { p_game: gameId, p_template: template.id })
      .single();
    if (error) {
      set({ error: error.message });
      return;
    }
    const res = data as { coins: number; refund: number; children: GameRow[] | null };
    const children = ((res.children ?? []) as GameRow[]).map(rowToGame);
    const compId = children[0]?.compilationId;
    const comp: Compilation | null = compId
      ? {
          id: compId,
          title: template.title,
          totalCost: copiesTotalCost(game.copies),
          copies: (game.copies ?? []).map((cp) => ({ ...cp, id: uid() })),
          released: game.released,
          platform: game.copies?.[0]?.platform || undefined,
          format: game.copies?.[0]?.format,
          createdAt: Date.now(),
          expanded: true,
          templateId: template.id,
          carryoverHours: game.playedHours ?? 0,
          parentImage: game.image,
        }
      : null;
    set({
      games: [...children, ...get().games.filter((g) => g.id !== gameId)],
      compilations: comp ? [comp, ...get().compilations] : get().compilations,
      coins: res.coins,
    });
    toast(
      res.refund > 0
        ? `Expanded into ${template.title} · +${res.refund} refunded`
        : `Expanded into ${template.title}`,
      Package,
    );
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
      // Mirror the server's merge-on-import: if a standalone copy of this game
      // is already owned, fold the wishlist entry's versions into it instead of
      // making a second card.
      const mergeRes = mergeWishlistIntoOwned(games, id);
      const next = mergeRes.mergedInto
        ? mergeRes.games
        : games.map((g) => (g.id === id ? { ...g, status: "backlog" as const } : g));
      const led = [
        localEvent("charter_consume", 0, coins, game.title, -1, nextCharters),
        ...get().ledger,
      ];
      set({ games: next, charters: nextCharters, ledger: led });
      saveLocal(coins, next, led, nextCharters);
      celebrate();
      toast(
        mergeRes.mergedInto
          ? `Imported ${game.title} — merged onto your existing card`
          : `Imported ${game.title} to your Bazaar`,
        Stamp,
      );
      return;
    }
    if (!supabase) return;
    const { data, error } = await supabase
      .rpc("import_with_charter", { p_game: id })
      .single();
    if (error) {
      set({ error: error.message });
      return;
    }
    const res = data as {
      charters: number;
      merged_into: string | null;
      merged_copies: GameCopy[] | null;
    };
    if (res.merged_into) {
      // The server appended the wishlist entry's versions to the owned card and
      // deleted the wishlist row — reflect both here.
      set({
        charters: res.charters,
        games: get()
          .games.filter((g) => g.id !== id)
          .map((g) =>
            g.id === res.merged_into ? { ...g, copies: res.merged_copies ?? g.copies } : g,
          ),
      });
    } else {
      set({
        charters: res.charters,
        games: get().games.map((g) => (g.id === id ? { ...g, status: "backlog" } : g)),
      });
    }
    celebrate();
    toast(
      res.merged_into
        ? `Imported ${game.title} — merged onto your existing card`
        : `Imported ${game.title} to your Bazaar`,
      Stamp,
    );
  },

  buyCharter: async () => {
    const { cloud, coins, charters, charterCost, games, economy } = get();

    if (coins < charterCost) {
      toast("Not enough coins for a charter", Coins);
      return;
    }
    // Overdraft Guard: a charter is an optional spend, so refuse it when buying one
    // would leave you unable to start any Bazaar game with no game already in play
    // to earn from — a soft-lock. (The server re-checks this authoritatively.)
    const floor = cheapestBazaarPrice(games, economy.price);
    if (wouldSoftLock(coins, charterCost, floor, activeIncomeGameCount(games))) {
      toast(
        "That would leave you short of the cheapest Bazaar game with nothing in play. Finish or shelve a game first.",
        AlertTriangle,
      );
      return;
    }

    if (!cloud) {
      const nc = coins - charterCost;
      const nch = charters + 1;
      const led = [localEvent("charter_buy", -charterCost, nc, null, 1, nch), ...get().ledger];
      set({ coins: nc, charters: nch, ledger: led });
      saveLocal(nc, get().games, led, nch);
      toast("Bought an Import Charter", Scroll);
      return;
    }
    if (!supabase) return;
    const { data, error } = await supabase.rpc("buy_charter", { p_floor: floor ?? 0 }).single();
    if (error) {
      if (error.message.includes("SOFT_LOCK")) {
        toast(
          "That would leave you short of the cheapest Bazaar game with nothing in play. Finish or shelve a game first.",
          AlertTriangle,
        );
        return;
      }
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

  buyGame: async (id, choice = { kind: "auto" }) => {
    const { cloud, games, coins, generalSlots, completionistSlots, myTargetedSlots } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "backlog") return;
    // Story locking: the UI intercepts with an explanation modal; this is the
    // last line of defense client-side (the RPC re-checks authoritatively).
    if (isPrerequisiteLocked(games, game)) {
      toast("Story-locked — finish its prerequisite first", Lock);
      return;
    }

    // Buying straight into the Completionist lane (going for 100% from the start):
    // capacity-checked, no Focus slot consumed.
    const toCompletionist = choice.kind === "completionist";
    if (toCompletionist) {
      if (game.ongoing) {
        toast("Live-service games belong in the Rotation lane", Lock);
        return;
      }
      if (!canEnterLane(game, games, "completionist", completionistSlots)) {
        toast("Your Completionist lane is full — finish or remove one first", Lock);
        return;
      }
    }
    // Translate a Focus slot choice (auto / force-general / a specific slot) into the
    // RPC args + the offline target slot.
    const plan = planSlotForGame(game, playingGames(games), generalSlots, myTargetedSlots);
    const slot = toCompletionist
      ? { ok: true as const, pSlot: null, pGeneral: false, offlineSlot: null }
      : resolveSlotChoice(choice, plan);
    if (!slot.ok) {
      toast("No open Now Playing slot — finish or shelve a game first", Lock);
      return;
    }
    // A compilation child prices off its bundle's release date (see
    // withBundleReleased) — the recent collection is what was bought.
    const fullPrice = computeFormula(withBundleReleased(game, get().compilations), get().economy.price);
    // Family Discount: a Bazaar edition whose family is already active/cleared
    // costs the Replay-Bonus percentage of its fee (its finish would pay the
    // reduced bonus, so the fee drops by the same ratio). Derived, never stored.
    const familyDiscount = isFamilyDiscounted(games, game);
    const price = familyDiscount
      ? computeFamilyDiscountPrice(fullPrice, get().replayBonusPct)
      : fullPrice;
    if (coins < price) return;

    if (!cloud) {
      const next = games.map((g) =>
        g.id === id
          ? {
              ...g,
              status: "playing" as const,
              startedAt: Date.now(),
              pricePaid: price,
              slotId: slot.offlineSlot,
              completionist: toCompletionist,
            }
          : g,
      );
      const nc = coins - price;
      const led = [
        localEvent(familyDiscount ? "family_discount_purchase" : "purchase", -price, nc, game.title),
        ...get().ledger,
      ];
      set({ games: next, coins: nc, ledger: led });
      saveLocal(nc, next, led);
      toast(`Bought ${game.title} — now playing!`, Gamepad2);
      return;
    }
    if (!supabase) return;

    const { data, error } = await supabase
      .rpc("apply_purchase", {
        p_game: id,
        p_price: price,
        p_slot: slot.pSlot,
        p_general: slot.pGeneral,
        p_completionist: toCompletionist,
        p_family_discount: familyDiscount,
      })
      .single();
    if (error) {
      if (error.message.includes("PREREQUISITE_LOCKED")) {
        toast("Story-locked — finish its prerequisite first", Lock);
      } else {
        set({ error: error.message });
      }
      return;
    }
    const { coins: newCoins, slot_id } = data as { coins: number; slot_id: string | null };
    set({
      coins: newCoins,
      games: games.map((g) =>
        g.id === id
          ? {
              ...g,
              status: "playing",
              startedAt: Date.now(),
              pricePaid: price,
              slotId: slot_id,
              completionist: toCompletionist,
            }
          : g,
      ),
    });
    toast(`Bought ${game.title} — now playing!`, Gamepad2);
  },

  // Redeem one Onboarding Voucher to activate a Bazaar game into Now Playing for
  // free. Mirrors buyGame's slot logic exactly, but spends a voucher instead of
  // coins and records price_paid 0. Strictly backlog → playing (the Wishlist can
  // never reach here — the action only runs for a backlog game).
  redeemVoucher: async (id, choice = { kind: "auto" }) => {
    const { cloud, games, vouchers, generalSlots, myTargetedSlots } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "backlog") return;
    if (isPrerequisiteLocked(games, game)) {
      toast("Story-locked — finish its prerequisite first", Lock);
      return;
    }
    if (vouchers < 1) {
      toast("No vouchers available", Ticket);
      return;
    }
    const plan = planSlotForGame(game, playingGames(games), generalSlots, myTargetedSlots);
    const slot = resolveSlotChoice(choice, plan);
    if (!slot.ok) {
      toast("No open Now Playing slot — finish or shelve a game first", Lock);
      return;
    }

    if (!cloud) {
      const next = games.map((g) =>
        g.id === id
          ? { ...g, status: "playing" as const, startedAt: Date.now(), pricePaid: 0, slotId: slot.offlineSlot }
          : g,
      );
      const nv = vouchers - 1;
      const led = [localEvent("voucher_redeem", 0, get().coins, game.title, 0, null, -1, nv), ...get().ledger];
      set({ games: next, vouchers: nv, ledger: led });
      saveLocal(get().coins, next, led);
      toast(`Used a voucher — ${game.title} is now playing!`, Ticket);
      return;
    }
    if (!supabase) return;

    const { data, error } = await supabase
      .rpc("apply_voucher_redemption", { p_game: id, p_slot: slot.pSlot, p_general: slot.pGeneral })
      .single();
    if (error) {
      if (error.message.includes("PREREQUISITE_LOCKED")) {
        toast("Story-locked — finish its prerequisite first", Lock);
      } else {
        set({ error: error.message });
      }
      return;
    }
    const { vouchers: newVouchers, slot_id } = data as { vouchers: number; slot_id: string | null };
    set({
      vouchers: newVouchers,
      games: games.map((g) =>
        g.id === id
          ? { ...g, status: "playing", startedAt: Date.now(), pricePaid: 0, slotId: slot_id }
          : g,
      ),
    });
    toast(`Used a voucher — ${game.title} is now playing!`, Ticket);
  },

  // Pull a Finished game back into the Replay lane — free (it's already owned, so
  // the Bazaar purchase flow is bypassed). The game flips finished → playing, clears
  // its finish snapshot, and is marked resumed so re-finishing pays the smaller
  // Replay Bonus. Capacity = replaySlots (the server re-checks).
  replayGame: async (id) => {
    const { cloud, games, coins, replaySlots } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "finished") return;
    if (!canEnterLane(game, games, "replay", replaySlots)) {
      toast("Your Replay lane is full — finish or remove one first", Lock);
      return;
    }

    const apply = (g: Game): Game =>
      g.id === id
        ? { ...g, status: "playing", startedAt: Date.now(), pricePaid: 0, finishedAt: undefined, reward: undefined, slotId: null, resumed: true, completionist: false, inRotation: false }
        : g;

    if (!cloud) {
      const next = games.map(apply);
      set({ games: next });
      saveLocal(coins, next);
      toast(`Replaying ${game.title} — back in Now Playing`, Gamepad2);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("enter_replay", { p_game: id });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map(apply) });
    toast(`Replaying ${game.title} — back in Now Playing`, Gamepad2);
  },

  abortReplay: async (id) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing") return;
    // Only a Replay-lane game (a finished game pulled back for free) can be sent
    // straight back to Finished this way.
    if (laneOf(game) !== "replay") return;

    // Back to Finished, free: no bounty, no coin change. The game was already
    // fully owned, so price_paid stays 0 and reward stays cleared.
    const apply = (g: Game): Game =>
      g.id === id
        ? { ...g, status: "finished", finishedAt: Date.now(), slotId: null, resumed: false, inRotation: false }
        : g;

    if (!cloud) {
      const next = games.map(apply);
      set({ games: next });
      saveLocal(coins, next);
      toast(`${game.title} sent back to Finished`, Trophy);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("abort_replay", { p_game: id });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map(apply) });
    toast(`${game.title} sent back to Finished`, Trophy);
  },

  enterCompletionist: async (id) => {
    const { cloud, games, coins, completionistSlots } = get();
    const game = games.find((g) => g.id === id);
    // A game you're playing, or a finished game pulled back to 100% it. Live-service
    // games belong in Rotation. Free (no buy — backlog games buy in via buyGame).
    if (!game || game.ongoing || !["playing", "finished"].includes(game.status)) return;
    if (!canEnterLane(game, games, "completionist", completionistSlots)) {
      toast("Your Completionist lane is full — finish or remove one first", Lock);
      return;
    }

    const fromFinished = game.status === "finished";
    const apply = (g: Game): Game =>
      g.id === id
        ? {
            ...g,
            status: "playing",
            completionist: true,
            inRotation: false,
            slotId: null,
            resumed: fromFinished ? true : g.resumed,
            startedAt: fromFinished ? Date.now() : g.startedAt,
            pricePaid: fromFinished ? 0 : g.pricePaid,
            finishedAt: undefined,
            reward: undefined,
          }
        : g;

    if (!cloud) {
      const next = games.map(apply);
      set({ games: next });
      saveLocal(coins, next);
      toast(`${game.title} is now in your Completionist lane`, Gamepad2);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("enter_completionist", { p_game: id });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map(apply) });
    toast(`${game.title} is now in your Completionist lane`, Gamepad2);
  },

  exitCompletionist: async (id) => {
    const { cloud, games, coins, generalSlots, replaySlots } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing" || !game.completionist) return;

    // Stopping returns the game to play in its prior lane (Replay if it's a resumed
    // game, else Focus) — which needs an open slot there, or it'd go over capacity.
    const fallback: Lane = game.resumed ? "replay" : "focus";
    const cap = fallback === "replay" ? replaySlots : generalSlots;
    if (!canEnterLane(game, games, fallback, cap)) {
      toast(
        `Your ${fallback === "replay" ? "Replay" : "Focus"} lane is full — finish or remove one first`,
        Lock,
      );
      return;
    }

    // Clear the flag; the game stays playing and falls back to its prior lane.
    // Free and reversible.
    const apply = (g: Game): Game =>
      g.id === id ? { ...g, completionist: false } : g;

    if (!cloud) {
      const next = games.map(apply);
      set({ games: next });
      saveLocal(coins, next);
      toast(`Stopped going for completion on ${game.title}`, Undo2);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("exit_completionist", { p_game: id });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map(apply) });
    toast(`Stopped going for completion on ${game.title}`, Undo2);
  },

  abandonCompletion: async (id) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    // Only a previously-finished (resumed) game can be abandoned back to Finished — a
    // never-beaten completionist game has no Finished state to return to (it shelves
    // to the Bazaar or stops back to Focus instead).
    if (!game || game.status !== "playing" || !game.completionist || !game.resumed) return;

    // Conclude to Finished, tag Beaten, no coins (mastery aborted, campaign cleared).
    const apply = (g: Game): Game =>
      g.id === id
        ? { ...g, status: "finished", finishedAt: Date.now(), completionist: false, resumed: false, inRotation: false, slotId: null, finishTag: "beaten" }
        : g;

    if (!cloud) {
      const next = games.map(apply);
      set({ games: next });
      saveLocal(coins, next);
      toast(`Abandoned the 100% run on ${game.title}`, Trophy);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("abandon_completion", { p_game: id });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map(apply) });
    toast(`Abandoned the 100% run on ${game.title}`, Trophy);
  },

  retireRotation: async (id) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing" || !game.inRotation) return;

    // Conclude to Finished. Endless tag, unless it already carries a narrative tag
    // (a hybrid game keeps Beaten/Completed). The pre-lane archetype is restored:
    // a converted standard game sheds the live-service traits again (mirrors
    // retire_rotation). No coins.
    const tag: FinishTag = game.finishTag ?? "endless";
    const apply = (g: Game): Game =>
      g.id === id
        ? { ...g, status: "finished", finishedAt: Date.now(), inRotation: false, resumed: false, completionist: false, slotId: null, finishTag: tag, ongoing: g.preRotationOngoing ?? g.ongoing }
        : g;
    const retireToast = (undoId: string | null) =>
      toastAction(
        game.rotationOrigin === "finished"
          ? `${game.title} is back on your Finished shelf`
          : `Retired ${game.title} from Rotation`,
        {
          label: "Undo",
          onAction: () =>
            void get().undoAction({
              id: undoId,
              gameId: id,
              action: "retire",
              label: game.title,
              prevGame: game,
              coinsDelta: 0,
            }),
        },
        Trophy,
      );

    if (!cloud) {
      const next = games.map(apply);
      set({ games: next });
      saveLocal(coins, next);
      retireToast(null);
      return;
    }
    if (!supabase) return;
    const { data, error } = await supabase.rpc("retire_rotation", { p_game: id });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map(apply) });
    retireToast((data as string | null) ?? null);
  },

  convertToEndless: async (id) => {
    const { cloud, games, coins, rotationSlots } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "finished") return;
    if (!canEnterRotation(game, games, rotationSlots)) {
      toast("Your Rotation lane is full — remove one first", Lock);
      return;
    }

    // A finished game becomes an ongoing Rotation game; its finish tag is preserved
    // for when it's eventually retired (the hybrid rule), and the provenance stamps
    // let "Remove from Rotation" send it straight back to Finished, shedding the
    // inherited live-service traits (mirrors convert_to_endless).
    const apply = (g: Game): Game =>
      g.id === id
        ? { ...g, status: "playing", inRotation: true, ongoing: true, completionist: false, resumed: false, slotId: null, startedAt: Date.now(), pricePaid: 0, finishedAt: undefined, reward: undefined, rotationOrigin: "finished" as const, preRotationOngoing: g.ongoing === true }
        : g;
    const convertToast = (undoId: string | null) =>
      toastAction(
        `${game.title} is now in your Rotation lane`,
        {
          label: "Undo",
          onAction: () =>
            void get().undoAction({
              id: undoId,
              gameId: id,
              action: "convert_endless",
              label: game.title,
              prevGame: game,
              coinsDelta: 0,
            }),
        },
        Gamepad2,
      );

    if (!cloud) {
      const next = games.map(apply);
      set({ games: next });
      saveLocal(coins, next);
      convertToast(null);
      return;
    }
    if (!supabase) return;
    const { data, error } = await supabase.rpc("convert_to_endless", { p_game: id });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map(apply) });
    convertToast((data as string | null) ?? null);
  },

  setFinishTag: async (id, tag) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "finished") return;
    const apply = (g: Game): Game => (g.id === id ? { ...g, finishTag: tag } : g);

    if (!cloud) {
      const next = games.map(apply);
      set({ games: next });
      saveLocal(coins, next);
      return;
    }
    if (!supabase) return;
    // Owner-update (RLS games_modify_own) — no RPC needed.
    const { error } = await supabase.from("games").update({ finish_tag: tag }).eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map(apply) });
  },

  setPendingRoute: (id) => set({ pendingRouteId: id }),

  enterRotation: async (id) => {
    const { cloud, games, coins, rotationSlots } = get();
    const game = games.find((g) => g.id === id);
    // Only a live-service / ongoing game can enter the Rotation lane, from parked
    // (backlog), already playing, or finished — a retired endless game (concluded
    // to Finished, tagged Endless) can be pulled back into Rotation. Always free.
    if (!game || !game.ongoing || !["backlog", "playing", "finished"].includes(game.status))
      return;
    // Story locking applies to the cold start only (backlog → Rotation); a game
    // already playing or previously finished is exempt (mirrors enter_rotation).
    if (game.status === "backlog" && isPrerequisiteLocked(games, game)) {
      toast("Story-locked — finish its prerequisite first", Lock);
      return;
    }
    if (!canEnterRotation(game, games, rotationSlots)) {
      toast("Your Rotation lane is full — remove one first", Lock);
      return;
    }

    const apply = (g: Game): Game =>
      g.id === id
        ? {
            ...g,
            status: "playing",
            inRotation: true,
            slotId: null,
            startedAt: g.status !== "playing" ? Date.now() : g.startedAt,
            pricePaid: 0,
            resumed: false,
            finishedAt: undefined,
            reward: undefined,
            // Provenance: where "Remove from Rotation" should return it, and the
            // archetype to restore on retire (mirrors enter_rotation).
            rotationOrigin: g.status,
            preRotationOngoing: g.ongoing === true,
          }
        : g;

    if (!cloud) {
      const next = games.map(apply);
      set({ games: next });
      saveLocal(coins, next);
      toast(`${game.title} is now in your Rotation lane`, Gamepad2);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("enter_rotation", { p_game: id });
    if (error) {
      if (error.message.includes("PREREQUISITE_LOCKED")) {
        toast("Story-locked — finish its prerequisite first", Lock);
      } else {
        set({ error: error.message });
      }
      return;
    }
    set({ games: get().games.map(apply) });
    toast(`${game.title} is now in your Rotation lane`, Gamepad2);
  },

  exitRotation: async (id) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing" || !game.inRotation) return;

    // Back to parked (backlog), free and reversible. Ongoing games are never
    // "finished" and have no buy price, so no coins move.
    const apply = (g: Game): Game =>
      g.id === id
        ? { ...g, status: "backlog", inRotation: false, slotId: null, startedAt: undefined, pricePaid: undefined }
        : g;

    if (!cloud) {
      const next = games.map(apply);
      set({ games: next });
      saveLocal(coins, next);
      toast(`Removed ${game.title} from your Rotation lane`, Undo2);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("exit_rotation", { p_game: id });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: get().games.map(apply) });
    toast(`Removed ${game.title} from your Rotation lane`, Undo2);
  },

  rotationCheckin: async (id) => {
    const { cloud, games, coins, rotationCheckinReward, rotationCheckedIn } = get();
    const game = games.find((g) => g.id === id);
    // Only a game currently in the Rotation lane can be checked in.
    if (!game || game.status !== "playing" || !game.inRotation) return;
    if (rotationCheckedIn.includes(id)) {
      toast("Already checked in this week", Clock);
      return;
    }
    const reward = Math.max(0, rotationCheckinReward);

    if (!cloud) {
      const nextCoins = coins + reward;
      set({ coins: nextCoins, rotationCheckedIn: [...rotationCheckedIn, id] });
      saveLocal(nextCoins, games);
      toast(reward > 0 ? `+${reward} — checked in ${game.title}` : `Checked in ${game.title}`, Coins);
      return;
    }
    if (!supabase) return;
    const { data, error } = await supabase
      .rpc("rotation_checkin", { p_game: id })
      .single();
    if (error) {
      set({ error: error.message });
      return;
    }
    const row = data as { coins: number; awarded: number } | null;
    const awarded = row?.awarded ?? reward;
    set({
      coins: row?.coins ?? coins,
      rotationCheckedIn: [...get().rotationCheckedIn, id],
    });
    toast(awarded > 0 ? `+${awarded} — checked in ${game.title}` : `Checked in ${game.title}`, Coins);
  },

  // Claim the starter vouchers on entering the Getting Started checklist.
  // Optimistic; the server (claim_onboarding_vouchers) is the same guarded
  // exactly-once grant complete_onboarding keeps as its compat path — the two
  // are mutually exclusive on onboarding_vouchers_granted_at.
  claimOnboardingVouchers: async () => {
    const { cloud, onboardingVouchersPending, onboardingVouchersGrantedAt, onboardingVouchers, vouchers } = get();
    if (!cloud || !supabase) return; // guests never have a pending tutorial
    if (!onboardingVouchersPending || onboardingVouchersGrantedAt != null) return;
    set({
      onboardingVouchersGrantedAt: Date.now(),
      vouchers: vouchers + onboardingVouchers,
    });
    if (onboardingVouchers > 0) {
      const plural = onboardingVouchers === 1 ? "" : "s";
      toast(`${onboardingVouchers} free voucher${plural} added to your wallet`, Ticket);
    }
    const { data, error } = await supabase.rpc("claim_onboarding_vouchers");
    if (error) {
      // Roll back the optimistic grant — the checklist copy adapts to 0 vouchers.
      set({ onboardingVouchersGrantedAt, vouchers, error: error.message });
      return;
    }
    // Server-authoritative balance wins (e.g. a concurrent grant elsewhere).
    if (typeof data === "number") set({ vouchers: data });
  },

  // Mark the onboarding tutorial finished/dismissed. Optimistic locally; the
  // server stamps onboarding_completed_at so it stays done across devices.
  completeOnboarding: async () => {
    if (get().onboardingCompletedAt != null) return;
    const { onboardingVouchersPending, onboardingVouchersGrantedAt, onboardingVouchers, vouchers, cloud } = get();
    // Compat grant, mirroring the server exactly: only a skip that never
    // reached the checklist (pending, never claimed) still earns the starter
    // vouchers here.
    const compatGrant = onboardingVouchersPending && onboardingVouchersGrantedAt == null;
    set({
      onboardingCompletedAt: Date.now(),
      vouchers: compatGrant ? vouchers + onboardingVouchers : vouchers,
      onboardingVouchersGrantedAt: compatGrant ? Date.now() : onboardingVouchersGrantedAt,
      onboardingVouchersPending: false,
    });
    if (cloud && supabase) {
      const { error } = await supabase.rpc("complete_onboarding");
      if (error) set({ error: error.message });
    }
  },

  // Reassign a playing game to a different Now Playing slot. slotId null = a
  // general slot; otherwise a targeted slot the game fits. Used to shift a short
  // game out of a general slot into a matching targeted one, freeing the general.
  moveGameToSlot: async (id, slotId) => {
    const { cloud, games, coins, myTargetedSlots } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing" || (game.slotId ?? null) === slotId) return;
    const target = slotId == null ? null : myTargetedSlots.find((s) => s.id === slotId);
    // Replay slots are entered only via the replay action (from a finished game),
    // never a manual move of a playing game.
    if (target && target.definition.kind === "replay") return;
    const slotName = slotId == null ? "general" : (target?.definition.name ?? "slot");

    // A linked family shares one slot, so the whole playing unit moves together.
    // Moving into a focus slot also leaves the Rotation lane (the game now holds a
    // real slot), mirroring move_game_to_slot.
    const unit = occupantKey(game);
    const moveUnit = (gs: Game[]) =>
      gs.map((g) =>
        g.status === "playing" && occupantKey(g) === unit
          ? { ...g, slotId, inRotation: false }
          : g,
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

  // Upload a custom cover for the family's focused card. Cloud-only, like
  // compilation covers (the blob lives in the covers bucket; local mode has
  // nowhere to put it). Mirrors setCompilationParentImage.
  setFamilyCoverImage: async (familyId, file) => {
    const { cloud, userId, games } = get();
    if (!cloud || !supabase || !userId) return;
    if (!games.some((g) => g.familyId === familyId)) return;
    try {
      const blob = await downscaleImage(file, 1000);
      const path = `${userId}/family-${familyId}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("covers")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("covers").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase.rpc("set_family_cover", {
        p_family: familyId,
        p_image: url,
        p_cover_game: null,
      });
      if (dbErr) throw dbErr;
      set({
        games: get().games.map((g) =>
          g.familyId === familyId ? { ...g, familyImage: url, familyCoverGameId: null } : g,
        ),
      });
      toast("Family cover updated", ImagePlus);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Couldn't update that cover." });
    }
  },

  // Point the family's focused card at a member edition's live cover (null =
  // back to automatic). Optimistic + rollback, like setFamilyName but via the
  // atomic RPC so all member rows move together and one audit row is logged.
  setFamilyCoverGame: async (familyId, gameId) => {
    const { cloud, games, coins } = get();
    const members = games.filter((g) => g.familyId === familyId);
    if (members.length === 0) return;
    if (gameId != null && !members.some((g) => g.id === gameId)) return;
    const prev = games;
    const next = games.map((g) =>
      g.familyId === familyId ? { ...g, familyImage: undefined, familyCoverGameId: gameId } : g,
    );
    set({ games: next });
    if (!cloud) {
      saveLocal(coins, next);
      toast("Family cover updated", ImagePlus);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("set_family_cover", {
      p_family: familyId,
      p_image: null,
      p_cover_game: gameId,
    });
    if (error) {
      set({ games: prev, error: error.message });
      return;
    }
    toast("Family cover updated", ImagePlus);
  },

  // Clear both the custom upload and the member pointer — back to automatic
  // (the representative edition's cover). Mirrors clearCompilationParentImage.
  clearFamilyCover: async (familyId) => {
    const { cloud, userId, games, coins } = get();
    const members = games.filter((g) => g.familyId === familyId);
    if (!members.some((g) => g.familyImage || g.familyCoverGameId)) return;
    const patch = (gs: Game[]) =>
      gs.map((g) =>
        g.familyId === familyId ? { ...g, familyImage: undefined, familyCoverGameId: null } : g,
      );
    if (!cloud) {
      const next = patch(games);
      set({ games: next });
      saveLocal(coins, next);
      toast("Family cover removed", Trash2);
      return;
    }
    if (!supabase || !userId) return;
    // Best-effort blob cleanup; the row update is what matters.
    await supabase.storage.from("covers").remove([`${userId}/family-${familyId}.jpg`]);
    const { error } = await supabase.rpc("set_family_cover", {
      p_family: familyId,
      p_image: null,
      p_cover_game: null,
    });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: patch(get().games) });
    toast("Family cover removed", Trash2);
  },

  // Toggle a family between the focused single card (default) and separate
  // per-edition cards. Optimistic + rollback via the atomic RPC.
  setFamilySplit: async (familyId, split) => {
    const { cloud, games, coins } = get();
    if (!games.some((g) => g.familyId === familyId)) return;
    const prev = games;
    const next = games.map((g) => (g.familyId === familyId ? { ...g, familySplit: split } : g));
    set({ games: next });
    if (!cloud) {
      saveLocal(coins, next);
      toast(split ? "Showing separate edition cards" : "Collapsed into one family card", Layers);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.rpc("set_family_split", {
      p_family: familyId,
      p_split: split,
    });
    if (error) {
      set({ games: prev, error: error.message });
      return;
    }
    toast(split ? "Showing separate edition cards" : "Collapsed into one family card", Layers);
  },

  // Set or clear a game's story-lock prerequisite. Immediate write like
  // setFamilyName (owner RLS column update; the DB BEFORE-trigger re-validates
  // ownership and rejects cycles authoritatively). Optimistic + rollback.
  setPrerequisite: async (id, prereqId) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game) return;
    if ((game.prerequisiteGameId ?? null) === prereqId) return;
    if (prereqId != null) {
      if (!games.some((g) => g.id === prereqId)) return;
      // Mirror the server trigger so the picker's guard can't be raced.
      if (wouldCreateCycle(games, id, prereqId)) {
        toast("That would create a loop — those games already require each other", Lock);
        return;
      }
    }
    const prev = games;
    const next = games.map((g) => (g.id === id ? { ...g, prerequisiteGameId: prereqId } : g));
    set({ games: next });
    const done = () => {
      const preTitle = prereqId ? games.find((g) => g.id === prereqId)?.title : null;
      toast(preTitle ? `Locked behind ${preTitle}` : "Prerequisite removed", preTitle ? Lock : Check);
    };
    if (!cloud) {
      saveLocal(coins, next);
      done();
      return;
    }
    if (!supabase) return;
    const { error } = await supabase
      .from("games")
      .update({ prerequisite_game_id: prereqId })
      .eq("id", id);
    if (error) {
      set({ games: prev });
      if (error.message.includes("PREREQUISITE_CYCLE")) {
        toast("That would create a loop — those games already require each other", Lock);
      } else {
        set({ error: error.message });
      }
      return;
    }
    done();
  },

  logPlaytime: async (id, hours, platform, format) => {
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
      .rpc("log_playtime", {
        p_game: id,
        p_hours: hours,
        p_platform: platform ?? null,
        p_format: format ?? null,
      })
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
      .select("platform, format, hours, created_at")
      .eq("game_id", id)
      .order("created_at", { ascending: false });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      platform: typeof r.platform === "string" ? r.platform : null,
      format: r.format === "physical" || r.format === "digital" ? r.format : null,
      hours: typeof r.hours === "number" ? r.hours : 0,
      createdAt: r.created_at ? Date.parse(r.created_at as string) : 0,
    }));
  },

  // Game Milestones: user-curated timeline rows, CRUD'd directly under owner
  // RLS (like setFinishTag — no RPCs). Cloud-only, component-local state:
  // nothing here touches the global games array.
  fetchGameMilestones: async (gameId) => {
    if (!supabase || !get().cloud) return [];
    const { data, error } = await supabase
      .from("game_milestones")
      .select("id, game_id, kind, occurred_on, source, created_at")
      .eq("game_id", gameId)
      .order("occurred_on", { ascending: true });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return sortMilestones(
      ((data ?? []) as Record<string, unknown>[])
        .map(coerceMilestoneRow)
        .filter((m): m is GameMilestone => m != null),
    );
  },

  addGameMilestone: async (gameId, kind, occurredOn) => {
    const { cloud, userId } = get();
    if (!supabase || !cloud || !userId) return null;
    const { data, error } = await supabase
      .from("game_milestones")
      .insert({ user_id: userId, game_id: gameId, kind, occurred_on: occurredOn })
      .select("id, game_id, kind, occurred_on, source, created_at")
      .single();
    if (error) {
      set({ error: error.message });
      return null;
    }
    return coerceMilestoneRow((data ?? {}) as Record<string, unknown>);
  },

  updateGameMilestone: async (id, occurredOn) => {
    if (!supabase || !get().cloud) return false;
    const { error } = await supabase
      .from("game_milestones")
      .update({ occurred_on: occurredOn })
      .eq("id", id);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  removeGameMilestone: async (id) => {
    if (!supabase || !get().cloud) return false;
    const { error } = await supabase.from("game_milestones").delete().eq("id", id);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  // Set one version's logged hours (or the Unspecified bucket when platform is
  // null). The RPC logs an attributed correction and returns the game's new grand
  // total, which we mirror into the local games state. Cloud only.
  setPlatformPlaytime: async (id, platform, format, hours) => {
    if (!supabase || !get().cloud) return;
    const safe = Math.max(0, Math.round(hours * 60) / 60); // ≥0, snap to the minute
    const { data, error } = await supabase.rpc("set_platform_playtime", {
      p_game: id,
      p_platform: platform,
      p_format: format,
      p_hours: safe,
    });
    if (error) {
      set({ error: error.message });
      return;
    }
    const total = typeof data === "number" ? data : Number(data);
    if (Number.isFinite(total)) {
      set({ games: get().games.map((g) => (g.id === id ? { ...g, playedHours: total } : g)) });
    }
  },

  // Replace a game's list of copies (the platforms you own it on + what each
  // cost). Purely informational metadata — never touches coins or status.
  setGameCopies: async (id, rawCopies) => {
    const { cloud, games, coins, platformList } = get();
    const game = games.find((g) => g.id === id);
    if (!game) return;
    // Controlled taxonomy, mirroring editGame: keep only copies whose platform is
    // on the master list (canonicalized). Callers pass dropdown values, so this
    // only ever filters a stale/blank one — and keeps the games trigger happy.
    const copies = rawCopies
      .map((c) => {
        const [p] = canonicalizeTerms([c.platform], platformList);
        return p ? { ...c, platform: p } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
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

  // Hide a game from visitors (or unhide it). Owner-only state — it never
  // touches the economy, your own boards, or your stats; the cloud filters it
  // out of player_library for visitors, and the trigger logs every flip.
  setGamePrivate: async (id, value) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game || (game.private ?? false) === value) return;
    const next = games.map((g) => (g.id === id ? { ...g, private: value } : g));
    set({ games: next });

    if (!cloud) {
      saveLocal(coins, next);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.from("games").update({ private: value }).eq("id", id);
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
    const { cloud, games, coins, platformList } = get();
    const game = games.find((g) => g.id === id);
    if (!game) return;

    const title = patch.title.trim() || game.title;
    const released = patch.released?.trim() ? patch.released : undefined;
    const hours = Number.isFinite(patch.hours) && (patch.hours ?? 0) >= 0 ? patch.hours : undefined;
    // Only touch played_hours when the caller provides it (offline). The cloud
    // editor manages playtime per-version, so it leaves this undefined.
    const editsPlayed = patch.playedHours !== undefined;
    const playedHours = editsPlayed
      ? Math.max(0, Math.round((patch.playedHours as number) * 60) / 60) // ≥0, snap to the minute
      : (game.playedHours ?? 0);
    // Controlled taxonomy: keep only copies whose platform is on the master list
    // (canonicalized). The copy editor is a dropdown, so this only ever filters a
    // stale/blank value — it never drops a valid one — and keeps the games trigger happy.
    const copies = patch.copies
      .map((c) => {
        const [p] = canonicalizeTerms([c.platform], platformList);
        return p ? { ...c, platform: p } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
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
        // Skip played_hours unless the caller edited it (offline) — the cloud
        // editor writes playtime through set_platform_playtime, and re-writing the
        // same total here would log a spurious zero-delta event.
        ...(editsPlayed ? { played_hours: playedHours } : {}),
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
      .select("id, title, image, platforms, genres, developers, released, hours, screenshots, is_live_service")
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
      screenshots: Array.isArray(r.screenshots) ? (r.screenshots as string[]) : [],
      isLiveService: Boolean(r.is_live_service),
    };
  },

  // The approved screenshots for a catalog game, looked up by catalog id (exact)
  // or RAWG id. Used by the gallery in the Add/Edit views. Cloud-only.
  fetchGameScreenshots: async ({ rawgId, catalogId }) => {
    if (!supabase || !get().cloud || (!rawgId && !catalogId)) return [];
    let q = supabase.from("catalog_games").select("screenshots");
    // Prefer the exact catalog row; otherwise fall back to the RAWG id.
    q = catalogId ? q.eq("id", catalogId) : q.eq("rawg_id", rawgId as number);
    const { data } = await q.maybeSingle();
    const shots = (data as Record<string, unknown> | null)?.screenshots;
    return Array.isArray(shots) ? (shots as string[]) : [];
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
      .select("id, rawg_id, title, image, platforms, genres, developers, released, hours, is_live_service")
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
        ongoing: Boolean(r.is_live_service),
      }));
  },

  // Batch-fetch catalog overrides for a set of RAWG ids, so search results can be
  // enriched with approved edits (title, cover, etc.) before they're shown.
  fetchCatalogOverrides: async (rawgIds) => {
    const out: Record<number, CatalogOverride> = {};
    if (!supabase || !get().cloud || rawgIds.length === 0) return out;
    const { data } = await supabase
      .from("catalog_games")
      .select("id, rawg_id, title, image, platforms, genres, developers, released, hours, screenshots, is_live_service")
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
        screenshots: Array.isArray(r.screenshots) ? (r.screenshots as string[]) : [],
        isLiveService: Boolean(r.is_live_service),
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
    const row = {
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
      screenshots: p.screenshots,
      is_live_service: p.isLiveService,
      before: input.before,
    };

    // Moderators bypass the review queue: file the submission, then immediately
    // approve it so the change applies to the shared catalog and every copy at
    // once (the approve RPC pays no reward for a self-review). Everyone else's
    // suggestion waits for a moderator.
    if (get().can("submissions.games.moderate")) {
      const { data, error } = await supabase
        .from("game_submissions")
        .insert(row)
        .select("id")
        .single();
      if (error) {
        set({ error: error.message });
        return false;
      }
      const { error: approveErr } = await supabase.rpc("approve_game_submission", {
        p_id: (data as { id: string }).id,
        p_note: null,
        p_fields: null,
      });
      if (approveErr) {
        set({ error: approveErr.message });
        return false;
      }
      // Reload our own library so the cascaded fields (title, cover, length, …)
      // show immediately on our copies.
      const { data: lib } = await supabase.rpc("player_library", { p_user: userId });
      if (lib) set({ games: (lib as GameRow[]).map(rowToGame) });
      toast("Saved — your changes are live for everyone.", Trophy);
      void get().refreshSubmissionCount();
      return true;
    }

    const { error } = await supabase.from("game_submissions").insert(row);
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
        "id, kind, title, image, platforms, genres, developers, released, hours, screenshots, is_live_service, before, status, review_note, reward, approved_fields, created_at, reviewed_at",
      )
      .eq("submitter", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as MySubmissionRow[]).map(rowToMySubmission);
  },

  // Retract one of your own still-pending game contributions. The RPC soft-deletes
  // it (history preserved) and is scoped server-side to the caller's pending rows.
  withdrawGameSubmission: async (id) => {
    const { cloud, userId } = get();
    if (!supabase || !cloud || !userId) return false;
    const { data, error } = await supabase.rpc("withdraw_game_submission", { p_id: id });
    if (error) {
      set({ error: error.message });
      return false;
    }
    if (!data) return false; // already decided/removed
    toast("Contribution withdrawn.", Trash2);
    return true;
  },

  // Retract one of your own still-pending compilation contributions (mirrors the
  // game version; a pending compilation has no published template to clean up).
  withdrawCompilationSubmission: async (id) => {
    const { cloud, userId } = get();
    if (!supabase || !cloud || !userId) return false;
    const { data, error } = await supabase.rpc("withdraw_compilation_submission", { p_id: id });
    if (error) {
      set({ error: error.message });
      return false;
    }
    if (!data) return false;
    toast("Contribution withdrawn.", Trash2);
    return true;
  },

  // Admin: the pending moderation queue with diff baselines.
  fetchGameSubmissions: async () => {
    if (!supabase || !get().can("submissions.games.moderate")) return [];
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
    const canCount =
      get().can("submissions.games.moderate") || get().can("submissions.compilations.moderate");
    if (!supabase || !get().cloud || !canCount) {
      set({ submissionCount: 0 });
      return;
    }
    // Server-side count that excludes hidden (test/bot) accounts.
    const { data, error } = await supabase.rpc("pending_submission_count");
    if (!error) set({ submissionCount: typeof data === "number" ? data : 0 });
  },

  // File a report against a user or a custom cover. Cloud-only (there are no other
  // players to report offline). Server-authoritative + reporter-anonymous.
  submitReport: async ({ reportedUser, kind, reason, details, gameId }) => {
    if (!supabase || !get().cloud) {
      toast("Sign in to report.", AlertTriangle);
      return false;
    }
    const { error } = await supabase.rpc("submit_report", {
      p_reported_user: reportedUser,
      p_kind: kind,
      p_reason: reason,
      p_details: details ?? null,
      p_game: gameId ?? null,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Report sent to our moderators. Thanks for keeping the community safe.", Flag);
    return true;
  },

  // Admin: the moderation queue (optionally filtered by status). reports.moderate.
  fetchReports: async (status = "open") => {
    if (!supabase || !get().can("reports.moderate")) return [];
    const { data, error } = await supabase.rpc("list_reports", { p_status: status });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as ReportRow[]).map(rowToReport);
  },

  // Admin: resolve a report. On a successful strip, best-effort delete the orphaned
  // cover blob too (the RPC already reset games.image to the default). Refreshes the
  // open-report badge.
  resolveReport: async (report, action, note) => {
    if (!supabase || !get().can("reports.moderate")) return false;
    const { error } = await supabase.rpc("resolve_report", {
      p_id: report.id,
      p_action: action,
      p_note: note ?? null,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    if (action === "strip" && report.gameId) {
      // Best-effort: the covers_delete_moderated policy lets a moderator remove it.
      await supabase.storage
        .from("covers")
        .remove([`${report.reportedUser}/${report.gameId}.jpg`]);
    }
    void get().refreshReportCount();
    toast(
      action === "dismiss"
        ? "Report dismissed."
        : action === "strip"
          ? "Custom cover removed."
          : "Account suspended.",
      action === "dismiss" ? Eye : action === "strip" ? ImagePlus : Lock,
    );
    return true;
  },

  // Admin: how many reports are open (drives the sidebar badge). 0 for non-mods.
  refreshReportCount: async () => {
    if (!supabase || !get().cloud || !get().can("reports.moderate")) {
      set({ reportCount: 0 });
      return;
    }
    const { data, error } = await supabase.rpc("pending_report_count");
    if (!error) set({ reportCount: typeof data === "number" ? data : 0 });
  },

  // Admin: approve a submission — commits the master record, cascades to every
  // copy, rewards the submitter, and notifies them (all server-side).
  approveSubmission: async (id, note, fields) => {
    if (!supabase || !get().can("submissions.games.moderate")) return false;
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
    if (!supabase || !get().can("submissions.games.moderate")) return false;
    const { error } = await supabase.rpc("reject_game_submission", { p_id: id, p_note: note });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Submission rejected.", Undo2);
    void get().refreshSubmissionCount();
    return true;
  },

  // Search the shared, approved compilation templates by title (cloud only).
  searchCompilationTemplates: async (query) => {
    const q = query.trim();
    if (!supabase || !get().cloud || q.length < 2) return [];
    const { data } = await supabase
      .from("compilation_templates")
      .select("id, title, platform, format, games, created_by, created_at")
      .ilike("title", `%${q}%`)
      .limit(8);
    return ((data ?? []) as CompilationTemplateRow[]).map(rowToCompilationTemplate);
  },

  // Submit a compilation (new template or an edit to one) into the moderation
  // queue. Mirrors submitGameSubmission; the approve RPC writes the shared template.
  submitCompilationTemplate: async (input) => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) {
      toast("Sign in to suggest compilations.", Lightbulb);
      return { ok: false };
    }
    const games = input.games.map((g) => ({
      name: g.name,
      hours: g.hours ?? null,
      image: g.image ?? null,
      rawg_id: g.rawgId ?? null,
      catalog_id: g.catalogId ?? null,
      genres: g.genres ?? [],
      released: g.released ?? null,
      metacritic: g.metacritic ?? null,
      platforms: g.platforms ?? [],
      developers: g.developers ?? [],
      esrb: g.esrb ?? null,
    }));
    // A normalized signature so the server can block a duplicate that's already
    // pending (which the client can't see — RLS hides others' submissions).
    // Platform-agnostic: the same bundle is one compilation regardless of platform.
    const hash = templateSignature({
      title: input.title,
      games: input.games,
    });
    const { error } = await supabase.rpc("submit_compilation_template", {
      p_kind: input.kind,
      p_template_id: input.kind === "edit" ? (input.templateId ?? null) : null,
      p_title: input.title.trim(),
      p_platform: input.platform?.trim() || null,
      p_format: input.format ?? null,
      p_games: games,
      p_before: input.kind === "edit" ? (input.before ?? null) : null,
      p_hash: hash,
    });
    if (error) {
      if (error.message.includes("DUPLICATE_PENDING")) {
        toast("An identical compilation is already awaiting review.", Lightbulb);
        return { ok: false, duplicate: true };
      }
      set({ error: error.message });
      return { ok: false };
    }
    toast("Thanks! Your compilation is awaiting review.", Lightbulb);
    return { ok: true };
  },

  // The caller's own compilation submissions, newest first.
  fetchMyCompilationSubmissions: async () => {
    const { cloud, userId } = get();
    if (!supabase || !cloud || !userId) return [];
    const { data, error } = await supabase
      .from("compilation_submissions")
      .select(
        "id, kind, template_id, title, platform, format, games, before, status, review_note, reward, created_at, reviewed_at",
      )
      .eq("submitter", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as CompilationSubmissionRow[]).map(rowToCompilationSubmission);
  },

  // Admin: the compilation moderation queue (with the edit diff baseline).
  fetchCompilationSubmissions: async () => {
    if (!supabase || !get().can("submissions.compilations.moderate")) return [];
    const { data, error } = await supabase.rpc("list_compilation_submissions");
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as CompilationSubmissionRow[]).map(rowToCompilationSubmission);
  },

  // Admin: approve a compilation submission — writes the shared template, rewards
  // + notifies the submitter (all server-side).
  approveCompilationSubmission: async (id, note) => {
    if (!supabase || !get().can("submissions.compilations.moderate")) return false;
    const { error } = await supabase.rpc("approve_compilation_submission", {
      p_id: id,
      p_note: note,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Approved — the compilation is now shared.", Trophy);
    void get().refreshSubmissionCount();
    return true;
  },

  // Admin: reject a compilation submission and notify the submitter.
  rejectCompilationSubmission: async (id, note) => {
    if (!supabase || !get().can("submissions.compilations.moderate")) return false;
    const { error } = await supabase.rpc("reject_compilation_submission", { p_id: id, p_note: note });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Submission rejected.", Undo2);
    void get().refreshSubmissionCount();
    return true;
  },

  // Admin: soft-delete a game submission (removes it from the active queue; the
  // already-approved catalog change, if any, is left in place).
  deleteSubmission: async (id) => {
    if (!supabase || !get().can("submissions.games.moderate")) return false;
    const { error } = await supabase.rpc("delete_game_submission", { p_id: id });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Submission deleted.", Trash2);
    void get().refreshSubmissionCount();
    return true;
  },

  // Admin: roll an approved catalog EDIT back to its pre-approval values (restores
  // the `before` snapshot on the master record + every copy). The submission stays
  // in the log marked reverted; reward coins are not clawed back. Fields a later
  // edit changed are left alone — the RPC reports them so we can say so.
  revertSubmission: async (id) => {
    if (!supabase || !get().can("submissions.games.moderate")) return false;
    const { data, error } = await supabase.rpc("revert_game_submission", { p_id: id });
    if (error) {
      set({ error: error.message });
      return false;
    }
    const result = (data ?? {}) as { reverted?: string[]; skipped?: string[] };
    toast(revertResultMessage(result.reverted ?? [], result.skipped ?? []), Undo2);
    void get().refreshSubmissionCount();
    return true;
  },

  // Admin: soft-delete a compilation submission AND remove the shared template it
  // published (clears a duplicate from the autocomplete). History survives.
  deleteCompilationSubmission: async (id) => {
    if (!supabase || !get().can("submissions.compilations.moderate")) return false;
    const { error } = await supabase.rpc("delete_compilation_submission", { p_id: id });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Submission deleted.", Trash2);
    void get().refreshSubmissionCount();
    return true;
  },

  // Admin: every community catalog entry (rawg_id null) with how many libraries link
  // to it. Admin/cloud only; returns [] otherwise.
  fetchCommunityCatalog: async () => {
    if (!supabase || !get().can("catalog.manage")) return [];
    const { data, error } = await supabase.rpc("list_community_catalog");
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as CommunityCatalogRow[]).map(rowToCommunityCatalog);
  },

  // Admin: directly edit a community catalog entry (bypassing the suggestion queue).
  // The RPC writes the master row, cascades to every copy, and logs an audit row.
  // Patch our own matching copies in local state so the change shows immediately.
  adminEditCatalogGame: async (id, fields) => {
    if (!supabase || !get().can("catalog.manage")) return false;
    const f = normalizeCatalogFields(fields);
    const { error } = await supabase.rpc("admin_edit_catalog_game", {
      p_id: id,
      p_title: f.title,
      p_image: f.image || null,
      p_platforms: f.platforms,
      p_genres: f.genres,
      p_developers: f.developers,
      p_released: f.released || null,
      p_hours: f.hours,
      p_screenshots: f.screenshots,
      p_is_live_service: f.isLiveService,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({
      games: get().games.map((g) =>
        g.catalogId === id
          ? {
              ...g,
              title: f.title,
              platforms: f.platforms,
              genres: f.genres,
              developers: f.developers,
              released: f.released || undefined,
              hours: f.hours ?? undefined,
              // Match the server cascade: only refresh the cover when the user hadn't
              // set a custom one (image still equals the stock art).
              image: g.image == null || g.image === g.stockImage ? f.image || undefined : g.image,
              stockImage: f.image || undefined,
              // Live-service flag cascades onto every non-playing copy (the server
              // skips only 'playing' copies, whose ongoing flag is lane-driven).
              ongoing: g.status === "playing" ? g.ongoing : f.isLiveService,
            }
          : g,
      ),
    });
    toast("Catalog entry updated.", Pencil);
    return true;
  },

  // Admin: delete a community catalog entry. The RPC refuses while any library still
  // links to it (the error message says how many), so no owned game is orphaned.
  adminDeleteCatalogGame: async (id) => {
    if (!supabase || !get().can("catalog.manage")) return false;
    const { error } = await supabase.rpc("admin_delete_catalog_game", { p_id: id });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Catalog entry deleted.", Trash2);
    return true;
  },

  // Admin: list every shared compilation template for the catalog manager.
  fetchCompilationCatalog: async () => {
    if (!supabase || !get().can("catalog.manage")) return [];
    const { data, error } = await supabase.rpc("list_compilation_templates");
    if (error) {
      set({ error: error.message });
      return [];
    }
    // The list RPC returns the core fields (+ the moderator parent link);
    // platform/format/created_by aren't part of a shared template, so fill them
    // as null for the shared mapper.
    return (
      (data ?? []) as {
        id: string;
        title: string;
        games: unknown;
        created_at: string;
        parent_catalog_id: string | null;
        parent_title: string | null;
      }[]
    ).map((r) =>
      rowToCompilationTemplate({
        ...r,
        platform: null,
        format: null,
        created_by: null,
      } as CompilationTemplateRow),
    );
  },

  ensureCatalogParent: async ({ rawgId, title, image, released }) => {
    if (!supabase || !get().can("catalog.manage")) return null;
    const { data, error } = await supabase.rpc("admin_ensure_catalog_game", {
      p_rawg_id: rawgId,
      p_title: title,
      p_image: image ?? null,
      p_released: released || null,
    });
    if (error) {
      set({ error: error.message });
      return null;
    }
    return (data as string | null) ?? null;
  },

  // Admin: directly overwrite a shared compilation template's title + games
  // (bypassing the suggestion queue); the RPC logs an audit row.
  adminEditCompilationTemplate: async (id, title, games, parentCatalogId) => {
    if (!supabase || !get().can("catalog.manage")) return false;
    const payload = games.map((g) => ({
      name: g.name,
      hours: g.hours ?? null,
      image: g.image ?? null,
      rawg_id: g.rawgId ?? null,
      catalog_id: g.catalogId ?? null,
      genres: g.genres ?? [],
      released: g.released ?? null,
      metacritic: g.metacritic ?? null,
      platforms: g.platforms ?? [],
      developers: g.developers ?? [],
      esrb: g.esrb ?? null,
    }));
    const { error } = await supabase.rpc("admin_edit_compilation_template", {
      p_id: id,
      p_title: title.trim(),
      p_games: payload,
      p_parent_catalog: parentCatalogId,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    // The parent-template lookup mirrors the shared table — refresh it so
    // "Expand compilation" affordances reflect the new link right away.
    void get().refreshParentTemplates();
    toast("Compilation updated.", Pencil);
    return true;
  },

  // Admin: delete a shared compilation template (safe — templates aren't owned;
  // they only seed personal compilations at add-time).
  adminDeleteCompilationTemplate: async (id) => {
    if (!supabase || !get().can("catalog.manage")) return false;
    const { error } = await supabase.rpc("admin_delete_compilation_template", { p_id: id });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Compilation deleted.", Trash2);
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
    const { cloud, games, coins, replayBonusPct, completionBonusPct, myTargetedSlots } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing") return;
    // A linked edition only pays full the first time its family is cleared, and a
    // resumed game (pulled back for free, already finished once) also pays the
    // smaller bonus — so a free replay can't farm a full bounty.
    const replay =
      isReplayFinish(games, game) ||
      isReplaySlot(game.slotId, myTargetedSlots) ||
      game.resumed === true;
    // Completing a Completionist-lane game pays its base reward PLUS the Completion
    // Bonus (the base is the full bounty for a first clear, or 0 if already finished).
    const completion = game.completionist === true;
    // The Finished-board tag this concludes as (mirrors apply_finish): a completion
    // earns Completed; any other finish defaults to Beaten but keeps a prior tag.
    const finishTag = autoFinishTag({ completion, existing: game.finishTag ?? null });
    // A plain Focus finish gets the post-game routing prompt (keep / grind to 100% /
    // convert to endless). Replay/Completionist/Rotation finishes route directly.
    const wasFocusFinish = !completion && !game.resumed && !game.inRotation;
    // Bounty mirrors the buy price: a compilation child earns off its bundle's
    // release date too, so fee and payout stay in the same era.
    const fullReward = computeFormula(withBundleReleased(game, get().compilations), get().economy.bounty);
    const reward = completion
      ? computeCompletionReward(replay, fullReward, completionBonusPct)
      : computeFinishReward(replay, fullReward, replayBonusPct);

    // Fire the finish confirmation as an Undo toast: clicking it reverts the finish
    // (restoring the prior lane/flags and rolling back the coins). `prevGame` is the
    // pre-mutation snapshot; `undoId` is the server's action_undos row (null offline).
    const finishToast = (amount: number, undoId: string | null) => {
      const undo: PendingUndo = {
        id: undoId,
        gameId: id,
        action: "finish",
        label: game.title,
        prevGame: game,
        coinsDelta: amount,
      };
      toastAction(
        completion
          ? `Completed ${game.title} · +${amount}`
          : replay
            ? `Replay clear · ${game.title} · +${amount}`
            : `Finished ${game.title} · +${amount}`,
        { label: "Undo", onAction: () => void get().undoAction(undo) },
        Coins,
      );
    };

    if (!cloud) {
      const next = games.map((g) =>
        g.id === id
          ? { ...g, status: "finished" as const, finishedAt: Date.now(), reward, slotId: null, resumed: false, inRotation: false, completionist: false, finishTag }
          : g,
      );
      const nc = coins + reward;
      const led = [
        localEvent(replay && !completion ? "replay_bonus" : completion ? "completion_bonus" : "bounty", reward, nc, game.title),
        ...get().ledger,
      ];
      set({ games: next, coins: nc, ledger: led, pendingRouteId: wasFocusFinish ? id : null });
      saveLocal(nc, next, led);
      finishToast(reward, null);
      return;
    }
    if (!supabase) return;

    // The server re-decides replay vs. first-clear (so the reward can't be farmed)
    // and adds the Completion Bonus when the game is in the Completionist lane.
    const { data, error } = await supabase
      .rpc("apply_finish", {
        p_game: id,
        p_full_reward: fullReward,
        p_replay_reward: computeReplayBonus(fullReward, replayBonusPct),
        p_completion_reward: completion ? computeCompletionBonus(fullReward, completionBonusPct) : 0,
      })
      .single();
    if (error) {
      set({ error: error.message });
      return;
    }
    const { coins: newCoins, reward: awarded, undo_id: undoId } = data as {
      coins: number;
      reward: number;
      replay: boolean;
      undo_id: string;
    };
    set({
      coins: newCoins,
      pendingRouteId: wasFocusFinish ? id : null,
      games: games.map((g) =>
        g.id === id
          ? { ...g, status: "finished", finishedAt: Date.now(), reward: awarded, slotId: null, resumed: false, inRotation: false, completionist: false, finishTag }
          : g,
      ),
    });
    finishToast(awarded, undoId);
  },

  undoAction: async (undo) => {
    const { cloud, coins } = get();
    // Restore the pre-action game snapshot (its exact prior lane/flags).
    const restore = () => get().games.map((g) => (g.id === undo.gameId ? undo.prevGame : g));
    const verb =
      undo.action === "retire"
        ? "Undid retiring"
        : undo.action === "convert_endless"
          ? "Undid converting"
          : "Undid finishing";

    if (!cloud) {
      const nc = coins - undo.coinsDelta;
      const next = restore();
      // Log the rollback as its own ledger row, leaving the original award intact.
      const led =
        undo.coinsDelta !== 0
          ? [localEvent("undo_finish", -undo.coinsDelta, nc, undo.prevGame.title), ...get().ledger]
          : get().ledger;
      set({
        games: next,
        coins: nc,
        ledger: led,
        pendingRouteId: get().pendingRouteId === undo.gameId ? null : get().pendingRouteId,
      });
      saveLocal(nc, next, led);
      toast(`${verb} ${undo.label}`, Undo2);
      return;
    }
    if (!supabase || !undo.id) return;
    // Server-authoritative reversal: restores the game, deducts the awarded coins,
    // and retracts the activity-feed post. Refuses if the game changed since.
    const { data, error } = await supabase.rpc("undo_action", { p_undo: undo.id }).single();
    if (error) {
      toast("Couldn't undo — the game changed", AlertTriangle);
      return;
    }
    const { coins: newCoins } = data as { coins: number };
    set({
      coins: newCoins,
      games: restore(),
      pendingRouteId: get().pendingRouteId === undo.gameId ? null : get().pendingRouteId,
    });
    toast(`${verb} ${undo.label}`, Undo2);
  },

  // "Shelve It": drop a game from Now Playing back to the backlog. You're
  // refunded shelveRefundPct% of what you paid for it; the rest is forfeited.
  abandonGame: async (id) => {
    const { cloud, games, coins, shelveRefundPct } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing") return;

    if (!cloud) {
      const base =
        game.pricePaid ??
        computeFormula(withBundleReleased(game, get().compilations), get().economy.price);
      const refund = computeShelveRefund(base, shelveRefundPct);
      const next = games.map((g) =>
        g.id === id
          ? {
              ...g,
              status: "backlog" as const,
              startedAt: undefined,
              pricePaid: undefined,
              slotId: null,
              inRotation: false,
            }
          : g,
      );
      const nc = coins + refund;
      const led = [localEvent("shelve_refund", refund, nc, game.title), ...get().ledger];
      set({ games: next, coins: nc, ledger: led });
      saveLocal(nc, next, led);
      toast(
        refund > 0 ? `Shelved ${game.title} · +${refund} refunded` : `Shelved ${game.title}`,
        refund > 0 ? Coins : Undo2,
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
      return { coinsIn: 0, coinsOut: 0, chartersIn: 0, chartersOut: 0, vouchersIn: 0, vouchersOut: 0 };
    }
    const d = data as {
      coins_in: number;
      coins_out: number;
      charters_in: number;
      charters_out: number;
      vouchers_in: number;
      vouchers_out: number;
    };
    return {
      coinsIn: Number(d.coins_in),
      coinsOut: Number(d.coins_out),
      chartersIn: Number(d.charters_in),
      chartersOut: Number(d.charters_out),
      vouchersIn: Number(d.vouchers_in ?? 0),
      vouchersOut: Number(d.vouchers_out ?? 0),
    };
  },

  removeGame: async (id) => {
    const { cloud, games, coins } = get();
    // A game inside a compilation can't be deleted on its own — the whole
    // compilation is deleted together (the UI hides Remove for these too).
    const target = games.find((g) => g.id === id);
    if (target?.compilationId) {
      toast("Delete the compilation to remove its games", Package);
      return;
    }
    // Dissolve a Game Family the deletion reduces to one member — a family of
    // one is meaningless and its survivor would keep the family marker forever.
    // The server enforces the same rule via the games_dissolve_orphan_family
    // trigger; this mirrors it offline and keeps the optimistic UI honest.
    const dissolve = (list: Game[]): Game[] => {
      if (!target?.familyId) return list;
      const remaining = list.filter((g) => g.familyId === target.familyId);
      if (remaining.length > 1) return list;
      return list.map((g) =>
        g.familyId === target.familyId
          ? {
              ...g,
              familyId: null,
              familyName: undefined,
              familyImage: undefined,
              familyCoverGameId: null,
              familySplit: false,
            }
          : g,
      );
    };
    if (!cloud) {
      const next = dissolve(games.filter((g) => g.id !== id));
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
    set({ games: dissolve(games.filter((g) => g.id !== id)) });
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

  submitIssue: async (
    title,
    description,
    kind,
    files = [],
    tags = [],
    priority = "medium",
    effort = "medium",
  ) => {
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
        effort,
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
    if (!supabase || !get().can("issues.moderate")) return false;
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

  editIssue: async (requestId, title, description, kind, tags, priority, effort) => {
    if (!supabase) return false;
    const { error } = await supabase.rpc("edit_feature_request", {
      p_id: requestId,
      p_title: title.trim(),
      p_description: description.trim(),
      p_kind: kind,
      p_tags: tags,
      p_priority: priority,
      p_effort: effort,
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

  // Refresh the newest page (called when the bell opens and by the background
  // badge poll). Resets pagination. Failures stay silent — this is a background
  // refresh, so a transient blip (e.g. an idle request that briefly lands as the
  // anon role) must not raise the global error banner; the next tick recovers.
  fetchNotifications: async () => {
    const { userId } = get();
    if (!supabase || !userId) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(NOTIF_PAGE);
    if (error) return;
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

  // --- Social: friends, requests, and the activity feed --------------------

  fetchFriends: async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("list_friends");
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ friends: ((data ?? []) as FriendRow[]).map(rowToFriend) });
  },

  fetchFriendRequests: async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("list_friend_requests");
    // Silent on failure — runs on the background badge poll; a transient blip must
    // not raise the global error banner.
    if (error) return;
    const reqs = ((data ?? []) as FriendRequestRow[]).map(rowToFriendRequest);
    set({
      friendRequests: reqs,
      friendRequestCount: reqs.filter((r) => r.direction === "incoming").length,
    });
  },

  searchUsers: async (query) => {
    if (!supabase) return [];
    const q = query.trim();
    if (!q) return [];
    const { data, error } = await supabase.rpc("search_users", { p_query: q });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as UserSearchRow[]).map(rowToUserSearchResult);
  },

  sendFriendRequest: async (userId) => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("send_friend_request", { p_addressee: userId });
    if (error) {
      set({ error: error.message });
      return null;
    }
    // The RPC returns the friendship row status ('pending' | 'accepted' | …); map it
    // to the caller-relative status the UI uses.
    const raw = data as string | null;
    const status: FriendshipStatus =
      raw === "accepted" ? "friends" : raw === "pending" ? "pending_out" : "none";
    if (status === "friends") {
      toast("You're now friends", PartyPopper);
      await get().fetchFriends();
    } else {
      toast("Friend request sent", UserPlus);
    }
    await get().fetchFriendRequests();
    return status;
  },

  respondFriendRequest: async (id, accept) => {
    if (!supabase) return false;
    const { data, error } = await supabase.rpc("respond_friend_request", {
      p_id: id,
      p_accept: accept,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    if (!data) return false;
    const remaining = get().friendRequests.filter((r) => r.id !== id);
    set({
      friendRequests: remaining,
      friendRequestCount: remaining.filter((r) => r.direction === "incoming").length,
    });
    if (accept) {
      toast("Friend added", UserCheck);
      await get().fetchFriends();
    } else {
      toast("Request declined", UserMinus);
    }
    return true;
  },

  cancelFriendRequest: async (id) => {
    if (!supabase) return false;
    const { data, error } = await supabase.rpc("cancel_friend_request", { p_id: id });
    if (error) {
      set({ error: error.message });
      return false;
    }
    if (!data) return false;
    set({ friendRequests: get().friendRequests.filter((r) => r.id !== id) });
    toast("Request canceled", UserMinus);
    return true;
  },

  removeFriend: async (userId) => {
    if (!supabase) return false;
    const { data, error } = await supabase.rpc("remove_friend", { p_other: userId });
    if (error) {
      set({ error: error.message });
      return false;
    }
    if (!data) return false;
    set({ friends: get().friends.filter((f) => f.id !== userId) });
    toast("Friend removed", UserMinus);
    return true;
  },

  fetchFeed: async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("list_activity_feed", { p_limit: FEED_PAGE });
    if (error) {
      set({ error: error.message });
      return;
    }
    const list = ((data ?? []) as ActivityEventRow[]).map(rowToActivityEvent);
    set({ feed: list, feedHasMore: list.length === FEED_PAGE });
  },

  // Append the next page of older posts, keyset-paginated on the oldest loaded
  // post's timestamp. Dedupes by id and guards re-entrancy + the end of the list.
  loadMoreFeed: async () => {
    const { feed, feedHasMore, feedLoadingMore } = get();
    if (!supabase || !feedHasMore || feedLoadingMore || feed.length === 0) return;
    set({ feedLoadingMore: true });
    const before = new Date(feed[feed.length - 1].createdAt).toISOString();
    const { data, error } = await supabase.rpc("list_activity_feed", {
      p_before: before,
      p_limit: FEED_PAGE,
    });
    if (error) {
      set({ error: error.message, feedLoadingMore: false });
      return;
    }
    const page = ((data ?? []) as ActivityEventRow[]).map(rowToActivityEvent);
    const have = new Set(get().feed.map((e) => e.id));
    set({
      feed: [...get().feed, ...page.filter((e) => !have.has(e.id))],
      feedHasMore: page.length === FEED_PAGE,
      feedLoadingMore: false,
    });
  },

  cheerActivity: async (eventId) => {
    const before = get().feed;
    // Optimistic: light up the cheer + bump the count, rolling back on error.
    set({
      feed: before.map((e) =>
        e.id === eventId && !e.cheeredByMe
          ? { ...e, cheeredByMe: true, cheerCount: e.cheerCount + 1 }
          : e,
      ),
    });
    if (!supabase) return;
    const { error } = await supabase.rpc("cheer_activity", { p_event: eventId });
    if (error) set({ error: error.message, feed: before });
  },

  uncheerActivity: async (eventId) => {
    const before = get().feed;
    set({
      feed: before.map((e) =>
        e.id === eventId && e.cheeredByMe
          ? { ...e, cheeredByMe: false, cheerCount: Math.max(0, e.cheerCount - 1) }
          : e,
      ),
    });
    if (!supabase) return;
    const { error } = await supabase.rpc("uncheer_activity", { p_event: eventId });
    if (error) set({ error: error.message, feed: before });
  },

  // --- Messaging (conversation/thread model) -------------------------------

  fetchConversations: async () => {
    if (!supabase) return;
    set({ conversationsLoading: true });
    const { data, error } = await supabase.rpc("list_conversations");
    if (error) {
      set({ error: error.message, conversationsLoading: false });
      return;
    }
    set({
      conversations: ((data ?? []) as ConversationRow[]).map(rowToConversation),
      conversationsLoading: false,
    });
  },

  fetchThread: async (otherId) => {
    if (!supabase) return;
    set({ threadLoading: true });
    const { data, error } = await supabase.rpc("list_thread", { p_other: otherId });
    if (error) {
      set({ error: error.message, threadLoading: false });
      return;
    }
    set({ thread: ((data ?? []) as MessageRow[]).map(rowToMessage), threadLoading: false });
  },

  sendMessage: async (recipient, body, gameId = null, replyTo = null, images = []) => {
    if (!supabase) return "You're offline — messages need a connection.";
    const { error } = await supabase.rpc("send_message", {
      p_recipient: recipient,
      p_body: body,
      p_game: gameId,
      p_reply_to: replyTo,
      p_images: images,
    });
    // Surface send failures inline in the thread (returned), not in the global error
    // banner — they're specific to this composer (e.g. "You can only message friends").
    if (error) return error.message;
    toast("Message sent", Send);
    return null;
  },

  uploadMessageImage: async (file) => {
    const { cloud, userId } = get();
    if (!cloud || !supabase || !userId) return null;
    const reason = validateFile(file);
    if (reason || !isImage(file)) {
      set({ error: reason ?? "Only images can be attached to a message." });
      return null;
    }
    try {
      const { blob, contentType, name } = await prepareUpload(file);
      const safe = name.replace(/[^\w.\-]+/g, "_");
      const path = `${userId}/dm/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, blob, { contentType, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("attachments").getPublicUrl(path);
      return { path, url: pub.publicUrl };
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Couldn't upload that image." });
      return null;
    }
  },

  toggleMessageReaction: async (messageId, emoji, on) => {
    const { thread } = get();
    // Optimistic: update the tally + my-reactions on the message in the open thread.
    const before = thread;
    set({
      thread: thread.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...m.reactions };
        const next = (reactions[emoji] ?? 0) + (on ? 1 : -1);
        if (next > 0) reactions[emoji] = next;
        else delete reactions[emoji];
        return {
          ...m,
          reactions,
          myReactions: on
            ? [...m.myReactions, emoji]
            : m.myReactions.filter((e) => e !== emoji),
        };
      }),
    });
    if (!supabase) return true;
    const { error } = await supabase.rpc("toggle_message_reaction", {
      p_message: messageId,
      p_emoji: emoji,
      p_on: on,
    });
    if (error) {
      set({ thread: before }); // revert; messaging errors stay out of the global banner
      return false;
    }
    return true;
  },

  editMessage: async (id, body) => {
    // Optimistic: update the body + edited marker in the open thread.
    const before = get().thread;
    set({
      thread: before.map((m) => (m.id === id ? { ...m, body, editedAt: Date.now() } : m)),
    });
    if (!supabase) return true;
    const { data, error } = await supabase.rpc("edit_message", { p_id: id, p_body: body });
    if (error || !data) {
      set({ error: error?.message ?? get().error, thread: before });
      return false;
    }
    toast("Message edited", Pencil);
    return true;
  },

  deleteMessage: async (id) => {
    // Optimistic two-sided tombstone in the open thread.
    const before = get().thread;
    set({
      thread: before.map((m) =>
        m.id === id ? { ...m, deleted: true, body: "", gameId: null, gameTitle: null } : m,
      ),
    });
    if (!supabase) return;
    const { error } = await supabase.rpc("delete_message", { p_id: id });
    if (error) {
      set({ error: error.message, thread: before });
      return;
    }
    toast("Message deleted", Trash2);
  },

  markThreadRead: async (otherId) => {
    // Optimistic: mark the open thread read, zero the conversation's unread, and
    // drop that many from the envelope badge.
    const { thread, conversations, unreadMessageCount } = get();
    const conv = conversations.find((c) => c.otherId === otherId);
    const dec = conv?.unreadCount ?? 0;
    set({
      thread: thread.map((m) => (!m.outgoing && m.readAt == null ? { ...m, readAt: Date.now() } : m)),
      conversations: conversations.map((c) =>
        c.otherId === otherId ? { ...c, unreadCount: 0 } : c,
      ),
      unreadMessageCount: Math.max(0, unreadMessageCount - dec),
    });
    if (!supabase) return;
    const { error } = await supabase.rpc("mark_thread_read", { p_other: otherId });
    if (error) set({ error: error.message });
  },

  archiveConversation: async (otherId, archived = true) => {
    const before = get().conversations;
    set({ conversations: before.map((c) => (c.otherId === otherId ? { ...c, archived } : c)) });
    if (!supabase) return;
    const { error } = await supabase.rpc("archive_conversation", {
      p_other: otherId,
      p_archived: archived,
    });
    if (error) {
      set({ error: error.message, conversations: before });
      return;
    }
    toast(archived ? "Conversation archived" : "Conversation restored", Archive);
  },

  removeConversation: async (otherId) => {
    // Discord-style remove: hide from the list (history is preserved server-side and
    // returns when reopened or on new activity).
    const before = get().conversations;
    set({ conversations: before.filter((c) => c.otherId !== otherId) });
    if (!supabase) return;
    const { error } = await supabase.rpc("remove_conversation", { p_other: otherId });
    if (error) {
      set({ error: error.message, conversations: before });
      return;
    }
    toast("Chat removed", Archive);
  },

  fetchUnreadMessageCount: async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("unread_message_count");
    // Silent on failure — background badge poll; never raise the global banner.
    if (error) return;
    set({ unreadMessageCount: Number(data ?? 0) });
  },
}));

/** The onboarding control to highlight right now, or null. Derived — never
 *  stored — so a ring can't go stale: it clears the instant the quest
 *  completes, the tutorial ends, or another account's data is loading. Returns
 *  a primitive, so `useStore(selectCoachTarget)` re-renders subscribers only
 *  when the target actually changes. */
export const selectCoachTarget = (s: BazaarState): CoachTarget | null =>
  coachTargetFor({
    loaded: s.sessionLoaded,
    completed: s.onboardingCompletedAt != null,
    pending: s.onboardingVouchersPending,
    vouchers: s.vouchers,
    isAdmin: s.isAdmin,
    claimed: s.onboardingVouchersGrantedAt != null,
    games: s.games,
  });
