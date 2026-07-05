import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, Unlink, Search, X, Library, Clock, Banknote, Check, Users, Gamepad2, ChevronRight, Crown } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { familyMembers, familySiblings, familyStats, familyName, familyPrimary } from "../lib/families";
import type { UnifiedFamily } from "../lib/familyGrouping";
import { gameOwnedPlatforms } from "../lib/bazaarView";
import { formatPlaytime } from "../lib/playtime";
import { formatUsd } from "../lib/copies";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { ChangePrimaryModal } from "./ChangePrimaryModal";
import { ConfirmDialog } from "./ConfirmDialog";

const statusLabel: Record<Game["status"], string> = {
  backlog: "In Bazaar",
  playing: "Now Playing",
  finished: "Finished",
  wishlist: "Wishlist",
};

/** The dedicated "Manage Game Family" hub — a secondary modal opened from the
 *  unified card's badge/menu or an unlinked game's "Link editions". Lists the
 *  full roster (the primary wears a crown), with the tools to link more
 *  editions, unlink any of them, rename the family, reassign the primary, or
 *  sever the whole link. Creating a brand-new family prompts for the primary
 *  member before the link saves — the unified card needs to know which edition
 *  it renders and routes data to. Owner-only; reads live from the store.
 *  `onJump` (when given) makes sibling rows clickable to open that edition's
 *  own detail — the caller closes this hub and re-targets its detail modal. */
export function FamilyHub({
  game,
  onClose,
  onJump,
}: {
  game: Game;
  onClose: () => void;
  onJump?: (member: Game) => void;
}) {
  const { games, linkGames, unlinkGame, setFamilyName, severFamily } = useStore();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  // Creating a NEW family: the picked candidate waits here while the user
  // designates the primary (the link only saves with one).
  const [pendingLink, setPendingLink] = useState<Game | null>(null);
  const [changePrimary, setChangePrimary] = useState(false);
  const [confirmSever, setConfirmSever] = useState(false);

  useScrollLock(true);
  useHistoryDismiss(true, onClose); // Back closes the hub instead of leaving the page

  // Resolve the live game so the roster reflects link/unlink immediately.
  const live = games.find((g) => g.id === game.id) ?? game;
  const members = familyMembers(games, live);
  const siblings = familySiblings(games, live);
  const linked = siblings.length > 0;
  const stats = familyStats(members);
  const currentName = familyName(members);
  const primary = linked ? familyPrimary(members) : null;
  const [nameDraft, setNameDraft] = useState(currentName);

  const unified: UnifiedFamily | null =
    linked && live.familyId != null && primary != null
      ? {
          familyId: live.familyId,
          members,
          primary,
          board: primary.status,
          name: currentName,
        }
      : null;

  // Candidates: any other game not already in this family, matched by title.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games
      .filter(
        (g) =>
          g.id !== live.id &&
          !(live.familyId != null && g.familyId === live.familyId) &&
          (q === "" || g.title.toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [games, live.id, live.familyId, query]);

  const pickCandidate = (c: Game) => {
    if (linked) {
      // The family already has a primary — the new edition just joins.
      void linkGames(live.id, c.id);
      setQuery("");
      setAdding(false);
    } else {
      // A brand-new family: designate the primary before the link saves.
      setPendingLink(c);
    }
  };

  const linkWithPrimary = (primaryId: string) => {
    if (!pendingLink) return;
    void linkGames(live.id, pendingLink.id, primaryId);
    setPendingLink(null);
    setQuery("");
    setAdding(false);
  };

  return (
    // No backdrop click-to-close: like the other modals, this holds in-progress
    // management, so close only via the ✕ or browser Back. Sits above the detail
    // modal (z-[60]).
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8">
      {changePrimary &&
        unified &&
        createPortal(
          <ChangePrimaryModal family={unified} onClose={() => setChangePrimary(false)} />,
          document.body,
        )}
      {confirmSever &&
        unified &&
        createPortal(
          <ConfirmDialog
            title="Sever this family link?"
            confirmLabel="Sever link"
            body={
              <>
                The <span className="font-medium text-ink">{unified.name}</span> Family dissolves
                and its <span className="font-medium text-ink">{unified.members.length}</span>{" "}
                editions return to your library as individual, standalone cards. Nothing else
                changes — every edition keeps its status, hours and history.
              </>
            }
            onConfirm={() => {
              setConfirmSever(false);
              void severFamily(unified.familyId);
              onClose();
            }}
            onCancel={() => setConfirmSever(false)}
          />,
          document.body,
        )}
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
            <Users size={18} className="text-accent" /> Manage Game Family
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto p-4">
          <p className="text-xs text-subtle">
            Group other versions of this title — remasters, ports, re-releases — into ONE card.
            The family card is the primary edition&apos;s: its board, its box art, its buttons.
            Playtime and milestones route to the primary; the other editions wait hidden until
            you change the primary or sever the link.
          </p>

          {linked && (
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-2.5">
              <label className="mb-2 block">
                <span className="mb-1 block text-[11px] text-accent">Family name</span>
                <div className="flex gap-2">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder={currentName}
                    aria-label="Family name"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                  />
                  <button
                    type="button"
                    onClick={() => live.familyId && void setFamilyName(live.familyId, nameDraft)}
                    disabled={nameDraft.trim() === currentName}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
                  >
                    <Check size={13} /> Save
                  </button>
                </div>
                <span className="mt-1 block text-[10px] text-subtle">
                  Shown on the family card. Leave blank to use the primary edition&apos;s name.
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-accent">
                <span className="inline-flex items-center gap-1 font-medium">
                  <Library size={12} /> Family of {stats.count}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} /> {formatPlaytime(stats.totalPlayed)} total
                </span>
                {stats.totalCost > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Banknote size={12} /> {formatUsd(stats.totalCost)} spent
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Full roster — every edition, including the one you opened. */}
          {linked && (
            <div>
              <span className="mb-1 block text-sm text-muted">Editions in this family</span>
              <ul className="flex flex-col gap-1">
                {members.map((m) => {
                  const isSelf = m.id === live.id;
                  const isPrimary = primary?.id === m.id;
                  const platforms = gameOwnedPlatforms(m);
                  const canJump = !isSelf && onJump != null;
                  // Title on its own line so it can truncate (full text on
                  // hover) without ever pushing the status/platforms out.
                  const rowBody = (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={
                            "min-w-0 truncate text-sm text-ink" +
                            (canJump ? " transition group-hover:text-accent" : "")
                          }
                          title={m.title}
                        >
                          {m.title}
                        </span>
                        {isPrimary && (
                          <span
                            title="The primary edition — the family card renders this game and all card-driven data routes to it"
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                          >
                            <Crown size={10} /> Primary
                          </span>
                        )}
                        {isSelf && !isPrimary && (
                          <span className="shrink-0 rounded-full bg-panel px-1.5 py-0.5 text-[10px] text-muted">
                            This edition
                          </span>
                        )}
                        {canJump && (
                          <ChevronRight
                            size={13}
                            className="shrink-0 text-subtle opacity-0 transition group-hover:text-accent group-hover:opacity-100"
                          />
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-subtle">
                        <span className="text-muted">{statusLabel[m.status]}</span>
                        {platforms.length > 0 && (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <Gamepad2 size={10} className="shrink-0 text-accent/70" />
                            <span className="truncate" title={platforms.join(" · ")}>
                              {platforms.join(" · ")}
                            </span>
                          </span>
                        )}
                      </div>
                    </>
                  );
                  return (
                    <li
                      key={m.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-line bg-panel/50 px-2 py-1.5"
                    >
                      {canJump ? (
                        <button
                          type="button"
                          onClick={() => onJump(m)}
                          title={`Open ${m.title}`}
                          aria-label={`Open ${m.title}`}
                          className="group min-w-0 flex-1 text-left"
                        >
                          {rowBody}
                        </button>
                      ) : (
                        <div className="min-w-0 flex-1">{rowBody}</div>
                      )}
                      <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => unlinkGame(m.id)}
                          title={`Unlink ${m.title}`}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted transition hover:bg-danger/10 hover:text-danger"
                        >
                          <Unlink size={12} /> Unlink
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Family-level tools: reassign the primary, or dissolve the link. */}
          {linked && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setChangePrimary(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink transition hover:border-brand/40 hover:text-accent"
              >
                <Crown size={13} className="text-accent" /> Change primary edition…
              </button>
              <button
                type="button"
                onClick={() => setConfirmSever(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-muted transition hover:border-danger/40 hover:text-danger"
              >
                <Unlink size={13} /> Sever family link
              </button>
            </div>
          )}

          {pendingLink ? (
            // The primary designation step for a brand-new family: the link
            // saves only once one of the two editions is crowned.
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-2.5">
              <p className="mb-2 text-xs text-muted">
                Which edition is the <span className="font-medium text-ink">primary</span>? The
                family card lives on its board, wears its box art, and all playtime routes to it.
              </p>
              <div className="flex flex-col gap-1">
                {[live, pendingLink].map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => linkWithPrimary(g.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-left transition hover:border-brand/40"
                  >
                    <Crown size={13} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink" title={g.title}>
                      {g.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-subtle">{statusLabel[g.status]}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPendingLink(null)}
                className="mt-2 text-[11px] text-muted transition hover:text-ink"
              >
                Cancel — pick a different edition
              </button>
            </div>
          ) : adding ? (
            <div className="rounded-xl border border-line bg-panel p-2">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
                />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your collection…"
                  className="w-full rounded-lg border border-line bg-surface py-1.5 pl-8 pr-8 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                />
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setQuery("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle transition hover:text-ink"
                  aria-label="Close search"
                >
                  <X size={14} />
                </button>
              </div>
              <ul className="mt-2 flex max-h-52 flex-col gap-1 overflow-y-auto">
                {candidates.length === 0 ? (
                  <li className="px-1 py-2 text-xs text-subtle">
                    {games.length <= 1 ? "Add more games to link them." : "No matching games."}
                  </li>
                ) : (
                  candidates.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => pickCandidate(c)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-ink" title={c.title}>
                          {c.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-subtle">
                          {statusLabel[c.status]}
                        </span>
                        <Link2 size={13} className="shrink-0 text-accent" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink transition hover:border-brand/40 hover:text-accent"
            >
              <Link2 size={14} className="text-accent" />{" "}
              {linked ? "Link another edition" : "Link to another edition"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
