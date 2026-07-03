import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Map, Package, type LucideIcon } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { ViewingProvider } from "../../lib/viewContext";
import { StatusBadge } from "../StatusBadge";

/** Which section pane is open. The tabs are data-driven so upcoming sections
 *  (e.g. a Community tab for reviews and player scores) are one new entry. */
export type GameTabId = "overview" | "journey" | "library";

const GAME_TABS: {
  id: GameTabId;
  label: string;
  icon: LucideIcon;
  /** Whether the tab has content in the read-only (visiting) variant. The tab
   *  bar itself only appears for visitors once more than one tab qualifies —
   *  today that's just Overview, so visitors see a single calm column. */
  visitorVisible: boolean;
}[] = [
  { id: "overview", label: "Overview", icon: BookOpen, visitorVisible: true },
  { id: "journey", label: "Journey", icon: Map, visitorVisible: false },
  { id: "library", label: "Library", icon: Package, visitorVisible: false },
];

/** A game's own page (routed: "#g/<id>", or "#u/<uid>/g/<gid>" while visiting).
 *  Replaces the old detail modal: a hero that identifies the game from every
 *  tab, and one pane per intent — Overview (look), Journey (your play story),
 *  Library (what you own). Every section writes immediately; there is no Save.
 *  While visiting, the same page renders read-only from the visited library. */
export function GamePage({
  gameId,
  visitPending = false,
  onBack,
}: {
  gameId: string;
  /** True while a "#u/<uid>/g/<gid>" deep link is still loading that player's
   *  Bazaar — the game can't resolve yet, so show a loading panel, not "gone". */
  visitPending?: boolean;
  onBack: () => void;
}) {
  const games = useStore((s) => s.games);
  const viewing = useStore((s) => s.viewing);
  const source = viewing ? viewing.games : games;
  const game = source.find((g) => g.id === gameId);

  // A fresh page starts at the top (Back restores the board's position).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [gameId]);

  // If the game we were showing disappears (deleted, sold back, expanded into a
  // compilation), leave the page instead of flashing the not-found panel.
  const hadGameRef = useRef(false);
  useEffect(() => {
    if (game) hadGameRef.current = true;
    else if (hadGameRef.current) onBack();
  }, [game, onBack]);

  if (!game) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <BackButton onBack={onBack} />
        <div className="mt-4 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          {visitPending ? (
            <p className="text-sm text-muted">Loading their Bazaar…</p>
          ) : (
            <>
              <p className="font-display text-xl text-ink">This game isn’t in the library</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                It may have been removed, or the link is out of date.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <ViewingProvider
      value={{ readOnly: viewing != null, hideSpend: viewing?.hideSpend ?? false }}
    >
      {/* Keyed by game so tab choice and section drafts reset when the page
          re-targets another game (family sibling jump, search). */}
      <GamePageBody key={game.id} game={game} readOnly={viewing != null} onBack={onBack} />
    </ViewingProvider>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-ink"
    >
      <ArrowLeft size={14} /> Back
    </button>
  );
}

function GamePageBody({
  game,
  readOnly,
  onBack,
}: {
  game: Game;
  readOnly: boolean;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<GameTabId>("overview");
  const tabs = readOnly ? GAME_TABS.filter((t) => t.visitorVisible) : GAME_TABS;
  const showBar = tabs.length > 1;
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <BackButton onBack={onBack} />
      </div>

      {/* Hero: identifies the game from every tab. */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="aspect-[16/9] w-full bg-panel">
          {game.image ? (
            <img src={game.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl opacity-50">🎮</div>
          )}
        </div>
        <div className="flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 font-display text-2xl leading-tight tracking-tight text-ink">
              {game.title}
            </h1>
            <StatusBadge status={game.status} />
          </div>
          {game.genres.length > 0 && (
            <p className="text-xs text-subtle">{game.genres.join(" · ")}</p>
          )}
        </div>
      </section>

      {/* Section tabs (pill pattern shared with the admin console). */}
      {showBar && (
        <div role="tablist" aria-label="Game sections" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const isActive = active.id === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-brand bg-brand text-brand-fg shadow-sm"
                    : "border-line bg-panel text-muted hover:text-ink"
                }`}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* The active pane. Sections land here in the next steps of the build. */}
      <PanePlaceholder label={active.label} />
    </div>
  );
}

function PanePlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-subtle">
      {label} — moving in shortly.
    </div>
  );
}
