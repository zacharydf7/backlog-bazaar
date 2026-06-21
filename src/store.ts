import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type {
  AppNotification,
  FeatureKind,
  FeatureRequest,
  FeatureStatus,
  Game,
  GameMeta,
  GameStatus,
} from "./types";
import { computePrice, computeReward, STARTING_COINS } from "./lib/pricing";
import {
  supabase,
  isCloudConfigured,
  rowToGame,
  rowToFeatureRequest,
  rowToNotification,
  type GameRow,
  type FeatureRequestRow,
  type NotificationRow,
  type LeaderboardRow,
} from "./lib/supabase";
import { toast } from "./lib/toast";
import { Store, Heart, Gamepad2, Trophy, Coins, EyeOff, Lightbulb } from "lucide-react";

function addedToast(title: string, status: GameStatus): void {
  if (status === "wishlist") toast(`Wishlisted ${title}`, Heart);
  else toast(`Added ${title} to your Bazaar`, Store);
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

  userId: string | null;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  providers: string[]; // linked sign-in methods, e.g. ["email", "google"]
  myPlatforms: string[]; // owned console ids (see lib/platforms)
  hiddenMarket: number[]; // rawgIds dismissed from The Market

  coins: number;
  games: Game[];
  notifications: AppNotification[];

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
  setMaintenance: (on: boolean, message: string | null) => Promise<void>;
  setCoins: (amount: number) => Promise<void>;
  hideMarketGame: (rawgId: number) => Promise<void>;
  clearHiddenMarket: () => Promise<void>;

  addGame: (meta: GameMeta, status?: GameStatus) => Promise<void>;
  wishlistToBazaar: (id: string) => Promise<void>;
  bazaarToWishlist: (id: string) => Promise<void>;
  buyGame: (id: string) => Promise<void>;
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
  ) => Promise<boolean>;
  voteFeatureRequest: (requestId: string, on: boolean) => Promise<boolean>;
  setRequestStatus: (requestId: string, status: FeatureStatus) => Promise<boolean>;
  deleteFeatureRequest: (requestId: string) => Promise<boolean>;

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

  userId: null,
  email: null,
  displayName: null,
  isAdmin: false,
  providers: [],
  myPlatforms: [],
  hiddenMarket: [],

  coins: STARTING_COINS,
  games: [],
  notifications: [],

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
        hiddenMarket: loadLocalHidden(),
        ready: true,
      });
      return;
    }

    // Maintenance flag (anon-readable). A missing table is treated as "open".
    const bypass = readBypass();
    const { data: cfg } = await supabase
      .from("app_config")
      .select("maintenance, message")
      .eq("id", 1)
      .single();
    const rawMaint = Boolean(cfg?.maintenance);
    set({
      maintenanceFlag: rawMaint,
      maintenance: rawMaint && isProductionHost() && !bypass,
      maintenanceMessage: (cfg?.message as string | null) ?? null,
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
        isAdmin: false,
        providers: [],
        myPlatforms: [],
        hiddenMarket: [],
        coins: STARTING_COINS,
        games: [],
        notifications: [],
      });
      return;
    }
    const uidv = session.user.id;
    set({
      userId: uidv,
      email: session.user.email ?? null,
      providers: (session.user.identities ?? []).map((i) => i.provider),
    });

    const [{ data: prof }, { data: rows }, { data: notes }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, coins, platforms, hidden_market, is_admin")
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
    ]);

    set({
      displayName: prof?.display_name ?? session.user.email ?? "Player",
      coins: prof?.coins ?? STARTING_COINS,
      isAdmin: Boolean(prof?.is_admin),
      myPlatforms: Array.isArray(prof?.platforms) ? (prof.platforms as string[]) : [],
      hiddenMarket: Array.isArray(prof?.hidden_market) ? (prof.hidden_market as number[]) : [],
      games: ((rows ?? []) as GameRow[]).map(rowToGame),
      notifications: ((notes ?? []) as NotificationRow[]).map(rowToNotification),
    });
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

  hideMarketGame: async (rawgId) => {
    const { hiddenMarket, cloud, userId } = get();
    if (hiddenMarket.includes(rawgId)) return;
    const next = [...hiddenMarket, rawgId];
    set({ hiddenMarket: next });
    toast("Hidden from the Market", EyeOff);
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

  addGame: async (meta, status = "backlog") => {
    const { cloud, userId, games, coins } = get();
    if (meta.rawgId && games.some((g) => g.rawgId === meta.rawgId)) return;

    if (!cloud) {
      const game: Game = { ...meta, id: uid(), status, addedAt: Date.now() };
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
        status,
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
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "backlog") return;
    const price = computePrice(game);
    if (coins < price) return;

    if (!cloud) {
      const next = games.map((g) =>
        g.id === id ? { ...g, status: "playing" as const, startedAt: Date.now(), pricePaid: price } : g,
      );
      const nc = coins - price;
      set({ games: next, coins: nc });
      saveLocal(nc, next);
      toast(`Bought ${game.title} — now playing!`, Gamepad2);
      return;
    }
    if (!supabase) return;

    const { data, error } = await supabase.rpc("apply_purchase", {
      p_game: id,
      p_price: price,
    });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({
      coins: data as number,
      games: games.map((g) =>
        g.id === id ? { ...g, status: "playing", startedAt: Date.now(), pricePaid: price } : g,
      ),
    });
    toast(`Bought ${game.title} — now playing!`, Gamepad2);
  },

  finishGame: async (id) => {
    const { cloud, games, coins } = get();
    const game = games.find((g) => g.id === id);
    if (!game || game.status !== "playing") return;
    const reward = computeReward(game);

    if (!cloud) {
      const next = games.map((g) =>
        g.id === id ? { ...g, status: "finished" as const, finishedAt: Date.now(), reward } : g,
      );
      const nc = coins + reward;
      set({ games: next, coins: nc });
      saveLocal(nc, next);
      toast(`Finished ${game.title} · +🪙 ${reward}`, Trophy);
      return;
    }
    if (!supabase) return;

    const { data, error } = await supabase.rpc("apply_finish", {
      p_game: id,
      p_reward: reward,
    });
    if (error) {
      set({ error: error.message });
      return;
    }
    set({
      coins: data as number,
      games: games.map((g) =>
        g.id === id ? { ...g, status: "finished", finishedAt: Date.now(), reward } : g,
      ),
    });
    toast(`Finished ${game.title} · +🪙 ${reward}`, Trophy);
  },

  abandonGame: async (id) => {
    const { cloud, games, coins } = get();
    if (!cloud) {
      const next = games.map((g) =>
        g.id === id && g.status === "playing"
          ? { ...g, status: "backlog" as const, startedAt: undefined, pricePaid: undefined }
          : g,
      );
      set({ games: next });
      saveLocal(coins, next);
      return;
    }
    if (!supabase) return;
    const { error } = await supabase
      .from("games")
      .update({ status: "backlog", started_at: null, price_paid: null })
      .eq("id", id);
    if (error) {
      set({ error: error.message });
      return;
    }
    set({
      games: games.map((g) =>
        g.id === id ? { ...g, status: "backlog", startedAt: undefined, pricePaid: undefined } : g,
      ),
    });
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
      coins: number;
      games_finished: number;
      hours_finished: number;
    }[]).map((r) => ({
      id: r.id,
      displayName: r.display_name,
      coins: r.coins,
      gamesFinished: Number(r.games_finished),
      hoursFinished: Number(r.hours_finished),
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

  submitFeatureRequest: async (title, description, kind) => {
    const { userId, isAdmin } = get();
    if (!supabase || !userId) return false;
    const { error } = await supabase.from("feature_requests").insert({
      user_id: userId,
      kind,
      title: title.trim(),
      description: description.trim() || null,
      is_admin_item: isAdmin,
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    toast("Request submitted", Lightbulb);
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

  deleteFeatureRequest: async (requestId) => {
    if (!supabase) return false;
    const { error } = await supabase.from("feature_requests").delete().eq("id", requestId);
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
