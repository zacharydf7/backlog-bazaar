import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Flame,
  Package,
  Heart,
  Plus,
  Eye,
  EyeOff,
  MoreVertical,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import type { Game, GameMeta, GameStatus } from "../types";
import {
  usingRawg,
  fetchTrending,
  fetchNewReleases,
  fetchRecommended,
  fetchHltbTimes,
  fetchGameDetails,
} from "../lib/gamedata";
import { rawgIdsFor } from "../lib/platforms";

// How many games to show per section after filtering out owned/hidden ones.
// Sections over-fetch (see gamedata.ts) so dropped games are replaced by fresh
// ones and the grid stays full.
const PER_SECTION = 12;

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}

function metacriticColor(score: number): string {
  if (score >= 75) return "bg-emerald-600 text-white";
  if (score >= 50) return "bg-yellow-500 text-stone-900";
  return "bg-red-600 text-white";
}

/** The player's most common genres (across their whole library). */
function topGenres(games: Game[], n = 3): string[] {
  const counts = new Map<string, number>();
  for (const g of games) for (const genre of g.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map((e) => e[0]);
}

export function Market() {
  const { games, myPlatforms, addGame, hiddenMarket, hideMarketGame, clearHiddenMarket } =
    useStore();
  const [onlyMine, setOnlyMine] = useState(false);
  const [trending, setTrending] = useState<GameMeta[] | null>(null);
  const [fresh, setFresh] = useState<GameMeta[] | null>(null);
  const [recs, setRecs] = useState<GameMeta[] | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);

  // rawgId -> the status it already has in the player's library (if any).
  const owned = useMemo(() => {
    const m = new Map<number, GameStatus>();
    for (const g of games) if (g.rawgId) m.set(g.rawgId, g.status);
    return m;
  }, [games]);
  const genres = useMemo(() => topGenres(games), [games]);
  const platformIds = useMemo(
    () => (onlyMine ? rawgIdsFor(myPlatforms) : []),
    [onlyMine, myPlatforms],
  );

  const hidden = useMemo(() => new Set(hiddenMarket), [hiddenMarket]);
  // Drop games the player dismissed or already has in their Bazaar/wishlist, then
  // cap the section — over-fetching means dropped games are replaced, not just
  // removed (null = still loading).
  const visible = (list: GameMeta[] | null) =>
    list &&
    list
      .filter((g) => !g.rawgId || (!hidden.has(g.rawgId) && !owned.has(g.rawgId)))
      .slice(0, PER_SECTION);

  useEffect(() => {
    if (!usingRawg) return;
    let active = true;
    setTrending(null);
    setFresh(null);
    setRecs(null);
    const fail = (set: (v: GameMeta[]) => void) => () => active && set([]);
    fetchRecommended(genres, platformIds).then((r) => active && setRecs(r)).catch(fail(setRecs));
    fetchTrending(platformIds).then((r) => active && setTrending(r)).catch(fail(setTrending));
    fetchNewReleases(platformIds).then((r) => active && setFresh(r)).catch(fail(setFresh));
    return () => {
      active = false;
    };
  }, [platformIds, genres]);

  async function add(meta: GameMeta, status: GameStatus) {
    if (!meta.rawgId || addingId) return;
    setAddingId(meta.rawgId);
    try {
      const enriched: GameMeta = { ...meta };
      const [times, details] = await Promise.all([
        fetchHltbTimes(meta.title),
        fetchGameDetails(meta.rawgId),
      ]);
      if (times?.main) enriched.hours = times.main;
      Object.assign(enriched, details);
      await addGame(enriched, status);
    } finally {
      setAddingId(null);
    }
  }

  if (!usingRawg) {
    return (
      <div className="rounded-2xl border border-dashed border-line py-16 text-center">
        <p className="font-display text-xl text-ink">The Caravan hasn't arrived</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Discovering popular and recommended games needs a RAWG API key. Add one to{" "}
          <code>.env</code> (and your host) to open the caravan.
        </p>
      </div>
    );
  }

  const sectionProps = { addingId, onAdd: add, onHide: hideMarketGame };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Browse the caravan and send games to your Bazaar or wishlist.</p>
        <div className="flex items-center gap-4">
          {hiddenMarket.length > 0 && (
            <button
              onClick={() => clearHiddenMarket()}
              className="inline-flex items-center gap-1.5 text-xs text-subtle transition hover:text-accent"
              title="Bring back games you've dismissed"
            >
              <Eye size={13} /> Show {hiddenMarket.length} hidden
            </button>
          )}
          {myPlatforms.length > 0 ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
                className="accent-[var(--brand)]"
              />
              Only games I can play
            </label>
          ) : (
            <span className="text-xs text-subtle">Set your platforms in Account to filter.</span>
          )}
        </div>
      </div>

      <Section
        icon={Sparkles}
        title="The Merchant Recommends"
        subtitle={genres.length ? `Because your Bazaar leans ${genres.join(", ")}` : "Top-rated picks"}
        games={visible(recs)}
        {...sectionProps}
      />
      <Section
        icon={Flame}
        title="Trending"
        subtitle="What everyone's playing"
        games={visible(trending)}
        {...sectionProps}
      />
      <Section
        icon={Package}
        title="New Releases"
        subtitle="Fresh off the caravan"
        games={visible(fresh)}
        {...sectionProps}
      />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  games,
  addingId,
  onAdd,
  onHide,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  games: GameMeta[] | null;
  addingId: number | null;
  onAdd: (meta: GameMeta, status: GameStatus) => void;
  onHide: (rawgId: number) => void;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <Icon size={18} className="text-accent" />
          {title}
        </h2>
        <p className="text-xs text-subtle">{subtitle}</p>
      </div>
      {!games ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-muted">Nothing to show here right now.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {games.map((g) => (
            <MarketCard
              key={g.rawgId ?? g.title}
              game={g}
              adding={addingId === g.rawgId}
              onAdd={(status) => onAdd(g, status)}
              onHide={g.rawgId ? () => onHide(g.rawgId!) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MarketCard({
  game,
  adding,
  onAdd,
  onHide,
}: {
  game: GameMeta;
  adding: boolean;
  onAdd: (status: GameStatus) => void;
  onHide?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition hover:shadow-md">
      <div className="relative h-28 bg-panel">
        {game.image ? (
          <img src={game.image} alt={game.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl opacity-60">🎮</div>
        )}
        {game.metacritic != null && (
          <span
            className={
              "absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-xs font-bold shadow " +
              metacriticColor(game.metacritic)
            }
          >
            {game.metacritic}
          </span>
        )}
        {onHide && (
          <div className="absolute right-2 top-2" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              title="More options"
              aria-label="More options"
              className={
                "grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white/80 transition hover:bg-black/70 hover:text-white " +
                (menuOpen
                  ? "opacity-100"
                  : "opacity-100 hover-device:opacity-0 hover-device:group-hover:opacity-100")
              }
            >
              <MoreVertical size={14} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface p-1 text-left shadow-2xl">
                <button
                  onClick={() => {
                    onHide();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                >
                  <EyeOff size={15} className="text-accent" /> Hide from Caravan
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink">{game.title}</h3>
          <p className="mt-0.5 text-[11px] text-subtle">
            {year(game.released)}
            {game.platforms && game.platforms.length > 0
              ? ` · ${game.platforms.slice(0, 2).join(", ")}`
              : ""}
          </p>
        </div>
        <div className="mt-auto" />
        <div className="flex gap-1.5">
          <button
            onClick={() => onAdd("backlog")}
            disabled={adding}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:opacity-60"
          >
            {adding ? (
              "Sending…"
            ) : (
              <>
                <Plus size={13} /> Send to Bazaar
              </>
            )}
          </button>
          <button
            onClick={() => onAdd("wishlist")}
            disabled={adding}
            title="Add to wishlist"
            className="grid place-items-center rounded-lg border border-line px-2 py-1.5 text-muted transition hover:border-brand/50 hover:text-accent disabled:opacity-60"
          >
            <Heart size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
