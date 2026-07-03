import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, BookOpen, Clock, Banknote, Map, Package, Users, type LucideIcon } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { ViewingProvider } from "../../lib/viewContext";
import { gameHash } from "../../lib/route";
import { familyMembers, familyStats } from "../../lib/families";
import { formatPlaytime } from "../../lib/playtime";
import { formatUsd } from "../../lib/copies";
import { StatusBadge } from "../StatusBadge";
import { GameActions } from "../GameActions";
import { FamilyHub } from "../FamilyHub";
import { OverviewTab, ReadOnlyOverview } from "./OverviewTab";
import { JourneyTab } from "./JourneyTab";
import { LibraryTab } from "./LibraryTab";

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
 *  tab (with the same actions the board card carries, so you can buy/log/finish
 *  right here), and one pane per intent — Overview (look), Journey (your play
 *  story), Library (what you own). Every section writes immediately; there is
 *  no Save. While visiting, the same page renders read-only from the visited
 *  library. */
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
      <GamePageBody
        key={game.id}
        game={game}
        libraryGames={source}
        readOnly={viewing != null}
        hideSpend={viewing?.hideSpend ?? false}
        visitUserId={viewing?.userId ?? null}
        onBack={onBack}
      />
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
  libraryGames,
  readOnly,
  hideSpend,
  visitUserId,
  onBack,
}: {
  game: Game;
  libraryGames: Game[];
  readOnly: boolean;
  hideSpend: boolean;
  visitUserId: string | null;
  onBack: () => void;
}) {
  const { cloud, fetchGameScreenshots } = useStore();
  const [tab, setTab] = useState<GameTabId>("overview");
  const [manageFamily, setManageFamily] = useState(false);
  const tabs = readOnly ? GAME_TABS.filter((t) => t.visitorVisible) : GAME_TABS;
  const showBar = tabs.length > 1;
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  // The catalog's community screenshots: shown in the Overview gallery, and
  // kept on the missing-platform suggestion's baseline (Library) so approving
  // that edit can never wipe them.
  const [screenshots, setScreenshots] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    if (cloud && (game.rawgId || game.catalogId)) {
      void fetchGameScreenshots({ rawgId: game.rawgId, catalogId: game.catalogId }).then(
        (s) => active && setScreenshots(s),
      );
    }
    return () => {
      active = false;
    };
  }, [cloud, game.rawgId, game.catalogId, fetchGameScreenshots]);

  // Family context: combined stats above the tabs, Manage entry (owner), and
  // sibling jumps that navigate to the sibling's own page.
  const members = familyMembers(libraryGames, game);
  const linked = members.length > 1;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <BackButton onBack={onBack} />
      </div>

      {/* Hero: identifies the game from every tab, and carries the same
          per-status actions as its board card. */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="aspect-[16/9] w-full bg-panel">
          {game.image ? (
            <img src={game.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl opacity-50">🎮</div>
          )}
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 font-display text-2xl leading-tight tracking-tight text-ink">
              {game.title}
            </h1>
            <StatusBadge status={game.status} />
          </div>
          {linked && (
            <FamilyStatsRow
              members={members}
              hideSpend={hideSpend}
              onManage={readOnly ? undefined : () => setManageFamily(true)}
            />
          )}
          {!readOnly && <GameActions game={game} />}
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

      {readOnly ? (
        <ReadOnlyOverview game={game} hideSpend={hideSpend} screenshots={screenshots} />
      ) : active.id === "overview" ? (
        <OverviewTab game={game} screenshots={screenshots} />
      ) : active.id === "journey" ? (
        <JourneyTab game={game} />
      ) : (
        <LibraryTab game={game} screenshots={screenshots} />
      )}

      {manageFamily &&
        createPortal(
          <FamilyHub
            game={game}
            onClose={() => setManageFamily(false)}
            onJump={(m) => {
              setManageFamily(false);
              window.location.hash = gameHash(m.id, visitUserId);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

/** Combined Hours Played + Money Spent across every edition, plus the entry
 *  point to the Manage Family hub (owner only). */
function FamilyStatsRow({
  members,
  hideSpend,
  onManage,
}: {
  members: Game[];
  hideSpend: boolean;
  onManage?: () => void;
}) {
  const stats = familyStats(members);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel/30 px-3 py-2">
      <div className="min-w-0">
        <div className="mb-0.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent">
          <Users size={13} /> Game Family · {stats.count} editions
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock size={13} className="text-accent/70" /> {formatPlaytime(stats.totalPlayed)}{" "}
            played
          </span>
          {!hideSpend && stats.totalCost > 0 && (
            <span className="inline-flex items-center gap-1">
              <Banknote size={13} className="text-accent/70" /> {formatUsd(stats.totalCost)} spent
            </span>
          )}
        </div>
      </div>
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105"
        >
          <Users size={15} /> Manage Family
        </button>
      )}
    </div>
  );
}
