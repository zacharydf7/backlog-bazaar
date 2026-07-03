import { useMemo, useState } from "react";
import { Link2, Unlink, Search, X, Library, Clock, Banknote, Check, Users, Gamepad2, ChevronRight } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { familyMembers, familySiblings, familyStats, familyName } from "../lib/families";
import { gameOwnedPlatforms } from "../lib/bazaarView";
import { formatPlaytime } from "../lib/playtime";
import { formatUsd } from "../lib/copies";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

const statusLabel: Record<Game["status"], string> = {
  backlog: "In Bazaar",
  playing: "Now Playing",
  finished: "Finished",
  wishlist: "Wishlist",
};

/** The dedicated "Manage Game Family" hub — a secondary modal opened from a
 *  game's detail. Lists the full family roster (every edition, including the one
 *  you opened) with the tools to link more editions, unlink any of them, and name
 *  the family. Acts immediately against the store (no Save step for link/unlink).
 *  Owner-only; reads live from the store so the roster updates as you edit.
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
  const { games, linkGames, unlinkGame, setFamilyName } = useStore();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  useScrollLock(true);
  useHistoryDismiss(true, onClose); // Back closes the hub instead of leaving the page

  // Resolve the live game so the roster reflects link/unlink immediately.
  const live = games.find((g) => g.id === game.id) ?? game;
  const members = familyMembers(games, live);
  const siblings = familySiblings(games, live);
  const linked = siblings.length > 0;
  const stats = familyStats(members);
  const currentName = familyName(members);
  const [nameDraft, setNameDraft] = useState(currentName);

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

  return (
    // No backdrop click-to-close: like the other modals, this holds in-progress
    // management, so close only via the ✕ or browser Back. Sits above the detail
    // modal (z-[60]).
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8">
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
            Group other versions of this title — remasters, ports, re-releases — to track combined
            time &amp; cost. Each edition still lives on its own board.
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
                  Shown as the family name in details. Leave blank to use the edition&apos;s own name.
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
                        {isSelf && (
                          <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
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
                      <button
                        type="button"
                        onClick={() => unlinkGame(m.id)}
                        title={`Unlink ${m.title}`}
                        className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted transition hover:bg-danger/10 hover:text-danger"
                      >
                        <Unlink size={12} /> Unlink
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {adding ? (
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
                        onClick={() => {
                          void linkGames(live.id, c.id);
                          setQuery("");
                          setAdding(false);
                        }}
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
