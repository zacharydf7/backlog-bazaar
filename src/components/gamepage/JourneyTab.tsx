import { useState } from "react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { parsePlaytime, formatPlaytime } from "../../lib/playtime";
import { PlaytimeSection } from "./PlaytimeSection";
import { PrerequisiteSection } from "./PrerequisiteSection";
import { MilestonesSection } from "../MilestonesSection";

/** Your play story: logged time (per version in the cloud, one field offline),
 *  the milestone timeline, and the story-order prerequisite. All immediate-
 *  write. A wishlist game hasn't been played, so it skips the time editor. */
export function JourneyTab({ game }: { game: Game }) {
  const cloud = useStore((s) => s.cloud);
  const isWishlist = game.status === "wishlist";

  return (
    <div className="flex flex-col gap-4">
      {!isWishlist && (cloud ? <PlaytimeSection game={game} /> : <OfflinePlayedField game={game} />)}
      {cloud && <MilestonesSection game={game} />}
      {/* Changing the story lock of a game you're mid-way through is moot —
          the gate only applies on the way INTO Now Playing. */}
      {game.status !== "playing" && <PrerequisiteSection game={game} />}
    </div>
  );
}

/** Offline keeps a single total "Played" field; it persists on blur through
 *  editGame (the same patch shape the old modal's Save sent). */
function OfflinePlayedField({ game }: { game: Game }) {
  const editGame = useStore((s) => s.editGame);
  const [played, setPlayed] = useState(formatPlaytime(game.playedHours ?? 0));

  const commit = () => {
    const parsed = parsePlaytime(played);
    if (parsed == null || parsed === (game.playedHours ?? 0)) return;
    void editGame(game.id, {
      title: game.title,
      released: game.released || undefined,
      hours: game.hours ?? undefined,
      playedHours: parsed,
      copies: game.copies ?? [],
      platforms: game.platforms ?? [],
    });
  };

  return (
    <label className="text-sm text-muted">
      Played
      <input
        type="text"
        value={played}
        onChange={(e) => setPlayed(e.target.value)}
        onBlur={commit}
        placeholder="e.g. 1h 30m"
        className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
      />
    </label>
  );
}
