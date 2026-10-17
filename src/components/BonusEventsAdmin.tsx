import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  CalendarDays,
  Play,
  SkipForward,
  Undo2,
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
    // Used once a monthly pattern is picked: the 1st to 7th, or the 3rd weekend.
    repeatFrom: 1,
    repeatTo: 7,
    repeatWeek: 3,
    prepTip: "",
    bountyMult: 2,
    sessionMult: 1,
    rewardsMult: 1,
    startDiscountPct: 0,
    // Only used once a discount is set; 2 keeps half-price starts from being stockpiled.
    discountLimit: 2,
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
    repeatFrom: e.repeatFrom ?? 1,
    repeatTo: e.repeatTo ?? 7,
    repeatWeek: e.repeatWeek ?? 3,
    prepTip: e.prepTip,
    bountyMult: e.bountyMult,
    sessionMult: e.sessionMult,
    rewardsMult: e.rewardsMult,
    startDiscountPct: e.startDiscountPct,
    discountLimit: e.discountLimit,
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

const WEEKENDS: { value: number; label: string }[] = [
  { value: 1, label: "1st weekend" },
  { value: 2, label: "2nd weekend" },
  { value: 3, label: "3rd weekend" },
  { value: 4, label: "4th weekend" },
  { value: -1, label: "Last weekend" },
];

/** A whole number from a box, or null while it's empty or not a number. */
function wholeNumber(v: string): number | null {
  const n = Math.round(Number(v));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
}

/** Create or edit one event. */
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
  const pattern =
    draft.repeat === "month_days" || draft.repeat === "month_weekend";
  const fromEnd = draft.repeat === "month_days" && (draft.repeatFrom ?? 1) < 0;

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
        {draft.id ? "Edit event" : "New event"}
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
            <option value="monthly">Every month, same dates</option>
            <option value="month_days">Days of every month</option>
            <option value="month_weekend">A weekend of every month</option>
          </select>
        </Field>
        {draft.repeat === "month_days" && (
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-3">
            <Field label="Count days from">
              <select
                className={inputClass}
                value={fromEnd ? "end" : "start"}
                onChange={(e) =>
                  patch(
                    e.target.value === "end"
                      ? { repeatFrom: -7, repeatTo: -1 }
                      : { repeatFrom: 1, repeatTo: 7 },
                  )
                }
              >
                <option value="start">The 1st</option>
                <option value="end">The month's end</option>
              </select>
            </Field>
            {fromEnd ? (
              <Field label="Last how many days">
                <input
                  type="number"
                  min={1}
                  max={28}
                  className={inputClass}
                  value={draft.repeatFrom == null ? "" : -draft.repeatFrom}
                  onChange={(e) => {
                    const n = wholeNumber(e.target.value);
                    patch({ repeatFrom: n == null ? null : -n, repeatTo: -1 });
                  }}
                />
              </Field>
            ) : (
              <>
                <Field label="From day">
                  <input
                    type="number"
                    min={1}
                    max={28}
                    className={inputClass}
                    value={draft.repeatFrom ?? ""}
                    onChange={(e) =>
                      patch({ repeatFrom: wholeNumber(e.target.value) })
                    }
                  />
                </Field>
                <Field label="To day">
                  <input
                    type="number"
                    min={1}
                    max={28}
                    className={inputClass}
                    value={draft.repeatTo ?? ""}
                    onChange={(e) =>
                      patch({ repeatTo: wholeNumber(e.target.value) })
                    }
                  />
                </Field>
              </>
            )}
          </div>
        )}
        {draft.repeat === "month_weekend" && (
          <Field label="Which weekend (Saturday and Sunday)">
            <select
              className={inputClass}
              value={String(draft.repeatWeek ?? 3)}
              onChange={(e) => patch({ repeatWeek: Number(e.target.value) })}
            >
              {WEEKENDS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="sm:col-span-2">
          <Field label="Description (optional)">
            <textarea
              className={inputClass + " min-h-16"}
              value={draft.description}
              maxLength={500}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Shown on the board banner, the calendar and in the bell notice."
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="How to prepare (optional)">
            <input
              className={inputClass}
              value={draft.prepTip}
              maxLength={200}
              onChange={(e) => patch({ prepTip: e.target.value })}
              placeholder="Free up a Now Playing slot before it starts."
            />
          </Field>
        </div>
        <Field
          label={
            pattern
              ? "Schedule starts"
              : draft.repeat
                ? "First run starts"
                : "Starts"
          }
        >
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
        {!pattern && (
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
        )}
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
      <p className="-mt-2 text-xs text-muted">
        Optional. With every boost off, the event is a calendar note, like a
        holiday week, and pays nothing.
      </p>
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
      {draft.startDiscountPct > 0 && (
        <div className="sm:max-w-xs">
          <Field label="Discounted starts per player">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={draft.discountLimit ?? ""}
              placeholder="No limit"
              onChange={(e) =>
                patch({ discountLimit: optionalNumber(e.target.value) })
              }
            />
          </Field>
        </div>
      )}

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
        run in the site timezone, starting at midnight on pattern days, and the
        cap resets each run. Players get one bell notice per run: a heads-up in
        the two days before it starts, or a “now on” once it&apos;s running.
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
  const skipRun = useStore((s) => s.skipBonusEventRun);
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
            <CalendarDays size={18} className="text-accent" /> Events
          </h3>
          <p className="text-sm text-muted">
            Coin boosts and calendar notes, once or on a schedule. Skip a run to
            make room for a special.
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
          No events yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((e) => {
            const target = targetLabel(e);
            const repeat = repeatLabel(e);
            const boosts = boostLabels(e);
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
                    {boosts.length > 0
                      ? boosts.join(" · ")
                      : "Calendar note, no boosts"}
                    {target && ` · for ${target}`}
                    {e.playerCap != null && ` · cap ${e.playerCap}`} · paid{" "}
                    {e.paidCoins} coins to {e.players}{" "}
                    {e.players === 1 ? "player" : "players"}
                  </p>
                  {!e.archivedAt && e.runs.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {e.runs.map((r) => {
                        const day = new Date(r.start).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        );
                        return (
                          <button
                            key={r.start}
                            type="button"
                            aria-label={
                              r.skipped
                                ? `Bring back the ${day} run`
                                : `Skip the ${day} run`
                            }
                            title={
                              r.skipped
                                ? "Bring this run back"
                                : "Skip this run"
                            }
                            onClick={async () => {
                              if (await skipRun(e.id, r.start, !r.skipped))
                                void reload();
                            }}
                            className={
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition " +
                              (r.skipped
                                ? "border-dashed border-line text-subtle line-through hover:text-ink"
                                : "border-line text-ink hover:border-brand")
                            }
                          >
                            {r.skipped ? (
                              <Undo2 size={11} />
                            ) : (
                              <SkipForward size={11} />
                            )}
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  )}
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
