import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { GameCard } from "./components/GameCard";
import { AddGameModal } from "./components/AddGameModal";
import { Auth } from "./components/Auth";
import { Leaderboard } from "./components/Leaderboard";
import type { GameStatus } from "./types";

type Tab = GameStatus;

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "backlog", label: "Bazaar", icon: "🏪" },
  { id: "playing", label: "Now Playing", icon: "🎮" },
  { id: "finished", label: "Finished", icon: "🏆" },
];

const PLAYING_NUDGE = 3;

export default function App() {
  const {
    cloud,
    ready,
    userId,
    displayName,
    coins,
    games,
    error,
    clearMessages,
    init,
    signOut,
  } = useStore();
  const [tab, setTab] = useState<Tab>("backlog");
  const [adding, setAdding] = useState(false);
  const [showBoard, setShowBoard] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  const counts = useMemo(
    () => ({
      backlog: games.filter((g) => g.status === "backlog").length,
      playing: games.filter((g) => g.status === "playing").length,
      finished: games.filter((g) => g.status === "finished").length,
    }),
    [games],
  );

  const visible = useMemo(
    () =>
      games
        .filter((g) => g.status === tab)
        .sort((a, b) => (b.startedAt ?? b.addedAt) - (a.startedAt ?? a.addedAt)),
    [games, tab],
  );

  if (!ready) {
    return (
      <div className="flex min-h-full items-center justify-center text-stone-500">
        Loading…
      </div>
    );
  }

  // In cloud mode you must be signed in.
  if (cloud && !userId) {
    return <Auth />;
  }

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 pb-16">
      {/* Global error banner */}
      {error && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-red-700/60 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          <span>{error}</span>
          <button onClick={clearMessages} className="text-red-400 hover:text-red-200">
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <div>
          <h1 className="font-display text-3xl text-amber-300">Backlog Bazaar</h1>
          <p className="text-sm text-stone-400">
            {displayName ? `Welcome, ${displayName}. ` : ""}Finish games to earn coins.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wide text-amber-500/80">Wallet</div>
            <div className="font-display text-2xl text-amber-300">🪙 {coins}</div>
          </div>
          {cloud && (
            <button
              onClick={() => setShowBoard(true)}
              title="Leaderboard"
              className="rounded-xl border border-stone-600 px-3 py-3 text-stone-200 hover:bg-stone-700"
            >
              🏆
            </button>
          )}
          <button
            onClick={() => setAdding(true)}
            className="rounded-xl bg-amber-600 px-4 py-3 font-semibold text-stone-900 hover:bg-amber-500"
          >
            + Add games
          </button>
          {cloud && (
            <button
              onClick={() => signOut()}
              className="rounded-xl border border-stone-600 px-3 py-3 text-sm text-stone-300 hover:bg-stone-700"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {!cloud && (
        <div className="mb-4 rounded-lg border border-stone-700 bg-stone-800/60 px-4 py-2 text-xs text-stone-400">
          Running locally without an account. Add Supabase keys to{" "}
          <code>.env</code> to enable sign-in, sync, and the leaderboard.
        </div>
      )}

      {/* Tabs */}
      <nav className="mb-6 flex gap-2 border-b border-stone-700">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "relative px-4 py-2 text-sm font-medium transition " +
              (tab === t.id ? "text-amber-300" : "text-stone-400 hover:text-stone-200")
            }
          >
            {t.icon} {t.label} <span className="text-stone-500">({counts[t.id]})</span>
            {tab === t.id && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-amber-400" />
            )}
          </button>
        ))}
      </nav>

      {tab === "playing" && counts.playing > PLAYING_NUDGE && (
        <div className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-2 text-sm text-amber-300">
          You have {counts.playing} games going at once. Maybe finish one before buying
          another? 🧘
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState tab={tab} onAdd={() => setAdding(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}

      {adding && <AddGameModal onClose={() => setAdding(false)} />}
      {showBoard && <Leaderboard onClose={() => setShowBoard(false)} />}
    </div>
  );
}

function EmptyState({ tab, onAdd }: { tab: Tab; onAdd: () => void }) {
  const copy: Record<Tab, { title: string; body: string }> = {
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
  };
  const c = copy[tab];
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-700 py-16 text-center">
      <p className="font-display text-xl text-stone-300">{c.title}</p>
      <p className="max-w-md text-sm text-stone-500">{c.body}</p>
      {tab === "backlog" && (
        <button
          onClick={onAdd}
          className="mt-2 rounded-lg bg-amber-600 px-4 py-2 font-semibold text-stone-900 hover:bg-amber-500"
        >
          + Add your first game
        </button>
      )}
    </div>
  );
}
