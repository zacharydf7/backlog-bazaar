import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Milestone, Plus, X } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import {
  MILESTONE_KINDS,
  milestoneLabel,
  sortMilestones,
  todayISO,
  isValidMilestoneDate,
  type GameMilestone,
  type MilestoneKind,
} from "../lib/milestones";

/** The game detail's "Milestones" section: the user-curated journey timeline
 *  (Added / Started / Beat / Completed / Retired / Unretired), each row with a
 *  freely-editable, backdatable date. Auto-captured rows appear here too and
 *  are just as editable — retroactive corrections are the whole point. Acts
 *  immediately against the store (no Save step), keeps its list component-
 *  local, and only renders on the cloud (the table is the source of truth). */
export function MilestonesSection({ game }: { game: Game }) {
  const { fetchGameMilestones, addGameMilestone, updateGameMilestone, removeGameMilestone } =
    useStore();
  const [milestones, setMilestones] = useState<GameMilestone[] | null>(null);
  const [open, setOpen] = useState(false);
  const [draftKind, setDraftKind] = useState<MilestoneKind>("added");
  const [draftDate, setDraftDate] = useState(todayISO());

  useEffect(() => {
    let active = true;
    void fetchGameMilestones(game.id).then((rows) => {
      if (active) setMilestones(rows);
    });
    return () => {
      active = false;
    };
  }, [game.id, fetchGameMilestones]);

  const today = todayISO();
  const draftValid = isValidMilestoneDate(draftDate, today);
  const count = milestones?.length ?? 0;

  // Collapsed one-line summary, like the Copies header's platform list.
  const summary = useMemo(() => {
    if (!milestones || milestones.length === 0) return null;
    return milestones
      .slice(0, 3)
      .map((m) => `${milestoneLabel(m.kind)} ${m.occurredOn}`)
      .join(" · ");
  }, [milestones]);

  async function changeDate(m: GameMilestone, next: string) {
    if (next === m.occurredOn || !isValidMilestoneDate(next, today)) return;
    const prev = milestones;
    setMilestones((list) =>
      list ? sortMilestones(list.map((x) => (x.id === m.id ? { ...x, occurredOn: next } : x))) : list,
    );
    const ok = await updateGameMilestone(m.id, next);
    if (!ok) setMilestones(prev);
  }

  async function remove(m: GameMilestone) {
    const prev = milestones;
    setMilestones((list) => (list ? list.filter((x) => x.id !== m.id) : list));
    const ok = await removeGameMilestone(m.id);
    if (!ok) setMilestones(prev);
  }

  async function add() {
    if (!draftValid) return;
    const row = await addGameMilestone(game.id, draftKind, draftDate);
    if (row) setMilestones((list) => sortMilestones([...(list ?? []), row]));
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left text-sm text-muted transition hover:text-ink"
      >
        {open ? (
          <ChevronDown size={15} className="shrink-0 text-subtle" />
        ) : (
          <ChevronRight size={15} className="shrink-0 text-subtle" />
        )}
        <Milestone size={14} className="shrink-0 text-accent" />
        <span>
          Milestones
          {count > 0 && <span className="text-subtle"> ({count})</span>}
        </span>
      </button>

      {!open && summary && (
        <p className="truncate pl-[21px] text-xs text-subtle">{summary}</p>
      )}

      {open && (
        <div className="flex flex-col gap-1.5 pl-[21px]">
          {milestones === null ? (
            <p className="text-xs text-subtle">Loading…</p>
          ) : milestones.length === 0 ? (
            <p className="text-xs text-subtle">No milestones recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {milestones.map((m) => {
                const meta = MILESTONE_KINDS.find((k) => k.value === m.kind);
                return (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/50 px-2.5 py-2"
                  >
                    <span className={"h-2 w-2 shrink-0 rounded-full " + (meta?.dotClass ?? "bg-subtle")} />
                    <span className="min-w-[5.5rem] text-sm text-ink">{milestoneLabel(m.kind)}</span>
                    <input
                      type="date"
                      value={m.occurredOn}
                      max={today}
                      aria-label={`${milestoneLabel(m.kind)} date`}
                      onChange={(e) => void changeDate(m, e.target.value)}
                      className="min-w-0 rounded-lg border border-line bg-surface px-2 py-1 font-mono text-xs text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
                    />
                    {m.source !== "manual" && (
                      <span className="text-[10px] text-subtle">auto</span>
                    )}
                    <button
                      type="button"
                      onClick={() => void remove(m)}
                      title={`Remove this ${milestoneLabel(m.kind)} milestone`}
                      aria-label={`Remove this ${milestoneLabel(m.kind)} milestone`}
                      className="ml-auto rounded-md p-1 text-muted transition hover:bg-danger/10 hover:text-danger"
                    >
                      <X size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={draftKind}
              onChange={(e) => setDraftKind(e.target.value as MilestoneKind)}
              aria-label="Milestone kind"
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
            >
              {MILESTONE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={draftDate}
              max={today}
              aria-label="Milestone date"
              onChange={(e) => setDraftDate(e.target.value)}
              className="min-w-0 rounded-lg border border-line bg-surface px-2 py-1 font-mono text-xs text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={!draftValid}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-brand/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={13} /> Add milestone
            </button>
          </div>

          <span className="text-[10px] text-subtle">
            Milestones are recorded automatically the first time each one happens. Dates are yours
            to edit — backdate them to when it really happened, or add extra entries for replays
            and retire/unretire cycles. The Added date doubles as the game&apos;s acquisition date:
            its Fresh-pickup price and place in recently-added ordering follow it.
          </span>
        </div>
      )}
    </div>
  );
}
