import { useState } from "react";
import type { Game } from "../types";
import { useStore } from "../store";
import { computePrice, computeReward, priceBreakdown } from "../lib/pricing";

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}

// Metacritic's own colour bands: green (good), yellow (mixed), red (poor).
function metacriticColor(score: number): string {
  if (score >= 75) return "bg-emerald-600 text-white";
  if (score >= 50) return "bg-yellow-500 text-stone-900";
  return "bg-red-600 text-white";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-stone-500">{label}</span>
      <span className="text-sm text-stone-200">{value}</span>
    </div>
  );
}

export function GameCard({ game }: { game: Game }) {
  const { coins, buyGame, finishGame, abandonGame, removeGame } = useStore();
  const [showWhy, setShowWhy] = useState(false);

  const price = computePrice(game);
  const reward = computeReward(game);
  const canAfford = coins >= price;
  const bd = priceBreakdown(game);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-stone-700 bg-stone-800/60 shadow-lg transition hover:border-amber-600/60">
      <div className="relative h-36 bg-stone-700">
        {game.image ? (
          <img src={game.image} alt={game.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl">🎮</div>
        )}
        {game.metacritic != null && (
          <span
            title="Metacritic score"
            className={
              "absolute left-2 top-2 rounded px-1.5 py-0.5 text-xs font-bold " +
              metacriticColor(game.metacritic)
            }
          >
            {game.metacritic}
          </span>
        )}
        <button
          onClick={() => removeGame(game.id)}
          title="Remove from Backlog Bazaar"
          className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-stone-300 hover:bg-red-700 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-display text-lg leading-tight text-amber-100">{game.title}</h3>
          {game.developers && game.developers.length > 0 && (
            <p className="mt-0.5 text-xs text-stone-400">{game.developers.slice(0, 2).join(", ")}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Released" value={year(game.released)} />
          <Stat label="Length" value={game.hours ? `${game.hours}h` : "—"} />
          <Stat label="Rating" value={game.rating ? game.rating.toFixed(1) : "—"} />
        </div>

        {(game.genres.length > 0 || game.esrb) && (
          <div className="flex flex-wrap gap-1">
            {game.genres.slice(0, 3).map((g) => (
              <span
                key={g}
                className="rounded-full bg-stone-700 px-2 py-0.5 text-[10px] text-stone-300"
              >
                {g}
              </span>
            ))}
            {game.esrb && (
              <span className="rounded-full border border-stone-600 px-2 py-0.5 text-[10px] text-stone-400">
                {game.esrb}
              </span>
            )}
          </div>
        )}

        {game.platforms && game.platforms.length > 0 && (
          <div className="truncate text-[11px] text-stone-500" title={game.platforms.join(", ")}>
            🕹️ {game.platforms.slice(0, 4).join(" · ")}
          </div>
        )}

        <div className="mt-auto" />

        {game.status === "backlog" && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowWhy((v) => !v)}
              className="self-start text-left text-xs text-stone-400 hover:text-amber-300"
            >
              🪙 {price} coins {showWhy ? "▲" : "▼"}
            </button>
            {showWhy && (
              <div className="rounded-lg bg-stone-900/70 p-2 text-[11px] text-stone-400">
                <div className="flex justify-between">
                  <span>Base</span>
                  <span>{bd.base}</span>
                </div>
                <div className="flex justify-between">
                  <span>Length ({game.hours ?? "?"}h)</span>
                  <span>{bd.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Newness</span>
                  <span>{bd.recency}</span>
                </div>
                <div className="flex justify-between">
                  <span>Rating</span>
                  <span>{bd.rating}</span>
                </div>
              </div>
            )}
            <button
              onClick={() => buyGame(game.id)}
              disabled={!canAfford}
              className={
                "rounded-lg px-3 py-2 text-sm font-semibold transition " +
                (canAfford
                  ? "bg-amber-600 text-stone-900 hover:bg-amber-500"
                  : "cursor-not-allowed bg-stone-700 text-stone-500")
              }
            >
              {canAfford ? `Buy & Start · 🪙 ${price}` : `Need 🪙 ${price - coins} more`}
            </button>
          </div>
        )}

        {game.status === "playing" && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-emerald-400">
              Reward on finish: 🪙 {reward}
            </span>
            <button
              onClick={() => finishGame(game.id)}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-stone-900 transition hover:bg-emerald-500"
            >
              ✓ Mark Finished · +🪙 {reward}
            </button>
            <button
              onClick={() => abandonGame(game.id)}
              className="text-xs text-stone-500 hover:text-stone-300"
            >
              Put back in the Bazaar
            </button>
          </div>
        )}

        {game.status === "finished" && (
          <div className="rounded-lg bg-emerald-900/30 px-3 py-2 text-center text-sm text-emerald-300">
            🏆 Finished{game.reward ? ` · earned 🪙 ${game.reward}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
