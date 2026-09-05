import { useEffect, useId, useMemo, useState } from "react";
import {
  BadgePercent,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Gem,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useStore, type SubscriptionInput } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { gameHash } from "../lib/route";
import { formatUsd } from "../lib/copies";
import { formatPlaytime } from "../lib/playtime";
import { formatRate, usd } from "../lib/valueMetrics";
import {
  CADENCES,
  formatIsoDate,
  formatPeriod,
  groupMemberships,
  isLinkedGame,
  localIsoDate,
  membershipReport,
  renewalPhrase,
  type Membership,
  type MembershipReport,
  type MembershipSession,
  type Subscription,
} from "../lib/subscriptions";
import { ConfirmDialog } from "./ConfirmDialog";

/** Create / edit one plan. A plan is one price at one cadence from one start
 *  date — a price change or tier upgrade is "end this plan, add the new one",
 *  so the price history stays intact (the page explains this beside the
 *  end-date field). */
function PlanModal({
  plan,
  defaultProvider,
  onClose,
}: {
  /** The plan being edited, or null to create one. */
  plan: Subscription | null;
  /** Pre-fills the service when adding a second plan to a membership. */
  defaultProvider?: string;
  onClose: () => void;
}) {
  useScrollLock(true);
  useHistoryDismiss(true, onClose);
  const saveSubscription = useStore((s) => s.saveSubscription);
  const deleteSubscription = useStore((s) => s.deleteSubscription);
  const serviceList = useStore((s) => s.serviceList);
  const subscriptions = useStore((s) => s.subscriptions);
  const servicesDlId = useId();

  const [provider, setProvider] = useState(plan?.provider ?? defaultProvider ?? "");
  const [price, setPrice] = useState(plan ? String(plan.price) : "");
  const [cadence, setCadence] = useState<Subscription["cadence"]>(plan?.cadence ?? "yearly");
  const [startedOn, setStartedOn] = useState(plan?.startedOn ?? localIsoDate(Date.now()));
  const [ended, setEnded] = useState(plan?.endedOn != null);
  const [endedOn, setEndedOn] = useState(plan?.endedOn ?? localIsoDate(Date.now()));
  const [note, setNote] = useState(plan?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Your own services first (the ones a copy most likely names), then the
  // curated registry — deduplicated case-insensitively.
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of [...subscriptions.map((s) => s.provider), ...serviceList]) {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name.trim());
    }
    return out;
  }, [subscriptions, serviceList]);

  const priceNum = Number(price);
  const valid =
    provider.trim().length > 0 &&
    price.trim().length > 0 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    startedOn.length === 10 &&
    (!ended || (endedOn.length === 10 && endedOn >= startedOn));

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    const input: SubscriptionInput = {
      id: plan?.id,
      provider,
      price: priceNum,
      cadence,
      startedOn,
      endedOn: ended ? endedOn : null,
      note,
    };
    const ok = await saveSubscription(input);
    setSaving(false);
    if (ok) onClose();
  }

  const field =
    "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <form
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
          <CreditCard size={18} className="text-accent" /> {plan ? "Edit plan" : "Add a plan"}
        </h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-subtle">Service</span>
          <input
            autoFocus={!plan}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            list={servicesDlId}
            placeholder="PlayStation Plus Premium"
            aria-label="Service"
            className={field}
          />
          <datalist id={servicesDlId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <span className="text-[11px] text-subtle">
            Games link by this exact name: a copy marked “subscription” with this service, or a
            purchase whose member discount names it.
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-subtle">Price</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">
                $
              </span>
              <input
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="159.99"
                aria-label="Price"
                className={field + " pl-6"}
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-subtle">Billed</span>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as Subscription["cadence"])}
              aria-label="Billing cadence"
              className={field}
            >
              {CADENCES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-subtle">Started on</span>
          <input
            type="date"
            value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)}
            aria-label="Started on"
            className={field}
          />
          <span className="text-[11px] text-subtle">
            The day you first paid. Renewals count from here — every{" "}
            {CADENCES.find((c) => c.value === cadence)?.per} on the same day.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={ended}
            onChange={(e) => setEnded(e.target.checked)}
            className="accent-[var(--brand)]"
          />
          This plan has ended (cancelled or changed)
        </label>
        {ended && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-subtle">Ended on</span>
            <input
              type="date"
              value={endedOn}
              min={startedOn}
              onChange={(e) => setEndedOn(e.target.value)}
              aria-label="Ended on"
              className={field}
            />
            <span className="text-[11px] text-subtle">
              Changed tier or price? End this plan and add the new one — what you paid so far
              stays on the record.
            </span>
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-subtle">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Annual, bought on sale"
            aria-label="Note"
            className={field}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {plan ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted transition hover:text-danger"
            >
              <Trash2 size={13} /> Delete plan
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || saving}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : plan ? "Save" : "Add plan"}
            </button>
          </div>
        </div>
      </form>
      {confirmingDelete && plan && (
        <ConfirmDialog
          title="Delete this plan?"
          body={
            <>
              Removes the {plan.provider} plan from your subscriptions. Your games and their
              copies are untouched — only the plan record goes.
            </>
          }
          confirmLabel="Delete"
          tone="danger"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            void deleteSubscription(plan.id).then((ok) => {
              if (ok) onClose();
            });
          }}
        />
      )}
    </div>
  );
}

/** The gem chip a membership wears once it has paid for itself — the same
 *  Well Spent badge a purchase earns, with the membership math in the tooltip. */
function MembershipBadge({ report, target }: { report: MembershipReport; target: number }) {
  const v = report.verdict;
  if (!v || !v.met) return null;
  const parts = [`${formatPlaytime(v.hours)} × ${formatRate(target)} = ${usd(v.valuePlayed)} played`];
  if (v.savings > 0) parts.push(`${usd(v.savings)} saved`);
  return (
    <span
      title={`Goal met: ${parts.join(" + ")} vs ${usd(v.paid)} paid`}
      className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success"
    >
      <Gem size={10} /> Well spent
    </span>
  );
}

function MembershipCard({
  membership,
  report,
  target,
  today,
  loading,
  onEditPlan,
  onAddPlan,
}: {
  membership: Membership;
  report: MembershipReport;
  target: number | null;
  today: string;
  loading: boolean;
  onEditPlan: (plan: Subscription) => void;
  onAddPlan: () => void;
}) {
  const [open, setOpen] = useState(false);
  const v = report.verdict;
  const renewal = renewalPhrase(membership.nextRenewal, today);
  const current = report.periods.find((p) => p.period.current) ?? null;
  const linkedCount = report.games.filter((r) => isLinkedGame(r.game, membership.key)).length;
  const progress =
    v && v.paid > 0 ? Math.max(0, Math.min(1, v.valueDelivered / v.paid)) : null;
  const active = membership.activePlan;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="inline-flex flex-wrap items-center gap-2 font-display text-lg text-ink">
            {membership.provider}
            {membership.active ? (
              target != null && <MembershipBadge report={report} target={target} />
            ) : (
              <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] font-medium text-subtle">
                Ended
              </span>
            )}
          </h3>
          <p className="text-xs text-muted">
            {active ? (
              <>
                {formatUsd(active.price)} / {CADENCES.find((c) => c.value === active.cadence)?.per}
                {renewal && <> · {renewal}</>}
              </>
            ) : (
              <>Last plan ended {formatIsoDate(membership.plans[0].endedOn ?? today)}</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-muted transition hover:text-ink"
        >
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {open ? "Less" : "Details"}
        </button>
      </div>

      {/* Headline numbers: paid vs delivered, judged when a target is set. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink">
        <span>
          <span className="text-muted">Paid so far</span> {formatUsd(membership.paid)}
        </span>
        <span>
          <span className="text-muted">Played</span>{" "}
          {loading ? "…" : formatPlaytime(report.hours)}
        </span>
        {report.savings > 0 && (
          <span className="inline-flex items-center gap-1">
            <BadgePercent size={13} className="text-accent/70" />
            <span className="text-muted">Saved</span> {formatUsd(report.savings)}
          </span>
        )}
        {v && v.costPerHour != null && (
          <span>
            <span className="text-muted">Net</span> {formatRate(v.costPerHour)}
          </span>
        )}
        <span className="text-muted">
          {linkedCount} {linkedCount === 1 ? "game" : "games"}
          {report.neverPlayed > 0 && <> · {report.neverPlayed} never played</>}
        </span>
      </div>
      {v && progress != null && (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className={"h-full rounded-full " + (v.met ? "bg-success" : "bg-brand")}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-subtle">
            {v.met
              ? `Paid for itself: ${usd(v.valueDelivered)} of value from ${usd(v.paid)} paid.`
              : `${usd(v.valueDelivered)} of ${usd(v.paid)} earned back at ${formatRate(target ?? 0)} — about ${formatPlaytime(v.remainingHours)} to go.`}
          </p>
        </div>
      )}
      {current && (
        <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <CalendarClock size={13} className="shrink-0 text-accent/70" />
          <span>
            This period ({formatPeriod(current.period)}):{" "}
            {loading ? "…" : formatPlaytime(current.hours)} played
            {current.added.length > 0 && (
              <>
                , {current.added.length} {current.added.length === 1 ? "game" : "games"} added
              </>
            )}
            {current.savings > 0 && <>, {formatUsd(current.savings)} saved</>}
            {current.met != null && (
              <> · {current.met ? "paid off" : `${usd(current.period.price)} to earn back`}</>
            )}
          </span>
        </p>
      )}

      {open && (
        <div className="flex flex-col gap-4 border-t border-line pt-3">
          {/* Plans: each price/cadence stretch, editable. */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-subtle">Plans</span>
              <button
                type="button"
                onClick={onAddPlan}
                className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-muted transition hover:text-ink"
              >
                <Plus size={11} /> New plan
              </button>
            </div>
            {membership.plans.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel/50 px-3 py-2 text-xs text-ink"
              >
                <span>
                  {formatUsd(p.price)} / {CADENCES.find((c) => c.value === p.cadence)?.per} ·{" "}
                  {formatIsoDate(p.startedOn)}
                  {p.endedOn ? <> – {formatIsoDate(p.endedOn)}</> : <> – ongoing</>}
                  {p.note && <span className="text-subtle"> · {p.note}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onEditPlan(p)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted transition hover:text-ink"
                >
                  <Pencil size={11} /> Edit
                </button>
              </div>
            ))}
          </div>

          {/* Renewal periods, newest first. */}
          {report.periods.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-subtle">
                Renewal periods
              </span>
              <ul className="flex flex-col gap-1">
                {report.periods.map((row) => (
                  <li
                    key={`${row.period.start}-${row.period.index}`}
                    className={
                      "flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-1 text-xs " +
                      (row.period.current ? "bg-panel/60 text-ink" : "text-muted")
                    }
                  >
                    <span className="min-w-0 flex-1 basis-40">{formatPeriod(row.period)}</span>
                    <span>{formatUsd(row.period.price)}</span>
                    <span>{loading ? "…" : formatPlaytime(row.hours)}</span>
                    <span>
                      {row.added.length} added
                    </span>
                    {row.savings > 0 && <span>{formatUsd(row.savings)} saved</span>}
                    {row.met != null && (
                      <span className={row.met ? "text-success" : "text-subtle"}>
                        {row.met ? "✓ paid off" : "not yet"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {report.untrackedHours > 0 && (
                <p className="text-[11px] text-subtle">
                  {formatPlaytime(report.untrackedHours)} logged before period tracking (or as a
                  one-time import) counts toward the total but no single period.
                </p>
              )}
            </div>
          )}

          {/* Linked games, most-played first. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-subtle">Games</span>
            {report.games.length === 0 ? (
              <p className="text-xs text-subtle">
                No games yet. Mark a copy as “subscription” with this service (game page →
                Library), or record a member discount on a purchase, and it shows up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {report.games.map((r) => (
                  <li key={r.game.id}>
                    <button
                      type="button"
                      onClick={() => {
                        window.location.hash = gameHash(r.game.id);
                      }}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-1 text-left text-xs text-ink transition hover:bg-panel/60"
                    >
                      <span className="min-w-0 flex-1 basis-40 truncate">{r.game.title}</span>
                      {isLinkedGame(r.game, membership.key) ? (
                        <span className={r.hours > 0 ? "" : "text-subtle"}>
                          {loading ? "…" : r.hours > 0 ? formatPlaytime(r.hours) : "never played"}
                        </span>
                      ) : (
                        <span className="text-subtle">purchased</span>
                      )}
                      {r.savings > 0 && (
                        <span className="inline-flex items-center gap-1 text-muted">
                          <BadgePercent size={11} /> {formatUsd(r.savings)} saved
                        </span>
                      )}
                      {r.lastPlayed && (
                        <span className="text-subtle">last {formatIsoDate(r.lastPlayed)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** The Subscriptions page: every membership you pay for, what it has cost so
 *  far, and what it has given back — hours on the games you hold through it
 *  (judged at your target cost per hour, like Well Spent) plus the member
 *  discounts it earned on purchases. Renewal periods are derived from each
 *  plan's start date, so "this period" needs no bookkeeping. */
export function SubscriptionsPage() {
  const cloud = useStore((s) => s.cloud);
  const subscriptions = useStore((s) => s.subscriptions);
  const games = useStore((s) => s.games);
  const targetCostPerHour = useStore((s) => s.targetCostPerHour);
  const fetchSubscriptions = useStore((s) => s.fetchSubscriptions);
  const fetchMembershipSessions = useStore((s) => s.fetchMembershipSessions);

  const [modal, setModal] = useState<{ plan: Subscription | null; provider?: string } | null>(null);
  const [sessions, setSessions] = useState<MembershipSession[] | null>(null);

  const today = localIsoDate(Date.now());
  const memberships = useMemo(() => groupMemberships(subscriptions, today), [subscriptions, today]);

  // Every game holding a subscription copy of ANY tracked membership — the
  // set whose sessions the reports attribute. Keyed by id list so the fetch
  // only re-runs when the linked set actually changes.
  const linkedIds = useMemo(() => {
    const ids = games
      .filter((g) => g.status !== "wishlist" && memberships.some((m) => isLinkedGame(g, m.key)))
      .map((g) => g.id)
      .sort();
    return ids.join(",");
  }, [games, memberships]);

  useEffect(() => {
    if (cloud) void fetchSubscriptions();
  }, [cloud, fetchSubscriptions]);

  useEffect(() => {
    if (!cloud) return;
    let cancelled = false;
    const ids = linkedIds ? linkedIds.split(",") : [];
    if (ids.length === 0) {
      setSessions([]);
      return;
    }
    setSessions(null);
    void fetchMembershipSessions(ids).then((rows) => {
      if (!cancelled) setSessions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [cloud, linkedIds, fetchMembershipSessions]);

  const reports = useMemo(
    () =>
      memberships.map((m) =>
        membershipReport(m, games, sessions ?? [], targetCostPerHour, today),
      ),
    [memberships, games, sessions, targetCostPerHour, today],
  );

  if (!cloud) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
        Subscriptions live on your account — sign in to track what your memberships give back.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl tracking-tight text-ink">Subscriptions</h2>
        <button
          onClick={() => setModal({ plan: null })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105"
        >
          <Plus size={15} /> Add a plan
        </button>
      </div>

      {targetCostPerHour == null && memberships.length > 0 && (
        <p className="rounded-xl border border-line bg-panel/50 px-3 py-2 text-xs text-muted">
          Set a <strong className="text-ink">target cost per hour</strong> in{" "}
          <a href="#account" className="text-accent underline-offset-2 hover:underline">
            Account
          </a>{" "}
          to see whether each membership has paid for itself — the same rule Well Spent uses.
        </p>
      )}

      {memberships.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <CreditCard size={28} className="text-accent" />
          <p className="max-w-md text-sm text-muted">
            Track a membership (PS Plus, Game Pass, Switch Online…) and every game you hold
            through it — copies marked “subscription” with that service — counts its hours
            toward what the membership gives back, period by period. Member-exclusive discounts
            on purchases count too.
          </p>
          <button
            onClick={() => setModal({ plan: null })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105"
          >
            <Plus size={15} /> Add your first plan
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {reports.map((report) => (
            <MembershipCard
              key={report.membership.key}
              membership={report.membership}
              report={report}
              target={targetCostPerHour}
              today={today}
              loading={sessions == null}
              onEditPlan={(plan) => setModal({ plan })}
              onAddPlan={() => setModal({ plan: null, provider: report.membership.provider })}
            />
          ))}
        </div>
      )}

      {modal && (
        <PlanModal
          plan={modal.plan}
          defaultProvider={modal.provider}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
