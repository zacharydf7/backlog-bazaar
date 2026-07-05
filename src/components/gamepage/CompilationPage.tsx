import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Banknote,
  BookOpen,
  CheckCircle2,
  Clock,
  Expand,
  ImagePlus,
  Map,
  Package,
  Pencil,
  Shrink,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Compilation, Game } from "../../types";
import { useStore } from "../../store";
import { gameHash } from "../../lib/route";
import { compilationCoverOf } from "../../lib/compilationGrouping";
import { compilationCopiesOf } from "../../lib/compilations";
import {
  formatLabel,
  formatUsd,
  ownedPlatformSummary,
  totalCost,
} from "../../lib/copies";
import { formatPlaytime } from "../../lib/playtime";
import { StatusBadge } from "../StatusBadge";
import { PlatformBadge } from "../PlatformBadge";
import { ConfirmDialog } from "../ConfirmDialog";
import { AddCompilationModal } from "../AddCompilationModal";
import { MilestonesSection } from "../MilestonesSection";

type CompilationTabId = "overview" | "journey";

const TABS: { id: CompilationTabId; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "journey", label: "Journey", icon: Map },
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
}: {
  compilationId: string;
  onBack: () => void;
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
}: {
  compilation: Compilation;
  childGames: Game[];
  onBack: () => void;
}) {
  const {
    cloud,
    setCompilationExpanded,
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

  // Cover fallback reads the children in LIBRARY order (shared helper), so the
  // page always agrees with the collapsed card; lists below sort for display.
  const cover = compilationCoverOf(compilation, childGames);
  const children = [...childGames].sort((a, b) => a.title.localeCompare(b.title));
  const finished = children.filter((g) => g.status === "finished").length;
  const carryover = compilation.carryoverHours ?? 0;
  const totalPlayed = children.reduce((sum, g) => sum + (g.playedHours ?? 0), 0) + carryover;
  const ownedCopySummary = ownedPlatformSummary(compilationCopiesOf(compilation));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <BackButton onBack={onBack} />
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

/** The bundle at a glance: the checklist of every game inside (each row opens
 *  that game's own page), the per-copy spend breakdown, and the collapsed-card
 *  cover controls. */
function OverviewPane({
  compilation,
  children,
  carryover,
  cover,
  cloud,
  onUploadCover,
  onClearCover,
}: {
  compilation: Compilation;
  children: Game[];
  carryover: number;
  cover: string | undefined;
  cloud: boolean;
  onUploadCover: (file: File) => void;
  onClearCover: () => void;
}) {
  const copies = compilationCopiesOf(compilation);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-panel/30 p-3">
        <h3 className="mb-2 font-display text-base text-ink">Games in this bundle</h3>
        <ul className="flex flex-col gap-1">
          {children.map((c) => {
            const done = c.status === "finished";
            const cost = totalCost(c.copies);
            const played = c.playedHours ?? 0;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = gameHash(c.id);
                  }}
                  title={`Open ${c.title}`}
                  className="flex w-full items-start justify-between gap-2 rounded-lg border border-line bg-panel/50 px-2.5 py-2 text-left transition hover:border-brand/50"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {done ? (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                    ) : (
                      <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{c.title}</span>
                      <div className="mt-0.5">
                        <StatusBadge status={c.status} />
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
              </li>
            );
          })}
        </ul>
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
