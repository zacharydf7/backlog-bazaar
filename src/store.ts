import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { Game, GameMeta } from "./types";
import { computePrice, computeReward, STARTING_COINS } from "./lib/pricing";
import {
  supabase,
  isCloudConfigured,
  rowToGame,
  type GameRow,
  type LeaderboardRow,
} from "./lib/supabase";

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

interface BazaarState {
  cloud: boolean; // is Supabase configured
  initialized: boolean; // init() has run
  ready: boolean; // safe to render the app
  busy: boolean; // an auth request is in flight
  error: string | null;
  notice: string | null;

  userId: string | null;
  email: string | null;
  displayName: string | null;
  providers: string[]; // linked sign-in methods, e.g. ["email", "google"]

  coins: number;
  games: Game[];

  init: () => Promise<void>;
  applySession: (session: Session | null) => Promise<void>;

  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  unlinkGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearMessages: () => void;

  addGame: (meta: GameMeta) => Promise<void>;
  buyGame: (id: string) => Promise<void>;
  finishGame: (id: string) => Promise<void>;
  abandonGame: (id: string) => Promise<void>;
  removeGame: (id: string) => Promise<void>;

  fetchLeaderboard: () => Promise<LeaderboardRow[]>;
  fetchPlayerLibrary: (playerId: string) => Promise<Game[]>;
}

export const useStore = create<BazaarState>((set, get) => ({
  cloud: isCloudConfigured,
  initialized: false,
  ready: false,
  busy: false,
  error: null,
  notice: null,

  userId: null,
  email: null,
  displayName: null,
  providers: [],

  coins: STARTING_COINS,
  games: [],

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    if (!isCloudConfigured || !supabase) {
      // Local guest mode — same behaviour as before, no account needed.
      const { coins, games } = loadLocal();
      set({ coins, games, displayName: "You", ready: true });
      return;
    }

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
        providers: [],
        coins: STARTING_COINS,
        games: [],
      });
      return;
    }
    const uidv = session.user.id;
    set({
      userId: uidv,
      email: session.user.email ?? null,
      providers: (session.user.identities ?? []).map((i) => i.provider),
    });

    const [{ data: prof }, { data: rows }] = await Promise.all([
      supabase.from("profiles").select("display_name, coins").eq("id", uidv).single(),
      supabase
        .from("games")
        .select("*")
        .eq("user_id", uidv)
        .order("added_at", { ascending: false }),
    ]);

    set({
      displayName: prof?.display_name ?? session.user.email ?? "Player",
      coins: prof?.coins ?? STARTING_COINS,
      games: ((rows ?? []) as GameRow[]).map(rowToGame),
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
    const { data: sess } = await supabase.auth.getSession();
    set({ providers: (sess.session?.user.identities ?? []).map((i) => i.provider) });
  },

  signOut: async () => {
    await supabase?.auth.signOut();
  },

  clearMessages: () => set({ error: null, notice: null }),

  addGame: async (meta) => {
    const { cloud, userId, games, coins } = get();
    if (meta.rawgId && games.some((g) => g.rawgId === meta.rawgId)) return;

    if (!cloud) {
      const game: Game = { ...meta, id: uid(), status: "backlog", addedAt: Date.now() };
      const next = [game, ...games];
      set({ games: next });
      saveLocal(coins, next);
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
        status: "backlog",
      })
      .select()
      .single();

    if (error) {
      set({ error: error.message });
      return;
    }
    set({ games: [rowToGame(data as GameRow), ...get().games] });
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
}));
