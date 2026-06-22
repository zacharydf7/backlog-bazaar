import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type {
  AdminUser,
  AppNotification,
  FeatureAttachment,
  FeatureComment,
  FeatureKind,
  FeatureRequest,
  FeatureStatus,
  Game,
  GameCopy,
  GameMeta,
  GameStatus,
  Privacy,
} from "./types";
import { applyThemeId, getThemeId, setThemeId } from "./lib/theme";
import { formatPlaytime } from "./lib/playtime";
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
import {
  supabase,
  isCloudConfigured,
  rowToGame,
  rowToFeatureRequest,
  rowToFeatureAttachment,
  rowToComment,
  rowToNotification,
  rowToAdminUser,
  rowToSlotDefinition,
  rowToTargetedSlot,
  rowToViewProfile,
  type GameRow,
  type FeatureRequestRow,
  type FeatureAttachmentRow,
  type CommentRow,
  type NotificationRow,
  type LeaderboardRow,
  type AdminUserRow,
  type SlotDefinitionRow,
  type UserSlotRow,
  type ViewProfileRow,
} from "./lib/supabase";
import { toast } from "./lib/toast";
import { processAvatar } from "./lib/avatar";
import { prepareUpload, validateFile } from "./lib/attachment";
import { Store, Heart, Gamepad2, Trophy, Coins, Eye, EyeOff, Lightbulb, Clock, Pencil, Undo2, Lock, Trash2, Link2, Unlink, ImagePlus, Palette } from "lucide-react";

function addedToast(title: string, status: GameStatus): void {
  if (status === "wishlist") toast(`Wishlisted ${title}`, Heart);
  else if (status === "finished") toast(`Added ${title} to your collection`, Trophy);
  else toast(`Added ${title} to your Bazaar`, Store);
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

function loadLocal(): { coins: number; games: Game[] } {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { coins: d.coins ?? STARTING_COINS, games: d.games ?? [] };
    }
  } catch {
    /* ignore */
  }
  return { coins: STARTING_COINS, games: [] };
}

function saveLocal(coins: number, games: Game[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ coins, games }));
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
  defaultCoin: CoinVariant; // app-wide coin skin, admin-configurable
  economy: EconomyConfig; // buy-price + finish-bounty formulas, admin-configurable

  userId: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null; // uploaded profile picture URL (null = use initials)
  isAdmin: boolean;
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

  coins: number;
  games: Game[];
  notifications: AppNotification[];

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
  setMyPlatforms: (ids: string[]) => Promise<void>;
  setTheme: (id: string) => Promise<void>;
  setPrivacy: (key: string, value: boolean) => Promise<void>;
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
  setCoins: (amount: number) => Promise<void>;

  fetchUsers: () => Promise<AdminUser[]>;
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
  wishlistToBazaar: (id: string) => Promise<void>;
  bazaarToWishlist: (id: string) => Promise<void>;
  buyGame: (id: string) => Promise<void>;
  moveGameToSlot: (id: string, slotId: string | null) => Promise<void>;
  linkGames: (id: string, otherId: string) => Promise<void>;
  unlinkGame: (id: string) => Promise<void>;
  setFamilyName: (familyId: string, name: string) => Promise<void>;
  logPlaytime: (id: string, hours: number) => Promise<void>;
  setPlayedHours: (id: string, hours: number) => Promise<void>;
  setGameCopies: (id: string, copies: GameCopy[]) => Promise<void>;
  setProgressNote: (id: string, note: string) => Promise<void>;
  editGame: (id: string, patch: EditableGameFields) => Promise<void>;
  setGameImage: (id: string, file: File) => Promise<void>;
  clearGameImage: (id: string) => Promise<void>;
  fetchCatalogPlatforms: (rawgId: number) => Promise<string[]>;
  finishGame: (id: string) => Promise<void>;
  abandonGame: (id: string) => Promise<void>;
  removeGame: (id: string) => Promise<void>;

  fetchLeaderboard: () => Promise<LeaderboardRow[]>;
  fetchPlayerLibrary: (playerId: string) => Promise<Game[]>;

  fetchFeatureRequests: () => Promise<FeatureRequest[]>;
  submitFeatureRequest: (
    title: string,
    description: string,
    kind: FeatureKind,
    files?: File[],
  ) => Promise<boolean>;
  fetchRequestAttachments: (requestId: string) => Promise<FeatureAttachment[]>;
  uploadAttachment: (requestId: string, file: File) => Promise<FeatureAttachment | null>;
  deleteAttachment: (att: FeatureAttachment) => Promise<boolean>;
  voteFeatureRequest: (requestId: string, on: boolean) => Promise<boolean>;
  setRequestStatus: (requestId: string, status: FeatureStatus) => Promise<boolean>;
  editFeatureRequest: (
    requestId: string,
    title: string,
    description: string,
    kind: FeatureKind,
  ) => Promise<boolean>;
  deleteFeatureRequest: (requestId: string) => Promise<boolean>;
  respondFeatureRequest: (requestId: string, approve: boolean) => Promise<FeatureStatus | null>;

  fetchRequestComments: (requestId: string) => Promise<FeatureComment[]>;
  addComment: (requestId: string, body: string, parentId?: string | null) => Promise<boolean>;
  editComment: (commentId: string, body: string) => Promise<boolean>;
  deleteComment: (commentId: string) => Promise<boolean>;
  toggleReaction: (commentId: string, emoji: string, on: boolean) => Promise<boolean>;

  fetchNotifications: () => Promise<void>;
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
  defaultCoin: DEFAULT_COIN,
  economy: DEFAULT_ECONOMY,

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
  theme: "treasure",
  privacy: {},

  coins: STARTING_COINS,
  games: [],
  notifications: [],

  viewing: null,
  viewingLoading: false,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    if (!isCloudConfigured || !supabase) {
      // Local guest mode — same behaviour as before, no account needed.
      const { coins, games } = loadLocal();
      set({
        coins,
        games,
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
        "maintenance, message, shelve_refund_pct, replay_bonus_pct, default_coin, price_formula, bounty_formula",
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
        coins: STARTING_COINS,
        games: [],
        notifications: [],
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

    const [{ data: prof }, { data: rows }, { data: notes }, { data: slotRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "display_name, avatar_url, coins, platforms, hidden_market, is_admin, general_slots, blocked, blocked_reason, custom_platforms, theme, privacy",
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
        .limit(50),
      supabase
        .from("user_slots")
        .select("id, definition:slot_definitions(id, name, min_hours, max_hours, active)")
        .eq("user_id", uidv),
    ]);

    set({
      displayName: prof?.display_name ?? session.user.email ?? "Player",
      avatarUrl: (prof?.avatar_url as string | null) ?? null,
      coins: prof?.coins ?? STARTING_COINS,
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
      myTargetedSlots: ((slotRows ?? []) as UserSlotRow[])
        .map(rowToTargetedSlot)
        .filter((s): s is TargetedSlot => s !== null),
      games: ((rows ?? []) as GameRow[]).map(rowToGame),
      notifications: ((notes ?? []) as NotificationRow[]).map(rowToNotification),
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
        platforms: meta.platforms ?? [],
        developers: meta.developers ?? [],
        esrb: meta.esrb ?? null,
        played_hours: meta.playedHours ?? 0,
        copies: meta.copies ?? [],
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

  wishlistToBazaar: async (id) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "wishlist") return;

    if (!cloud) {
      const next = games.map((g) =>
        g.id === id ? { ...g, status: "backlog" as const } : g,
      );
      set({ games: next });
      saveLocal(coins, next);
      toast(`Moved ${game.title} to your Bazaar`, Store);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.from("games").update({ status: "backlog" }).eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: games.map((g) => (g.id === id ? { ...g, status: "backlog" } : g)) });
    toast(`Moved ${game.title} to your Bazaar`, Store);
  },

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
      set({ games: next, coins: nc });
      saveLocal(nc, next);
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

  logPlaytime: async (id, hours) => {
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
      .rpc("log_playtime", { p_game: id, p_hours: hours })
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
    // Share edited platforms back to the catalog so future adders of this RAWG
    // game inherit them. Best-effort — a failure here doesn't fail the save.
    if (patch.platforms && game.rawgId) {
      await supabase.rpc("contribute_platforms", {
        p_rawg_id: game.rawgId,
        p_platforms: platforms,
      });
    }
    toast(`Saved ${title}`, Pencil);
  },

  // Fetch the community-contributed platforms for a RAWG game, to fold into the
  // platforms shown when adding it. Cloud-only; returns [] otherwise or on error.
  fetchCatalogPlatforms: async (rawgId) => {
    if (!supabase || !get().cloud || !rawgId) return [];
    const { data } = await supabase
      .from("game_catalog")
      .select("platforms")
      .eq("rawg_id", rawgId)
      .maybeSingle();
    const platforms = (data as { platforms?: unknown } | null)?.platforms;
    return Array.isArray(platforms) ? (platforms as string[]) : [];
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
      set({ games: next, coins: nc });
      saveLocal(nc, next);
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
      set({ games: next, coins: nc });
      saveLocal(nc, next);
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
    }[]).map((r) => ({
      id: r.id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url ?? null,
      coins: r.coins,
      gamesFinished: Number(r.games_finished),
      hoursFinished: Number(r.hours_finished),
      lastSeenAt: r.last_seen_at ? Date.parse(r.last_seen_at) : null,
      activity: r.activity ?? null,
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

  fetchFeatureRequests: async () => {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("list_feature_requests");
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as FeatureRequestRow[]).map(rowToFeatureRequest);
  },

  submitFeatureRequest: async (title, description, kind, files = []) => {
    const { userId, isAdmin } = get();
    if (!supabase || !userId) return false;
    const { data, error } = await supabase
      .from("feature_requests")
      .insert({
        user_id: userId,
        kind,
        title: title.trim(),
        description: description.trim() || null,
        is_admin_item: isAdmin,
      })
      .select("id")
      .single();
    if (error) {
      set({ error: error.message });
      return false;
    }
    // Attachments need the new request's id, so they upload after the insert.
    const requestId = (data as { id: string }).id;
    for (const file of files) {
      await get().uploadAttachment(requestId, file);
    }
    toast("Request submitted", Lightbulb);
    return true;
  },

  fetchRequestAttachments: async (requestId) => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("feature_attachments")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });
    if (error) {
      set({ error: error.message });
      return [];
    }
    return ((data ?? []) as FeatureAttachmentRow[]).map(rowToFeatureAttachment);
  },

  // Process (downscale images) + upload one file to the 'attachments' bucket under
  // <uid>/<requestId>/, then record it. Returns the stored attachment, or null on
  // a rejected/failed file (with an error message set).
  uploadAttachment: async (requestId, file) => {
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
        .from("feature_attachments")
        .insert({
          request_id: requestId,
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
      return rowToFeatureAttachment(row as FeatureAttachmentRow);
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
    const { error } = await supabase.from("feature_attachments").delete().eq("id", att.id);
    if (error) {
      set({ error: error.message });
      return false;
    }
    await supabase.storage.from("attachments").remove([att.path]);
    return true;
  },

  voteFeatureRequest: async (requestId, on) => {
    const { userId } = get();
    if (!supabase || !userId) return false;
    const { error } = on
      ? await supabase.from("feature_votes").insert({ request_id: requestId, user_id: userId })
      : await supabase
          .from("feature_votes")
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
      .from("feature_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", requestId);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  editFeatureRequest: async (requestId, title, description, kind) => {
    if (!supabase) return false;
    const { error } = await supabase.rpc("edit_feature_request", {
      p_id: requestId,
      p_title: title.trim(),
      p_description: description.trim(),
      p_kind: kind,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  deleteFeatureRequest: async (requestId) => {
    if (!supabase) return false;
    // Best-effort: clear this request's attachment files first (the DB rows
    // cascade-delete with the request). Storage RLS only lets the owner remove
    // their files, so an admin deleting someone else's report just leaves the
    // (harmless, public) objects behind.
    const paths = (await get().fetchRequestAttachments(requestId)).map((a) => a.path);
    if (paths.length) await supabase.storage.from("attachments").remove(paths);
    const { error } = await supabase.from("feature_requests").delete().eq("id", requestId);
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  // Submitter sign-off on an item awaiting their feedback: approve (-> done) or
  // request changes (-> in_progress). The RPC enforces owner + awaiting_feedback.
  respondFeatureRequest: async (requestId, approve) => {
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
    return data as FeatureStatus;
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

  addComment: async (requestId, body, parentId = null) => {
    const { userId } = get();
    if (!supabase || !userId) return false;
    const trimmed = body.trim();
    if (!trimmed) return false;
    const { error } = await supabase.from("feature_comments").insert({
      request_id: requestId,
      user_id: userId,
      parent_id: parentId,
      body: trimmed,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  editComment: async (commentId, body) => {
    if (!supabase) return false;
    const trimmed = body.trim();
    if (!trimmed) return false;
    const { error } = await supabase
      .from("feature_comments")
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
    const { error } = await supabase.from("feature_comments").delete().eq("id", commentId);
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

  fetchNotifications: async () => {
    const { userId } = get();
    if (!supabase || !userId) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({ notifications: ((data ?? []) as NotificationRow[]).map(rowToNotification) });
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
