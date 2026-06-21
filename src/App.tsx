import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { GameCard } from "./components/GameCard";
import { AddGameModal } from "./components/AddGameModal";
import { Auth } from "./components/Auth";
import { Leaderboard } from "./components/Leaderboard";
import { AccountModal } from "./components/AccountModal";
import { ThemeToggle } from "./components/ThemeToggle";
import type { GameStatus } from "./types";

type Tab = GameStatus;

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "backlog", label: "Bazaar", icon: "🏪" },
  { id: "playing", label: "Now Playing", icon: "🎮" },
  { id: "finished", label: "Finished", icon: "🏆" },
];

const PLAYING_NUDGE = 3;

const iconButton =
  "rounded-xl border border-line bg-surface p-2.5 text-muted transition hover:bg-panel hover:text-ink";

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
  const [showAccount, setShowAccount] = useState(false);

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
      <div className="flex min-h-full items-center justify-center text-subtle">Loading…</div>
    );
  }

  // In cloud mode you must be signed in.
  if (cloud && !userId) {
    return <Auth />;
  }

  return (
    <div className="min-h-full">
      {/* Sticky translucent header */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="font-display text-2xl tracking-tight text-accent sm:text-3xl">
              Backlog Bazaar
            </h1>
            <p className="text-sm text-muted">
              {displayName ? `Welcome, ${displayName}. ` : ""}Finish games to earn coins.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-accent/80">
                Wallet
              </span>
              <span className="font-display text-xl font-semibold text-accent">🪙 {coins}</span>
            </div>
            <ThemeToggle />
            {cloud && (
              <button onClick={() => setShowBoard(true)} title="Leaderboard" className={iconButton}>
                🏆
              </button>
            )}
            {cloud && (
              <button onClick={() => setShowAccount(true)} title="Account" className={iconButton}>
                👤
              </button>
            )}
            {cloud && (
              <button onClick={() => signOut()} title="Sign out" className={iconButton}>
                ⎋
              </button>
            )}
            <button
              onClick={() => setAdding(true)}
              className="rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
            >
              + Add games
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        {/* Global error banner */}
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-500 dark:text-red-300">
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

        {/* Segmented pill tabs */}
        <nav className="mb-6 inline-flex flex-wrap gap-1 rounded-xl border border-line bg-panel p-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                  (active
                    ? "bg-surface text-ink shadow-sm"
                    : "text-muted hover:text-ink")
                }
              >
                {t.icon} {t.label}
                <span
                  className={
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] " +
                    (active ? "bg-brand/15 text-accent" : "bg-line text-subtle")
                  }
                >
                  {counts[t.id]}
                </span>
              </button>
            );
          })}
        </nav>

        {tab === "playing" && counts.playing > PLAYING_NUDGE && (
          <div className="mb-4 rounded-xl border border-brand/40 bg-brand/10 px-4 py-2 text-sm text-accent">
            You have {counts.playing} games going at once. Maybe finish one before buying another?
            🧘
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
      </main>

      {adding && <AddGameModal onClose={() => setAdding(false)} />}
      {showBoard && <Leaderboard onClose={() => setShowBoard(false)} />}
      {showAccount && <AccountModal onClose={() => setShowAccount(false)} />}
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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
      <p className="font-display text-xl text-ink">{c.title}</p>
      <p className="max-w-md text-sm text-muted">{c.body}</p>
      {tab === "backlog" && (
        <button
          onClick={onAdd}
          className="mt-2 rounded-xl bg-brand px-4 py-2 font-semibold text-brand-fg shadow-sm transition hover:brightness-105"
        >
          + Add your first game
        </button>
      )}
    </div>
  );
}
