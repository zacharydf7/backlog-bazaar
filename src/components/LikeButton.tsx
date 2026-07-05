import { Heart } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { useViewing } from "../lib/viewContext";

/** The like/favorite heart for one game — outline until liked, filled with the
 *  accent (and a little pop) once liked. Interactive on your own games; while
 *  visiting it renders read-only, and only when the owner actually liked the
 *  game (their taste is public, your buttons are not). A pure taste marker —
 *  no economy impact.
 *
 *  `overlay` renders it as a dark circular chip for sitting on cover art
 *  (matching the card's ⋮ button); the default is a plain inline heart. */
export function LikeButton({
  game,
  size = 16,
  overlay = false,
  className = "",
}: {
  game: Game;
  size?: number;
  overlay?: boolean;
  className?: string;
}) {
  const toggleGameLike = useStore((s) => s.toggleGameLike);
  const { readOnly } = useViewing();
  const liked = game.likedAt != null;

  const chip = overlay ? "h-6 w-6 rounded-full bg-black/50 " : "";

  if (readOnly) {
    if (!liked) return null;
    return (
      <span
        title="They like this game"
        className={"inline-grid place-items-center text-accent " + chip + className}
      >
        <Heart size={size} className="fill-current" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void toggleGameLike(game.id);
      }}
      aria-pressed={liked}
      aria-label={liked ? `Unlike ${game.title}` : `Like ${game.title}`}
      title={liked ? `Unlike ${game.title}` : `Like ${game.title}`}
      className={
        "group/like inline-grid place-items-center transition " +
        chip +
        (overlay
          ? liked
            ? "text-accent hover:bg-black/70 "
            : "text-white/80 hover:bg-black/70 hover:text-white "
          : liked
            ? "text-accent "
            : "text-muted hover:text-accent ") +
        className
      }
    >
      <Heart
        size={size}
        className={
          "transition-transform duration-200 group-active/like:scale-125 " +
          (liked ? "fill-current" : "fill-transparent")
        }
      />
    </button>
  );
}
