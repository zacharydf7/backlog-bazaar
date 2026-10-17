import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Coins,
  Play,
} from "lucide-react";
import { useStore } from "../store";
import {
  bonusEventDraftProblem,
  boostLabels,
  repeatLabel,
  targetLabel,
  type AdminBonusEvent,
  type BonusEventDraft,
  type BonusEventRepeat,
} from "../lib/bonusEvents";
import { fromLocalDateTime, toLocalDateTime } from "../lib/cosmeticsPreview";

const inputClass =
  "w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand";

/** A new event defaults to this coming weekend, Saturday to Monday midnight. */
function blankDraft(): BonusEventDraft {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7 || 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return {
    id: null,
    name: "",
    description: "",
    startsAt: start.getTime(),
    endsAt: end.getTime(),
    repeat: null,
    repeatUntil: null,
    bountyMult: 2,
    sessionMult: 1,
    rewardsMult: 1,
    startDiscountPct: 0,
    genres: [],
    platforms: [],
    offMainPlatform: false,
    minHours: null,
    maxHours: null,
    playerCap: null,
  };
}

function toDraft(e: AdminBonusEvent): BonusEventDraft {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    repeat: e.repeat,
    repeatUntil: e.repeatUntil,
    bountyMult: e.bountyMult,
    sessionMult: e.sessionMult,
    rewardsMult: e.rewardsMult,
    startDiscountPct: e.startDiscountPct,
    genres: e.genres,
    platforms: e.platforms,
    offMainPlatform: e.offMainPlatform,
    minHours: e.minHours,
    maxHours: e.maxHours,
    playerCap: e.playerCap,
  };
}

/** An empty box means "no limit". */
function optionalNumber(v: string): number | null {
  return v.trim() === "" ? null : Number(v);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-ink">
      <span>{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

/** Toggle chips for picking any number of names from a list (a group, not a
 *  <label>: a label would toggle its first chip when its text is tapped). */
function ChipPicker({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div role="group" aria-label={label} className="text-sm text-ink">
      <span>{label}</span>
      <div className="mt-1 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(
                  on ? selected.filter((s) => s !== o) : [...selected, o],
                )
              }
              className={
                "rounded-full border px-2.5 py-1 text-xs transition " +
                (on
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-panel text-muted hover:text-ink")
              }
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Create or edit one coin event. */
function EventForm({
  initial,
  onDone,
}: {
  initial: BonusEventDraft;
  onDone: (saved: boolean) => void;
}) {
  const save = useStore((s) => s.saveBonusEvent);
  const genreList = useStore((s) => s.genreList);
  const platformList = useStore((s) => s.platformList);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<BonusEventDraft>) =>
    setDraft((d) => ({ ...d, ...p }));
  const problem = bonusEventDraftProblem(draft);

  // Start right away, keeping the length the form already has.
  const startNow = () => {
    const now = Date.now();
    const length =
      draft.endsAt > draft.startsAt
        ? draft.endsAt - draft.startsAt
        : 2 * 86_400_000;
    patch({ startsAt: now, endsAt: now + length });
  };

  const multiplier = (
    label: string,
    value: number,
    onChange: (v: number) => void,
  ) => (
    <Field label={label}>
      <select
        className={inputClass}
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {[1, 1.25, 1.5, 2, 3, 4, 5].map((m) => (
          <option key={m} value={m}>
            {m === 1 ? "Off" : `×${m}`}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand/40 bg-surface p-4 shadow-sm">
      <h3 className="font-display text-lg text-ink">
        {draft.id ? "Edit coin event" : "New coin event"}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            className={inputClass}
            value={draft.name}
            maxLength={80}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Double Bounty Weekend"
          />
        </Field>
        <Field label="Repeats">
          <select
            className={inputClass}
            value={draft.repeat ?? ""}
            onChange={(e) =>
              patch({
                repeat: (e.target.value || null) as BonusEventRepeat | null,
              })
            }
          >
            <option value="">Once</option>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description (optional)">
            <textarea
              className={inputClass + " min-h-16"}
              value={draft.description}
              maxLength={500}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Shown on the board banner and in the bell notice."
            />
          </Field>
        </div>
        <Field label={draft.repeat ? "First run starts" : "Starts"}>
          <div className="flex gap-1.5">
            <input
              type="datetime-local"
              className={inputClass}
              value={toLocalDateTime(
                Number.isFinite(draft.startsAt) ? draft.startsAt : null,
              )}
              onChange={(e) =>
                patch({ startsAt: fromLocalDateTime(e.target.value) ?? NaN })
              }
            />
            <button
              type="button"
              onClick={startNow}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium text-ink transition hover:bg-panel"
            >
              <Play size={12} /> Now
            </button>
          </div>
        </Field>
        <Field label={draft.repeat ? "First run ends" : "Ends"}>
          <input
            type="datetime-local"
            className={inputClass}
            value={toLocalDateTime(
              Number.isFinite(draft.endsAt) ? draft.endsAt : null,
            )}
            onChange={(e) =>
              patch({ endsAt: fromLocalDateTime(e.target.value) ?? NaN })
            }
          />
        </Field>
        {draft.repeat && (
          <Field label="Stop repeating after (optional)">
            <input
              type="datetime-local"
              className={inputClass}
              value={toLocalDateTime(draft.repeatUntil)}
              onChange={(e) =>
                patch({ repeatUntil: fromLocalDateTime(e.target.value) })
              }
            />
          </Field>
        )}
      </div>

      <p className="text-sm font-semibold text-ink">Boosts</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {multiplier("Finish bounty", draft.bountyMult, (v) =>
          patch({ bountyMult: v }),
        )}
        {multiplier("Daily Session", draft.sessionMult, (v) =>
          patch({ sessionMult: v }),
        )}
        {multiplier("Goal & medal rewards", draft.rewardsMult, (v) =>
          patch({ rewardsMult: v }),
        )}
        <Field label="Start discount %">
          <input
            type="number"
            min={0}
            max={90}
            className={inputClass}
            value={String(draft.startDiscountPct)}
            onChange={(e) =>
              patch({ startDiscountPct: Math.round(Number(e.target.value)) })
            }
          />
        </Field>
      </div>

      <p className="text-sm font-semibold text-ink">
        Which games (leave empty for all)
      </p>
      {draft.rewardsMult > 1 && (
        <p className="-mt-2 text-xs text-muted">
          Goal and medal rewards aren&apos;t tied to a game, so these filters
          don&apos;t narrow that boost.
        </p>
      )}
      <ChipPicker
        label="Genres"
        options={genreList}
        selected={draft.genres}
        onChange={(genres) => patch({ genres })}
      />
      <ChipPicker
        label="Platforms (only players who own one see the event)"
        options={platformList}
        selected={draft.platforms}
        onChange={(platforms) => patch({ platforms })}
      />
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-1"
          checked={draft.offMainPlatform}
          onChange={(e) => patch({ offMainPlatform: e.target.checked })}
        />
        <span>
          Off your main platform
          <span className="block text-xs text-muted">
            Only games on platforms other than the one each player plays most.
            One-platform players don&apos;t see the event.
          </span>
        </span>
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Shortest length (hours)">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={draft.minHours ?? ""}
            onChange={(e) =>
              patch({ minHours: optionalNumber(e.target.value) })
            }
          />
        </Field>
        <Field label="Longest length (hours)">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={draft.maxHours ?? ""}
            onChange={(e) =>
              patch({ maxHours: optionalNumber(e.target.value) })
            }
          />
        </Field>
        <Field label="Bonus cap per player (coins)">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={draft.playerCap ?? ""}
            placeholder="No cap"
            onChange={(e) =>
              patch({ playerCap: optionalNumber(e.target.value) })
            }
          />
        </Field>
      </div>

      <p className="text-xs text-muted">
        Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}. Repeats
        start at the same local site time each week or month, and the cap resets
        each run. Players get one bell notice per run: a heads-up in the two
        days before it starts, or a “now on” once it&apos;s running.
      </p>
      {problem && <p className="text-xs text-danger">{problem}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onDone(false)}
          className="rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-panel"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={problem != null || saving}
          onClick={async () => {
            setSaving(true);
            const ok = await save(draft);
            setSaving(false);
            if (ok) onDone(true);
          }}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 disabled:opacity-50"
        >
          {draft.id ? "Save changes" : "Create event"}
        </button>
      </div>
    </div>
  );
}

function statusLabel(e: AdminBonusEvent): string {
  const fmt = (t: number) =>
    new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  if (e.nextStart == null || e.nextEnd == null) return "Ended";
  return e.live
    ? `Live · until ${fmt(e.nextEnd)}`
    : `${e.repeat ? "Next run" : "Upcoming"} · ${fmt(e.nextStart)} – ${fmt(e.nextEnd)}`;
}

/** Admin tab (economy.events): every coin event with what it has paid out,
 *  plus create, edit, archive and restore. */
export function BonusEventsAdmin() {
  const fetchList = useStore((s) => s.fetchBonusEventsAdmin);
  const archive = useStore((s) => s.archiveBonusEvent);
  const [list, setList] = useState<AdminBonusEvent[] | null>(null);
  const [editing, setEditing] = useState<BonusEventDraft | null>(null);

  const reload = useCallback(
    async () => setList(await fetchList()),
    [fetchList],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <Coins size={18} className="text-accent" /> Coin events
          </h3>
          <p className="text-sm text-muted">
            Time-limited boosts: bigger bounties, Daily Session or reward coins,
            or cheaper starts.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(blankDraft())}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105"
          >
            <Plus size={15} /> New event
          </button>
        )}
      </div>

      {editing && (
        <EventForm
          key={editing.id ?? "new"}
          initial={editing}
          onDone={(saved) => {
            setEditing(null);
            if (saved) void reload();
          }}
        />
      )}

      {list == null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
          No coin events yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((e) => {
            const target = targetLabel(e);
            const repeat = repeatLabel(e.repeat, e.repeatUntil);
            return (
              <div
                key={e.id}
                className={
                  "flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 " +
                  (e.archivedAt ? "opacity-60" : "")
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {e.name}
                    {e.archivedAt && (
                      <span className="ml-2 text-[11px] font-normal text-subtle">
                        Archived
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-subtle">
                    {statusLabel(e)}
                    {repeat && ` · ${repeat}`}
                  </p>
                  <p className="text-xs text-muted">
                    {boostLabels(e).join(" · ")}
                    {target && ` · for ${target}`}
                    {e.playerCap != null && ` · cap ${e.playerCap}`} · paid{" "}
                    {e.paidCoins} coins to {e.players}{" "}
                    {e.players === 1 ? "player" : "players"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditing(toDraft(e))}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-panel"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (await archive(e.id, !e.archivedAt)) void reload();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-panel"
                  >
                    {e.archivedAt ? (
                      <ArchiveRestore size={13} />
                    ) : (
                      <Archive size={13} />
                    )}
                    {e.archivedAt ? "Restore" : "Archive"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
