import { trackEvent } from "../../lib/appEvents";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Reorder, useDragControls } from "motion/react";
import {
  ArrowLeft,
  Banknote,
  BookOpen,
  CheckCircle2,
  Clock,
  Database,
  Gamepad2,
  GripVertical,
  ImagePlus,
  Map as MapIcon,
  Milestone as MilestoneIcon,
  Package,
  Pencil,
  Play,
  Star,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Compilation, Game } from "../../types";
import { useStore } from "../../store";
import { gameHash } from "../../lib/route";
import type { PageNav, PageNavStop } from "../../lib/pageNav";
import { PageNavControls } from "./PageNavControls";
import {
  compilationCoverOf,
  compilationGameOf,
  compilationStatus,
  orderCompilationChildren,
} from "../../lib/compilationGrouping";
import { compilationCopiesOf } from "../../lib/compilations";
import { formatCost, formatLabel, formatUsd, hasAnyCost, ownedPlatformSummary, spendLabel, totalCost } from "../../lib/copies";
import { formatPlaytime } from "../../lib/playtime";
import { effectiveLength } from "../../lib/personalLength";
import { StatusBadge } from "../StatusBadge";
import { isInRotation } from "../../lib/status";
import { PlatformBadge } from "../PlatformBadge";
import { ConfirmDialog } from "../ConfirmDialog";
import { AddCompilationModal } from "../AddCompilationModal";
import { BundleProgress } from "../CompilationParentCard";
import { ValueBadge, ValuePlayedNote } from "../ValueBadge";
import { valueStatusOf, type ValueStatus } from "../../lib/valueMetrics";
import { CompilationPlayPicker } from "../CompilationPlayPicker";
import { MilestonesSection } from "../MilestonesSection";
import {
  MILESTONE_KINDS,
  milestoneLabel,
  sortMilestones,
  type GameMilestone,
} from "../../lib/milestones";
import { GamePriorityBadge } from "../GamePriorityBadge";
import { TitleWithOrigin } from "../TitleWithOrigin";
import { LikeButton } from "../LikeButton";
import { GameSearchBox } from "../GameSearchBox";
import { SuggestEditButton } from "../GameSubmissionForm";
import { CatalogCard, CoverControls, PriorityCard } from "./OverviewTab";
import { ReviewTab } from "./ReviewTab";
import { CommunityTab } from "./CommunityTab";

type CompilationTabId = "overview" | "games" | "journey" | "review" | "community" | "library";

/** The game page's tabs, plus Games (issue 86fc0b4b). Review and Community
 *  belong to the compilation's own game row, so they appear once it has one;
 *  Journey and Community are cloud-only, as on the game page. */
const TABS: { id: CompilationTabId; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "games", label: "Games", icon: Gamepad2 },
  { id: "journey", label: "Journey", icon: MapIcon },
  { id: "review", label: "Review", icon: Star },
  { id: "community", label: "Community", icon: Users },
  { id: "library", label: "Library", icon: Package },
];

/** A compilation's own page (routed: "#c/<id>"), laid out like a game's page
 *  (issue 86fc0b4b): the compilation is a game in its own right — cover,
 *  catalog details, priority, review, likes and community stats live on its
 *  game row — and its games, each a tracker with its own coins and playtime,
 *  are on the Games tab. Owner-only: visits never render it. */
export function CompilationPage({
  compilationId,
  onBack,
  pageNav,
  onNavigate,
}: {
  compilationId: string;
  onBack: () => void;
  /** The originating board's browse order, for Prev/Next across the bundle and
   *  game cards alike (issue 28ec4975). Absent when reached via a deep link. */
  pageNav?: PageNav | null;
  onNavigate?: (stop: PageNavStop) => void;
}) {
  const compilations = useStore((s) => s.compilations);
  const games = useStore((s) => s.games);
  const compilationGames = useStore((s) => s.compilationGames);
  const cloud = useStore((s) => s.cloud);
  const ensureCompilationGame = useStore((s) => s.ensureCompilationGame);
  const compilation = compilations.find((c) => c.id === compilationId);
  const container = compilationGameOf(compilationId, compilationGames);

  // A fresh page starts at the top (Back restores the board's position).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [compilationId]);

  // A compilation without its game row (one whose creation failed) gets it on
  // first open — the same owner action that creating a compilation takes.
  const asked = useRef(false);
  useEffect(() => {
    if (cloud && compilation && !container && !asked.current) {
      asked.current = true;
      void ensureCompilationGame(compilation.id);
    }
  }, [cloud, compilation, container, ensureCompilationGame]);

  // If the compilation disappears (deleted), leave the page instead of
  // flashing the not-found panel — same behavior as GamePage.
  const hadRef = useRef(false);
  useEffect(() => {
    if (compilation) hadRef.current = true;
    else if (hadRef.current) onBack();
  }, [compilation, onBack]);

  if (!compilation) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <BackButton onBack={onBack} />
        <div className="mt-4 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <p className="font-display text-xl text-ink">This compilation isn’t in the library</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            It may have been deleted, or the link is out of date.
          </p>
        </div>
      </div>
    );
  }

  // Keyed by compilation so tab choice resets when the page re-targets.
  return (
    <CompilationPageBody
      key={compilation.id}
      compilation={compilation}
      container={container}
      childGames={games.filter((g) => g.compilationId === compilation.id)}
      onBack={onBack}
      pageNav={pageNav}
      onNavigate={onNavigate}
    />
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

function CompilationPageBody({
  compilation,
  container,
  childGames,
  onBack,
  pageNav,
  onNavigate,
}: {
  compilation: Compilation;
  /** The compilation's own game row; absent offline or until it's created. */
  container: Game | undefined;
  childGames: Game[];
  onBack: () => void;
  pageNav?: PageNav | null;
  onNavigate?: (stop: PageNavStop) => void;
}) {
  const { cloud, setCompilationChildOrder, deleteCompilation, fetchGameScreenshots } = useStore();
  const targetCostPerHour = useStore((s) => s.targetCostPerHour);
  const [tab, setTab] = useState<CompilationTabId>("overview");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picking, setPicking] = useState(false);

  const tabs = TABS.filter(
    (t) =>
      (t.id !== "journey" || cloud) &&
      (t.id !== "review" || container) &&
      (t.id !== "community" || (cloud && container)),
  );
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  // The children in the owner's chosen order (issue 140ac868) — the whole page
  // (cover fallback, lists, journey) reads this one order, so it always agrees
  // with the bundle cards, which order the same way.
  const children = useMemo(
    () => orderCompilationChildren(childGames, compilation.childOrder),
    [childGames, compilation.childOrder],
  );
  const cover = compilationCoverOf(compilation, children, container);
  const finished = children.filter((g) => g.status === "finished").length;
  const playing = children.filter((g) => g.status === "playing").length;
  const canPlay = children.some((g) => g.status === "backlog");
  const carryover = compilation.carryoverHours ?? 0;
  const totalPlayed = children.reduce((sum, g) => sum + (g.playedHours ?? 0), 0) + carryover;
  // "Money Well Spent" for the whole bundle: its total spend against every
  // game's hours (plus any carryover), at your target rate — the same verdict
  // the game page gives one game. The page is owner-only, so it's always yours.
  const value = valueStatusOf(compilation.totalCost, totalPlayed, targetCostPerHour);
  const ownedCopySummary = ownedPlatformSummary(compilationCopiesOf(compilation));

  // The catalog's community screenshots for the compilation's linked game.
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const ids = { rawgId: container?.rawgId, igdbId: container?.igdbId, catalogId: container?.catalogId };
  useEffect(() => {
    let active = true;
    setScreenshots([]);
    if (cloud && (ids.rawgId || ids.igdbId || ids.catalogId)) {
      void fetchGameScreenshots(ids).then((s) => active && setScreenshots(s));
    }
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, ids.rawgId, ids.igdbId, ids.catalogId, fetchGameScreenshots]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <BackButton onBack={onBack} />
        {pageNav && onNavigate && (
          <PageNavControls
            nav={pageNav}
            current={{ kind: "compilation", id: compilation.id }}
            onNavigate={onNavigate}
          />
        )}
      </div>

      {/* Hero: the compilation as a game, like a game page's — cover, title,
          like — plus what's inside it at a glance and its actions. */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="aspect-[16/9] w-full bg-panel">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl opacity-50">📦</div>
          )}
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 font-display text-2xl leading-tight tracking-tight text-ink">
              {compilation.title}
            </h1>
            {container && <LikeButton game={container} size={18} />}
            {value && <ValueBadge status={value} target={targetCostPerHour!} />}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={compilationStatus(children)} />
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-2 py-0.5 text-[11px] font-medium text-accent">
              <Package size={11} /> Compilation · {children.length} game
              {children.length === 1 ? "" : "s"} · {finished} finished
            </span>
          </div>

          <BundleProgress finished={finished} playing={playing} total={children.length} />

          <div className="flex flex-wrap gap-1">
            <span
              className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted"
              title={
                carryover > 0
                  ? `Includes ${formatPlaytime(carryover)} played before expanding`
                  : undefined
              }
            >
              <Clock size={11} className="shrink-0 text-accent/70" />
              {formatPlaytime(totalPlayed)} played
            </span>
            {compilation.totalCost > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted">
                <Banknote size={11} className="shrink-0 text-accent/70" />
                {formatUsd(compilation.totalCost)} spent
              </span>
            )}
            {ownedCopySummary.map((o) => (
              <PlatformBadge key={o.platform} label={o.platform} formats={o.formats} />
            ))}
          </div>

          {/* Starting a game, then the bundle's management actions. */}
          <div className="flex flex-wrap items-center gap-2">
            {canPlay && (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-sm font-semibold text-brand-fg shadow-stamp-sm transition hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-none"
              >
                <Play size={14} /> Play a game
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink transition hover:border-brand/50"
            >
              <Pencil size={14} className="text-accent" /> Edit compilation
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-muted transition hover:border-danger/40 hover:text-danger"
            >
              <Trash2 size={14} /> Delete compilation
            </button>
          </div>
        </div>
      </section>

      {/* Section tabs (pill pattern shared with the game page). */}
      <div role="tablist" aria-label="Compilation sections" className="flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const isActive = active.id === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setTab(t.id);
                trackEvent("feature", "compilation_tab", { tab: t.id });
              }}
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

      {active.id === "games" ? (
        <GamesPane
          children={children}
          carryover={carryover}
          canPlay={canPlay}
          onPlay={() => setPicking(true)}
          onEdit={() => setEditing(true)}
          onReorder={(order) => void setCompilationChildOrder(compilation.id, order)}
        />
      ) : active.id === "journey" ? (
        <JourneyPane children={children} carryover={carryover} />
      ) : active.id === "review" && container ? (
        <ReviewTab game={container} />
      ) : active.id === "community" && container ? (
        <CommunityTab game={container} />
      ) : active.id === "library" ? (
        <LibraryPane
          compilation={compilation}
          container={container}
          totalPlayed={totalPlayed}
          value={value}
          target={targetCostPerHour}
          onEdit={() => setEditing(true)}
        />
      ) : (
        <OverviewPane
          compilation={compilation}
          container={container}
          cover={cover}
          screenshots={screenshots}
          cloud={cloud}
        />
      )}

      {editing &&
        createPortal(
          <AddCompilationModal compilation={compilation} onClose={() => setEditing(false)} />,
          document.body,
        )}
      {picking &&
        createPortal(
          <CompilationPlayPicker
            compilation={compilation}
            children={children}
            onClose={() => setPicking(false)}
          />,
          document.body,
        )}
      {confirmDelete &&
        createPortal(
          <ConfirmDialog
            title="Delete this compilation?"
            tone="danger"
            confirmLabel="Delete everything"
            body={
              <>
                This permanently deletes{" "}
                <span className="font-medium text-ink">{compilation.title}</span> and all{" "}
                <span className="font-medium text-ink">{children.length}</span> game
                {children.length === 1 ? "" : "s"} inside it. This can&apos;t be undone.
              </>
            }
            onConfirm={() => {
              setConfirmDelete(false);
              // The leave-if-gone effect navigates back once the row vanishes.
              void deleteCompilation(compilation.id);
            }}
            onCancel={() => setConfirmDelete(false)}
          />,
          document.body,
        )}
    </div>
  );
}

/** The compilation as a game at a glance (issue 86fc0b4b): its cover, its
 *  catalog details and community screenshots, and your priority — the same
 *  cards a game's Overview shows, on the compilation's own game row. Without
 *  that row yet (offline), the cover control works on the compilation itself. */
function OverviewPane({
  compilation,
  container,
  cover,
  screenshots,
  cloud,
}: {
  compilation: Compilation;
  container: Game | undefined;
  cover: string | undefined;
  screenshots: string[];
  cloud: boolean;
}) {
  if (container) {
    return (
      <div className="flex flex-col gap-4">
        <CoverControls game={container} />
        <CatalogCard game={container} screenshots={screenshots} />
        <PriorityCard game={container} />
      </div>
    );
  }
  return <CompilationCoverControls compilation={compilation} cover={cover} cloud={cloud} />;
}

/** The compilation's cover set on the compilation itself — only while it has
 *  no game row of its own (offline), whose cover controls take over after. */
function CompilationCoverControls({
  compilation,
  cover,
  cloud,
}: {
  compilation: Compilation;
  cover: string | undefined;
  cloud: boolean;
}) {
  const { setCompilationParentImage, clearCompilationParentImage } = useStore();
  if (!cloud && !compilation.parentImage) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel/50 p-2.5">
      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-panel">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-lg opacity-50">🎮</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-ink">Card cover</span>
        <span className="block text-[11px] text-subtle">
          Shown on the bundle&apos;s cards across your boards.
        </span>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {cloud && (
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted transition hover:border-brand/50 hover:text-ink">
              <ImagePlus size={12} className="text-accent" /> Upload image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void setCompilationParentImage(compilation.id, f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {compilation.parentImage && (
            <button
              type="button"
              onClick={() => void clearCompilationParentImage(compilation.id)}
              className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted transition hover:border-danger/40 hover:text-danger"
            >
              <Trash2 size={12} /> Remove — use the first game&apos;s cover
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The games inside (issue 86fc0b4b): compact rows — status, hours against
 *  length, cost share — each opening that game's own page, where its playtime
 *  and coins live. Add, remove and rename go through Edit games. */
function GamesPane({
  children,
  carryover,
  canPlay,
  onPlay,
  onEdit,
  onReorder,
}: {
  children: Game[];
  carryover: number;
  canPlay: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base text-ink">Games in this compilation</h3>
        <div className="flex flex-wrap items-center gap-2">
          {canPlay && (
            <button
              type="button"
              onClick={onPlay}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink transition hover:border-brand/50"
            >
              <Play size={13} className="text-accent" /> Play a game
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink transition hover:border-brand/50"
          >
            <Pencil size={13} className="text-accent" /> Edit games
          </button>
        </div>
      </div>
      <BundleGames games={children} onReorder={onReorder} />
      <p className="px-1 text-[11px] text-subtle">
        Tap a game to open it — log time and finish it there.
        {children.length > 1 &&
          " Drag the handle to reorder — the compilation's cards list its games in this order."}
      </p>
      {carryover > 0 && (
        <p className="px-1 text-[11px] text-subtle">
          Totals include {formatPlaytime(carryover)} logged on the single card before it was
          expanded.
        </p>
      )}
    </div>
  );
}

/** The reorderable games list. Dragging a row's handle sets the compilation's
 *  game order (persisted); that order carries to the bundle cards' trays and
 *  cover fallback (issue 140ac868). Pointer-based drag, so it works on touch. */
function BundleGames({
  games,
  onReorder,
}: {
  games: Game[];
  onReorder: (orderedIds: string[]) => void;
}) {
  // Live display order, re-seeded whenever the child set/order changes (the
  // optimistic store update after a drop, or a child added/removed elsewhere).
  const idsKey = games.map((g) => g.id).join(",");
  const [order, setOrder] = useState<string[]>(() => games.map((g) => g.id));
  useEffect(() => {
    setOrder(games.map((g) => g.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
  // Read the freshest order on drop, immune to any pointerup/render race.
  const orderRef = useRef(order);
  orderRef.current = order;
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const ordered = order.map((id) => byId.get(id)).filter((g): g is Game => g != null);
  const draggable = games.length > 1;

  return (
    <Reorder.Group
      axis="y"
      values={order}
      onReorder={setOrder}
      onPointerUp={() => {
        if (draggable) onReorder(orderRef.current);
      }}
      className="flex flex-col gap-1"
    >
      {ordered.map((g) => (
        <BundleRow key={g.id} game={g} draggable={draggable} />
      ))}
    </Reorder.Group>
  );
}

/** One game row: a drag handle (when reorderable) plus the row itself, which
 *  opens the game's page. Drag is handle-only (dragListener off) so a tap
 *  still navigates. */
function BundleRow({ game, draggable }: { game: Game; draggable: boolean }) {
  const controls = useDragControls();
  const done = game.status === "finished";
  const cost = totalCost(game.copies);
  const played = game.playedHours ?? 0;
  const length = effectiveLength(game);
  return (
    <Reorder.Item value={game.id} dragListener={false} dragControls={controls} className="list-none">
      <div className="flex items-stretch gap-1 rounded-lg border border-line bg-panel/50 transition hover:border-brand/50">
        {draggable && (
          <span
            role="button"
            aria-label={`Drag to reorder ${game.title}`}
            onPointerDown={(e) => controls.start(e)}
            className="flex cursor-grab touch-none items-center pl-1.5 text-subtle transition hover:text-ink"
          >
            <GripVertical size={16} />
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            window.location.hash = gameHash(game.id);
          }}
          title={`Open ${game.title}`}
          className="flex min-w-0 flex-1 items-start justify-between gap-2 px-2.5 py-2 text-left"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {done ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
            ) : (
              <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">
                <TitleWithOrigin game={game} />
              </span>
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                <StatusBadge status={game.status} rotation={isInRotation(game)} />
                {game.priority && <GamePriorityBadge priority={game.priority} />}
              </div>
            </div>
          </div>
          <div className="mt-0.5 flex shrink-0 flex-col items-end text-xs">
            <span className="text-muted">
              {played > 0 ? formatPlaytime(played) : "—"}
              {length != null && <span className="text-subtle"> / {formatPlaytime(length)}</span>}
            </span>
            {cost > 0 && <span className="text-subtle">{formatUsd(cost)}</span>}
          </div>
        </button>
      </div>
    </Reorder.Item>
  );
}

/** What you own and paid, and where the compilation sits in the game database
 *  (issue 86fc0b4b): its copies with the whole bundle's played time and Money
 *  Well Spent value, then its database link. */
function LibraryPane({
  compilation,
  container,
  totalPlayed,
  value,
  target,
  onEdit,
}: {
  compilation: Compilation;
  container: Game | undefined;
  totalPlayed: number;
  /** The bundle's Money Well Spent verdict, or null when no target is set or
   *  nothing was spent. */
  value: ValueStatus | null;
  target: number | null;
  onEdit: () => void;
}) {
  const copies = compilationCopiesOf(compilation);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-panel/30 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base text-ink">Your copies</h3>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink transition hover:border-brand/50"
          >
            <Pencil size={13} className="text-accent" /> Edit compilation
          </button>
        </div>
        <div className="rounded-lg bg-panel p-2 text-[11px] text-muted">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
            <span className="inline-flex items-center gap-1 text-accent">
              <Banknote size={12} /> {hasAnyCost(copies) ? spendLabel(compilation.totalCost) : "Spent —"}
              <span className="text-subtle">· {formatPlaytime(totalPlayed)} played</span>
            </span>
            {value && <ValuePlayedNote status={value} target={target!} />}
          </div>
          {copies.map((c) => (
            <div key={c.id} className="flex justify-between gap-2">
              <span className="truncate">
                {c.platform}
                {c.format ? ` (${formatLabel(c.format)})` : ""}
                {c.note ? ` · ${c.note}` : ""}
              </span>
              <span className="shrink-0">{c.cost != null ? formatCost(c.cost) : "—"}</span>
            </div>
          ))}
        </div>
      </div>
      {container && <DatabaseLink compilation={compilation} container={container} />}
    </div>
  );
}

/** The compilation's link to the shared game database (issue 86fc0b4b) — what
 *  its community stats, reviews and screenshots hang off. Pick its entry from
 *  search, or, when it isn't listed, suggest it: once approved, an unlinked
 *  compilation with the same title links to the new entry by itself. */
function DatabaseLink({ compilation, container }: { compilation: Compilation; container: Game }) {
  const ensureCompilationGame = useStore((s) => s.ensureCompilationGame);
  const linked = container.rawgId != null || container.igdbId != null || container.catalogId != null;
  const [changing, setChanging] = useState(false);
  const [query, setQuery] = useState("");
  const searching = !linked || changing;
  return (
    <div className="rounded-xl border border-line bg-panel/30 p-3">
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-subtle">
        <Database size={12} className="text-accent/70" /> Game database
      </span>
      {!searching ? (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-subtle">
            Linked — its community stats, reviews and screenshots are shared with everyone who
            owns {compilation.title}.
          </p>
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink transition hover:border-brand/50"
          >
            Change link
          </button>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-col gap-2">
          <p className="text-[11px] text-subtle">
            {linked
              ? "Pick the database entry this compilation is."
              : "Not linked yet. Find this compilation in the game database to share its community stats, reviews and screenshots."}
          </p>
          <GameSearchBox
            value={query}
            onChange={setQuery}
            onPick={(meta) => {
              void ensureCompilationGame(compilation.id, {
                rawgId: meta.rawgId,
                igdbId: meta.igdbId,
                catalogId: meta.catalogId,
              });
              setChanging(false);
              setQuery("");
            }}
            placeholder="Search the game database"
            ariaLabel="Find this compilation in the game database"
            className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
          />
          {!linked && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-subtle">
              Not listed? Add it for everyone:
              <SuggestEditButton game={container} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The bundle's play story: one timeline across every game, then each game's
 *  own milestones (the same section its page's Journey tab uses) to edit. */
function JourneyPane({ children, carryover }: { children: Game[]; carryover: number }) {
  return (
    <div className="flex flex-col gap-4">
      {carryover > 0 && (
        <p className="px-1 text-[11px] text-subtle">
          {formatPlaytime(carryover)} was logged on the single card before it was expanded —
          those hours belong to the bundle, not any one game below.
        </p>
      )}
      <BundleTimeline games={children} />
      {children.map((c) => (
        <section key={c.id} className="rounded-xl border border-line bg-panel/30 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="min-w-0 truncate font-display text-base text-ink">{c.title}</h3>
            <button
              type="button"
              onClick={() => {
                window.location.hash = gameHash(c.id);
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted transition hover:border-brand/50 hover:text-ink"
            >
              Open game page
            </button>
          </div>
          <MilestonesSection game={c} />
        </section>
      ))}
    </div>
  );
}

/** The whole bundle's story in one timeline (issue 86fc0b4b): every game's
 *  milestones in date order, each labeled with its game. Read-only — dates are
 *  edited in each game's own section below. Re-fetched whenever a game changes
 *  status, so a start or finish made on this page shows up straight away. */
function BundleTimeline({ games }: { games: Game[] }) {
  const fetchGameMilestones = useStore((s) => s.fetchGameMilestones);
  const [rows, setRows] = useState<GameMilestone[] | null>(null);
  const statusKey = games.map((g) => `${g.id}:${g.status}:${g.finishTag ?? ""}`).join(",");

  useEffect(() => {
    let active = true;
    void Promise.all(games.map((g) => fetchGameMilestones(g.id))).then((lists) => {
      if (active) setRows(sortMilestones(lists.flat()));
    });
    return () => {
      active = false;
    };
    // statusKey stands in for `games`: refetch on a status move, not on every
    // unrelated edit (hours, notes) that hands us new game objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey, fetchGameMilestones]);

  const titles = new Map(games.map((g) => [g.id, g.title]));
  return (
    <section className="rounded-xl border border-line bg-panel/30 p-3">
      <h3 className="mb-2 inline-flex items-center gap-1.5 font-display text-base text-ink">
        <MilestoneIcon size={15} className="text-accent" /> Bundle timeline
      </h3>
      {rows === null ? (
        <p className="text-xs text-subtle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-subtle">
          Nothing yet — starting and finishing the games here records their milestones.
        </p>
      ) : (
        <ol className="flex flex-col gap-1" aria-label="Bundle timeline">
          {rows.map((m) => {
            const meta = MILESTONE_KINDS.find((k) => k.value === m.kind);
            return (
              <li key={m.id} className="flex min-w-0 items-center gap-2 text-sm">
                <span className={"h-2 w-2 shrink-0 rounded-full " + (meta?.dotClass ?? "bg-subtle")} />
                <span className="shrink-0 font-mono text-xs text-subtle">{m.occurredOn}</span>
                <span className="shrink-0 text-ink">{milestoneLabel(m.kind)}</span>
                <span className="min-w-0 truncate text-muted">{titles.get(m.gameId)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
