import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Reorder, useDragControls } from "motion/react";
import {
  ArrowLeft,
  Banknote,
  BookOpen,
  CheckCircle2,
  Clock,
  Expand,
  GripVertical,
  ImagePlus,
  Map as MapIcon,
  Package,
  Pencil,
  Shrink,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Compilation, Game } from "../../types";
import { useStore } from "../../store";
import { gameHash } from "../../lib/route";
import type { PageNav, PageNavStop } from "../../lib/pageNav";
import { PageNavControls } from "./PageNavControls";
import { compilationCoverOf, orderCompilationChildren } from "../../lib/compilationGrouping";
import { compilationCopiesOf } from "../../lib/compilations";
import {
  formatLabel,
  formatUsd,
  ownedPlatformSummary,
  totalCost,
} from "../../lib/copies";
import { formatPlaytime } from "../../lib/playtime";
import { StatusBadge } from "../StatusBadge";
import { isInRotation } from "../../lib/status";
import { PlatformBadge } from "../PlatformBadge";
import { ConfirmDialog } from "../ConfirmDialog";
import { AddCompilationModal } from "../AddCompilationModal";
import { MilestonesSection } from "../MilestonesSection";

type CompilationTabId = "overview" | "journey";

const TABS: { id: CompilationTabId; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "journey", label: "Journey", icon: MapIcon },
];

/** A collapsed compilation's own page (routed: "#c/<id>") — the bundle-level
 *  counterpart to GamePage, replacing the small hub modal as the parent card's
 *  click-through. A hero identifies the bundle (cover, progress, aggregate
 *  time/spend) and carries its management actions; Overview lists every bundled
 *  game (each linking to its own page) and Journey breaks out a milestone
 *  timeline per game. Owner-only: visits never render collapsed parents, so
 *  there is no read-only variant. Like the rollup card, this is a pure data
 *  view over the children — playtime and the economy live on their pages. */
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
  const compilation = compilations.find((c) => c.id === compilationId);

  // A fresh page starts at the top (Back restores the board's position).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [compilationId]);

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
  childGames,
  onBack,
  pageNav,
  onNavigate,
}: {
  compilation: Compilation;
  childGames: Game[];
  onBack: () => void;
  pageNav?: PageNav | null;
  onNavigate?: (stop: PageNavStop) => void;
}) {
  const {
    cloud,
    setCompilationExpanded,
    setCompilationChildOrder,
    deleteCompilation,
    setCompilationParentImage,
    clearCompilationParentImage,
  } = useStore();
  const [tab, setTab] = useState<CompilationTabId>("overview");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Milestones are cloud-only (matching JourneyTab), so offline gets no Journey.
  const tabs = cloud ? TABS : TABS.filter((t) => t.id !== "journey");
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  // The children in the owner's chosen order (issue 140ac868) — the whole page
  // (cover fallback, lists, journey) reads this one order, so it always agrees
  // with the collapsed card, which orders the same way.
  const children = useMemo(
    () => orderCompilationChildren(childGames, compilation.childOrder),
    [childGames, compilation.childOrder],
  );
  const cover = compilationCoverOf(compilation, children);
  const finished = children.filter((g) => g.status === "finished").length;
  const carryover = compilation.carryoverHours ?? 0;
  const totalPlayed = children.reduce((sum, g) => sum + (g.playedHours ?? 0), 0) + carryover;
  const ownedCopySummary = ownedPlatformSummary(compilationCopiesOf(compilation));

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

      {/* Hero: identifies the bundle from every tab and carries its management
          actions, mirroring the game page's hero. */}
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
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-2 py-0.5 text-[11px] font-medium text-accent">
              <Package size={11} /> Compilation · {children.length} game
              {children.length === 1 ? "" : "s"} · {finished} finished
            </span>
          </div>

          {/* Completion toward the collapsed card moving itself to Finished. */}
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel">
              <div
                className={
                  "h-full rounded-full transition-all " +
                  (children.length > 0 && finished === children.length
                    ? "bg-success"
                    : "bg-accent")
                }
                style={{
                  width: `${children.length ? Math.round((finished / children.length) * 100) : 0}%`,
                }}
              />
            </div>
            <span className="shrink-0 font-mono text-[11px] text-subtle">
              {finished}/{children.length}
            </span>
          </div>

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

          {/* Management actions — the same set the hub modal carried. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void setCompilationExpanded(compilation.id, !compilation.expanded)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink transition hover:border-brand/50"
            >
              {compilation.expanded ? (
                <>
                  <Shrink size={14} className="text-accent" /> Collapse to one card
                </>
              ) : (
                <>
                  <Expand size={14} className="text-accent" /> Expand into cards
                </>
              )}
            </button>
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
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Compilation sections" className="flex flex-wrap gap-1.5">
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

      {active.id === "journey" ? (
        <JourneyPane children={children} carryover={carryover} />
      ) : (
        <OverviewPane
          compilation={compilation}
          children={children}
          carryover={carryover}
          cover={cover}
          cloud={cloud}
          onReorderChildren={(ids) => void setCompilationChildOrder(compilation.id, ids)}
          onUploadCover={(f) => void setCompilationParentImage(compilation.id, f)}
          onClearCover={() => void clearCompilationParentImage(compilation.id)}
        />
      )}

      {editing &&
        createPortal(
          <AddCompilationModal compilation={compilation} onClose={() => setEditing(false)} />,
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

/** The reorderable "Games in this bundle" checklist. Dragging a row's handle
 *  sets the bundle's child order (persisted); that order carries to the
 *  collapsed card's cover and to the separate cards when the bundle is split
 *  (issue 140ac868). Pointer-based drag, so it works on touch too. */
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

/** One row in the bundle checklist: a drag handle (when reorderable) plus the
 *  clickable body that opens the game's own page. Drag is handle-only
 *  (dragListener off) so a tap still navigates. */
function BundleRow({ game, draggable }: { game: Game; draggable: boolean }) {
  const controls = useDragControls();
  const done = game.status === "finished";
  const cost = totalCost(game.copies);
  const played = game.playedHours ?? 0;
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
              <span className="block truncate text-sm text-ink">{game.title}</span>
              <div className="mt-0.5">
                <StatusBadge status={game.status} rotation={isInRotation(game)} />
              </div>
            </div>
          </div>
          <div className="mt-0.5 flex shrink-0 flex-col items-end text-xs">
            <span className="text-muted">
              {played > 0 ? `${formatPlaytime(played)} played` : "—"}
            </span>
            {cost > 0 && <span className="text-subtle">{formatUsd(cost)}</span>}
          </div>
        </button>
      </div>
    </Reorder.Item>
  );
}

/** The bundle at a glance: the checklist of every game inside (each row opens
 *  that game's own page), the per-copy spend breakdown, and the collapsed-card
 *  cover controls. */
function OverviewPane({
  compilation,
  children,
  carryover,
  cover,
  cloud,
  onReorderChildren,
  onUploadCover,
  onClearCover,
}: {
  compilation: Compilation;
  children: Game[];
  carryover: number;
  cover: string | undefined;
  cloud: boolean;
  onReorderChildren: (orderedIds: string[]) => void;
  onUploadCover: (file: File) => void;
  onClearCover: () => void;
}) {
  const copies = compilationCopiesOf(compilation);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-panel/30 p-3">
        <h3 className="mb-2 font-display text-base text-ink">Games in this bundle</h3>
        <BundleGames games={children} onReorder={onReorderChildren} />
        {children.length > 1 && (
          <p className="mt-2 px-1 text-[11px] text-subtle">
            Drag the handle to reorder — this is the order the games take when the bundle is split
            into separate cards.
          </p>
        )}
        {carryover > 0 && (
          <p className="mt-2 px-1 text-[11px] text-subtle">
            Totals include {formatPlaytime(carryover)} logged on the single card before it was
            expanded.
          </p>
        )}
      </div>

      {/* Per-copy spend breakdown, like the game page's ownership rollup. */}
      {copies.length > 0 && compilation.totalCost > 0 && (
        <div className="rounded-lg bg-panel p-2 text-[11px] text-muted">
          <div className="mb-1 inline-flex items-center gap-1 text-accent">
            <Banknote size={12} /> Spent {formatUsd(compilation.totalCost)}
          </div>
          {copies.map((c) => (
            <div key={c.id} className="flex justify-between gap-2">
              <span className="truncate">
                {c.platform}
                {c.format ? ` (${formatLabel(c.format)})` : ""}
                {c.note ? ` · ${c.note}` : ""}
              </span>
              <span className="shrink-0">{c.cost ? formatUsd(c.cost) : "—"}</span>
            </div>
          ))}
        </div>
      )}

      {/* The collapsed card's cover (cosmetic and personal — never the catalog). */}
      {(cloud || compilation.parentImage) && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-panel/50 p-2.5">
          <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-panel">
            {cover ? (
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-lg opacity-50">🎮</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-ink">Collapsed-card cover</span>
            <span className="block text-[11px] text-subtle">
              Shown when the bundle folds into one card.
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
                      if (f) onUploadCover(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {compilation.parentImage && (
                <button
                  type="button"
                  onClick={onClearCover}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted transition hover:border-danger/40 hover:text-danger"
                >
                  <Trash2 size={12} /> Remove — use the first game&apos;s cover
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The bundle's play story, broken out per game: each child gets its own
 *  milestone timeline (the same section its own page's Journey tab uses).
 *  Playtime logging stays on the child pages — the bundle is a data view. */
function JourneyPane({ children, carryover }: { children: Game[]; carryover: number }) {
  return (
    <div className="flex flex-col gap-4">
      {carryover > 0 && (
        <p className="px-1 text-[11px] text-subtle">
          {formatPlaytime(carryover)} was logged on the single card before it was expanded —
          those hours belong to the bundle, not any one game below.
        </p>
      )}
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
