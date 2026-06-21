import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import type { Game, GameMeta } from "../types";
import {
  usingRawg,
  fetchTrending,
  fetchNewReleases,
  fetchRecommended,
  fetchHltbTimes,
  fetchGameDetails,
} from "../lib/gamedata";
import { rawgIdsFor } from "../lib/platforms";
import { computePrice } from "../lib/pricing";

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
  const { games, myPlatforms, addGame } = useStore();
  const [onlyMine, setOnlyMine] = useState(false);
  const [trending, setTrending] = useState<GameMeta[] | null>(null);
  const [fresh, setFresh] = useState<GameMeta[] | null>(null);
  const [recs, setRecs] = useState<GameMeta[] | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);

  const ownedRawgIds = useMemo(
    () => new Set(games.map((g) => g.rawgId).filter(Boolean) as number[]),
    [games],
  );
  const genres = useMemo(() => topGenres(games), [games]);
  const platformIds = useMemo(
    () => (onlyMine ? rawgIdsFor(myPlatforms) : []),
    [onlyMine, myPlatforms],
  );

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

  async function add(meta: GameMeta) {
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
      await addGame(enriched);
    } finally {
      setAddingId(null);
    }
  }

  if (!usingRawg) {
    return (
      <div className="rounded-2xl border border-dashed border-line py-16 text-center">
        <p className="font-display text-xl text-ink">The Market is closed</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Discovering popular and recommended games needs a RAWG API key. Add one to{" "}
          <code>.env</code> (and your host) to open the market.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Browse the market and add games to your Bazaar.</p>
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
          <span className="text-xs text-subtle">Set your platforms in 👤 Account to filter.</span>
        )}
      </div>

      <Section
        title="✨ The Merchant Recommends"
        subtitle={genres.length ? `Because your Bazaar leans ${genres.join(", ")}` : "Top-rated picks"}
        games={recs}
        owned={ownedRawgIds}
        addingId={addingId}
        onAdd={add}
      />
      <Section
        title="🔥 Trending"
        subtitle="What everyone's playing"
        games={trending}
        owned={ownedRawgIds}
        addingId={addingId}
        onAdd={add}
      />
      <Section
        title="🆕 New Releases"
        subtitle="Fresh off the caravan"
        games={fresh}
        owned={ownedRawgIds}
        addingId={addingId}
        onAdd={add}
      />
    </div>
  );
}

function Section({
  title,
  subtitle,
  games,
  owned,
  addingId,
  onAdd,
}: {
  title: string;
  subtitle: string;
  games: GameMeta[] | null;
  owned: Set<number>;
  addingId: number | null;
  onAdd: (meta: GameMeta) => void;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="font-display text-xl text-ink">{title}</h2>
        <p className="text-xs text-subtle">{subtitle}</p>
      </div>
      {!games ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-muted">Nothing to show here right now.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {games.map((g) => (
            <MarketCard
              key={g.rawgId ?? g.title}
              game={g}
              owned={g.rawgId ? owned.has(g.rawgId) : false}
              adding={addingId === g.rawgId}
              onAdd={() => onAdd(g)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MarketCard({
  game,
  owned,
  adding,
  onAdd,
}: {
  game: GameMeta;
  owned: boolean;
  adding: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition hover:shadow-md">
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
        {owned ? (
          <span className="rounded-lg bg-panel px-3 py-1.5 text-center text-xs text-subtle">
            ✓ In your Bazaar
          </span>
        ) : (
          <button
            onClick={onAdd}
            disabled={adding}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:opacity-60"
          >
            {adding ? "Adding…" : `+ Add · 🪙 ${computePrice(game)}`}
          </button>
        )}
      </div>
    </div>
  );
}
