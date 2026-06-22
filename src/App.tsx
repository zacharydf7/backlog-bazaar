import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TriangleAlert, Lock, Gamepad2 } from "lucide-react";
import { useStore } from "./store";
import { slotCapacity, generalUnitsUsed, playingUnits, type TargetedSlot } from "./lib/slots";
import { Toasts } from "./components/Toasts";
import { UpdateBanner } from "./components/UpdateBanner";
import { MaintenancePage } from "./components/MaintenancePage";
import { GameCard } from "./components/GameCard";
import { AddGameModal } from "./components/AddGameModal";
import { Auth } from "./components/Auth";
import { Leaderboard } from "./components/Leaderboard";
import { AccountModal } from "./components/AccountModal";
import { FeatureBoard } from "./components/FeatureBoard";
import { Market } from "./components/Market";
import { BlockedPage } from "./components/BlockedPage";
import { UserManagement } from "./components/UserManagement";
import { ReleaseNotes } from "./components/ReleaseNotes";
import { AboutPage } from "./components/AboutPage";
import { Sidebar, MobileNav, TopBar, TABS, type View } from "./components/Sidebar";
import { LATEST_RELEASE_ID, loadSeenReleaseId, markReleasesSeen } from "./lib/changelog";
import type { Game, GameStatus } from "./types";

/** The game-library sections (everything else is a discovery/utility page). */
function isGameStatus(v: View): v is GameStatus {
  return v === "backlog" || v === "playing" || v === "finished" || v === "wishlist";
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
    generalSlots,
    myTargetedSlots,
    blocked,
    blockedReason,
    defaultCoin,
  } = useStore();
  const [view, setView] = useState<View>("backlog");
  const [adding, setAdding] = useState(false);
  const [featuresRequestId, setFeaturesRequestId] = useState<string | undefined>(undefined);
  const [seenReleaseId, setSeenReleaseId] = useState<string | null>(() => loadSeenReleaseId());

  function openReleaseNotes() {
    markReleasesSeen();
    setSeenReleaseId(LATEST_RELEASE_ID);
    setView("whatsnew");
  }

  // Notification links are "features" (open the board) or "features:<id>" (open
  // that request's detail). Parse and route accordingly.
  function openFeatures(link: string) {
    if (link === "features" || link.startsWith("features:")) {
      const id = link.startsWith("features:") ? link.slice("features:".length) : undefined;
      setFeaturesRequestId(id || undefined);
      setView("requests");
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

  const counts = useMemo(
    () => ({
      backlog: games.filter((g) => g.status === "backlog").length,
      playing: games.filter((g) => g.status === "playing").length,
      finished: games.filter((g) => g.status === "finished").length,
      wishlist: games.filter((g) => g.status === "wishlist").length,
    }),
    [games],
  );

  const visible = useMemo(
    () =>
      games
        .filter((g) => g.status === view)
        .sort((a, b) => (b.startedAt ?? b.addedAt) - (a.startedAt ?? a.addedAt)),
    [games, view],
  );

  if (!ready) {
    return (
      <div className="flex min-h-full items-center justify-center text-subtle">Loading…</div>
    );
  }

  // Admins always get through; everyone else sees the closed page during maintenance.
  if (maintenance && !isAdmin) {
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

  const chrome = {
    view,
    setView,
    counts,
    seenReleaseId,
    onAdd: () => setAdding(true),
    onLeaderboard: () => setView("leaderboard"),
    onRequests: () => {
      setFeaturesRequestId(undefined);
      setView("requests");
    },
    onUsers: () => setView("users"),
    onAccount: () => setView("account"),
    onReleaseNotes: openReleaseNotes,
    onAbout: () => setView("about"),
    onNotificationNavigate: openFeatures,
  };

  return (
    <div className="min-h-full">
      <Sidebar {...chrome} />
      <div className="md:pl-64">
        <MobileNav {...chrome} />
        <TopBar {...chrome} />
        <main className="mx-auto w-full max-w-[1600px] px-4 pb-24 pt-6 md:px-6 md:pb-16">
        {/* Admin: site is closed to everyone else */}
        {isAdmin && maintenanceFlag && (
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

        {/* Current section heading (the page title now lives in the sidebar).
            Game sections get a simple heading; the page views render their own. */}
        {isGameStatus(view) && (
          <div className="mb-5 flex items-center gap-2.5">
            <h2 className="font-display text-2xl tracking-tight text-ink">
              {TABS.find((t) => t.id === view)?.label}
            </h2>
            <span className="rounded-full bg-line px-2 py-0.5 text-xs font-medium text-subtle">
              {counts[view]}
            </span>
          </div>
        )}

        {view === "market" ? (
          <Market />
        ) : view === "leaderboard" ? (
          <Leaderboard />
        ) : view === "requests" ? (
          <FeatureBoard initialRequestId={featuresRequestId} />
        ) : view === "account" ? (
          <AccountModal />
        ) : view === "users" ? (
          <UserManagement />
        ) : view === "whatsnew" ? (
          <ReleaseNotes />
        ) : view === "about" ? (
          <AboutPage />
        ) : (
          <>
            {view === "playing" && (
              <NowPlayingSlots
                generalSlots={generalSlots}
                grants={myTargetedSlots}
                playing={visible}
              />
            )}

            {visible.length === 0 ? (
              <EmptyState
                tab={view}
                onAdd={() => setAdding(true)}
                onAbout={() => setView("about")}
              />
            ) : (
              <div
                key={view}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                <AnimatePresence mode="popLayout">
                  {visible.map((g) => (
                    <motion.div
                      key={g.id}
                      layout
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.18 }}
                    >
                      <GameCard game={g} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
        </main>
      </div>

      {adding && <AddGameModal onClose={() => setAdding(false)} />}
      <Toasts />
      <UpdateBanner />
    </div>
  );
}

function slotRangeLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return "any length";
  if (min != null && max != null) return `${min}–${max}h`;
  if (max != null) return `≤ ${max}h`;
  return `≥ ${min}h`;
}

// The Now Playing slot meter: a chip per slot (general + targeted) showing what's
// in use. You can't start a new game without an open slot, so this makes the cap
// — and which targeted slots are free — visible at a glance.
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
  // Count occupant *units* (a linked family is one), not raw games.
  const generalUsed = generalUnitsUsed(playing);
  const occupied = new Set(playing.map((g) => g.slotId).filter(Boolean) as string[]);

  // One chip per general slot (filled left-to-right), then one per targeted slot.
  const generalChips = Array.from({ length: general }).map((_, i) => ({
    key: `gen-${i}`,
    label: "General",
    sub: "any game",
    filled: i < generalUsed,
    targeted: false,
  }));
  // Any games beyond general capacity that aren't in a targeted slot (e.g. after
  // an admin lowered the count) show as overflow chips so nothing disappears.
  const overflow = Math.max(0, generalUsed - general);
  const overflowChips = Array.from({ length: overflow }).map((_, i) => ({
    key: `over-${i}`,
    label: "Over limit",
    sub: "general",
    filled: true,
    targeted: false,
    danger: true,
  }));
  const targetedChips = grants.map((t) => ({
    key: t.id,
    label: t.definition.name,
    sub: slotRangeLabel(t.definition.minHours, t.definition.maxHours),
    filled: occupied.has(t.id),
    targeted: true,
  }));

  const chips = [...generalChips, ...overflowChips, ...targetedChips];
  const totalUsed = playingUnits(playing);
  const capacity = general + grants.length;
  const allFull = totalUsed >= capacity;

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface px-4 py-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
          {allFull ? (
            <Lock size={15} className="text-accent" />
          ) : (
            <Gamepad2 size={15} className="text-accent" />
          )}
          Now Playing slots
        </span>
        <span className="text-xs text-muted">
          {totalUsed} of {capacity} in use
          {allFull
            ? " · full — finish or shelve to start another"
            : ` · ${capacity - totalUsed} open`}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c.key}
            title={`${c.label} · ${c.sub}`}
            className={
              "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] " +
              ("danger" in c && c.danger
                ? "border-danger/40 bg-danger/10 text-danger"
                : c.filled
                  ? "border-brand/40 bg-brand/10 text-accent"
                  : "border-dashed border-line text-subtle")
            }
          >
            <span
              className={
                "h-2 w-2 rounded-full " +
                ("danger" in c && c.danger
                  ? "bg-danger"
                  : c.filled
                    ? "bg-brand"
                    : "bg-line")
              }
            />
            {c.label}
            {c.targeted && <span className="opacity-70">· {c.sub}</span>}
          </span>
        ))}
        {chips.length === 0 && (
          <span className="text-xs text-subtle">No slots — ask an admin for one.</span>
        )}
      </div>
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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
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
