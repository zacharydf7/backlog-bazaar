import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Plus, Pencil, Archive, ArchiveRestore, Target } from "lucide-react";
import { useStore } from "../store";
import {
  CHALLENGE_METRICS,
  metricGoalLabel,
  seasonalDraftProblem,
  type AdminSeasonalChallenge,
  type ChallengeMetric,
  type SeasonalDraft,
} from "../lib/challenges";
import { fromLocalDateTime, toLocalDateTime } from "../lib/cosmeticsPreview";
import type { Badge } from "../types";

const inputClass =
  "w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand";

function blankDraft(): SeasonalDraft {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  // 30 calendar days, so a clock change in between doesn't shift the hour.
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  return {
    id: null,
    name: "",
    description: "",
    metric: "games_finished",
    target: 3,
    startsAt: start.getTime(),
    endsAt: end.getTime(),
    reward: 100,
    badgeId: null,
  };
}

function toDraft(c: AdminSeasonalChallenge): SeasonalDraft {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    metric: (c.metric in CHALLENGE_METRICS ? c.metric : "games_finished") as ChallengeMetric,
    target: c.target,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    reward: c.reward,
    badgeId: c.badgeId,
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-ink">
      <span>{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

/** Create or edit one seasonal event. */
function ChallengeForm({
  initial,
  badges,
  onDone,
}: {
  initial: SeasonalDraft;
  badges: Badge[];
  onDone: (saved: boolean) => void;
}) {
  const save = useStore((s) => s.saveSeasonalChallenge);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<SeasonalDraft>) => setDraft((d) => ({ ...d, ...p }));
  const problem = seasonalDraftProblem(draft);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand/40 bg-surface p-4 shadow-sm">
      <h3 className="font-display text-lg text-ink">{draft.id ? "Edit challenge" : "New seasonal challenge"}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            className={inputClass}
            value={draft.name}
            maxLength={80}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Winter Clear-Out"
          />
        </Field>
        <Field label="Goal">
          <select
            className={inputClass}
            value={draft.metric}
            onChange={(e) => patch({ metric: e.target.value as ChallengeMetric })}
          >
            {(Object.keys(CHALLENGE_METRICS) as ChallengeMetric[]).map((m) => (
              <option key={m} value={m}>
                {CHALLENGE_METRICS[m].label}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea
              className={inputClass + " min-h-16"}
              value={draft.description}
              maxLength={500}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="What players are chasing, in a sentence or two."
            />
          </Field>
        </div>
        <Field label={`Target (${CHALLENGE_METRICS[draft.metric].unit})`}>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={String(draft.target)}
            onChange={(e) => patch({ target: Number(e.target.value) })}
          />
        </Field>
        <Field label="Reward (coins)">
          <input
            type="number"
            min={0}
            max={100000}
            className={inputClass}
            value={String(draft.reward)}
            onChange={(e) => patch({ reward: Math.round(Number(e.target.value)) })}
          />
        </Field>
        <Field label="Starts">
          <input
            type="datetime-local"
            className={inputClass}
            value={toLocalDateTime(Number.isFinite(draft.startsAt) ? draft.startsAt : null)}
            onChange={(e) => patch({ startsAt: fromLocalDateTime(e.target.value) ?? NaN })}
          />
        </Field>
        <Field label="Ends">
          <input
            type="datetime-local"
            className={inputClass}
            value={toLocalDateTime(Number.isFinite(draft.endsAt) ? draft.endsAt : null)}
            onChange={(e) => patch({ endsAt: fromLocalDateTime(e.target.value) ?? NaN })}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Badge (optional)">
            <select
              className={inputClass}
              value={draft.badgeId ?? ""}
              onChange={(e) => patch({ badgeId: e.target.value || null })}
            >
              <option value="">No badge</option>
              {badges.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <p className="text-xs text-muted">
        Progress counts what each player logs between the start and end (times use{" "}
        {Intl.DateTimeFormat().resolvedOptions().timeZone}). Players can claim the reward for 35
        days after it ends.
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
          {draft.id ? "Save changes" : "Create challenge"}
        </button>
      </div>
    </div>
  );
}

function windowLabel(c: AdminSeasonalChallenge, now: number): string {
  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const phase = now < c.startsAt ? "Upcoming" : now < c.endsAt ? "Live" : "Ended";
  return `${phase} · ${fmt(c.startsAt)} – ${fmt(c.endsAt)}`;
}

/** Admin tab (challenges.manage): every seasonal event with how many players
 *  completed it, plus create, edit, archive and restore. */
export function SeasonalChallengesAdmin() {
  const fetchList = useStore((s) => s.fetchSeasonalChallengesAdmin);
  const fetchBadges = useStore((s) => s.fetchBadges);
  const archive = useStore((s) => s.archiveSeasonalChallenge);
  const [list, setList] = useState<AdminSeasonalChallenge[] | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [editing, setEditing] = useState<SeasonalDraft | null>(null);

  const reload = useCallback(async () => setList(await fetchList()), [fetchList]);

  useEffect(() => {
    void reload();
    // Only granted badges make sense as a challenge prize (shop titles are bought).
    void fetchBadges().then((all) => setBadges(all.filter((b) => b.kind === "granted")));
  }, [reload, fetchBadges]);

  const now = Date.now();
  const badgeName = (id: string | null) => badges.find((b) => b.id === id)?.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <Target size={18} className="text-accent" /> Seasonal challenges
          </h3>
          <p className="text-sm text-muted">
            Time-limited goals every player chases on their own, for coins and an optional badge.
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(blankDraft())}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105"
          >
            <Plus size={15} /> New challenge
          </button>
        )}
      </div>

      {editing && (
        <ChallengeForm
          key={editing.id ?? "new"}
          initial={editing}
          badges={badges}
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
          No seasonal challenges yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((c) => (
            <div
              key={c.id}
              className={
                "flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 " +
                (c.archivedAt ? "opacity-60" : "")
              }
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {c.name}
                  {c.archivedAt && <span className="ml-2 text-[11px] font-normal text-subtle">Archived</span>}
                </p>
                <p className="text-[11px] text-subtle">{windowLabel(c, now)}</p>
                <p className="text-xs text-muted">
                  {metricGoalLabel(c.metric, c.target)} · {c.reward} coins
                  {badgeName(c.badgeId) && ` · ${badgeName(c.badgeId)} badge`} · completed by {c.completions}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditing(toDraft(c))}
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-panel"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (await archive(c.id, !c.archivedAt)) void reload();
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-panel"
                >
                  {c.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                  {c.archivedAt ? "Restore" : "Archive"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
