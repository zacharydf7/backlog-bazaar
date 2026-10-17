import type { Game } from "../types";

/** A game's title plus, for a bundled game, its original platform as a muted
 *  suffix (issue 86fc0b4b) — "Buzz Lightyear of Star Command · Game Boy Color"
 *  — so same-named versions in one bundle read apart. Inline, so it truncates
 *  with whatever text container holds it. */
export function TitleWithOrigin({ game }: { game: Pick<Game, "title" | "originalPlatform"> }) {
  return (
    <>
      {game.title}
      {game.originalPlatform && <span className="text-subtle"> · {game.originalPlatform}</span>}
    </>
  );
}
