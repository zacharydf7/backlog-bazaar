import { useCallback, useEffect, useRef, useState } from "react";
import {
  History,
  Gamepad2,
  Trophy,
  Repeat,
  Undo2,
  Lightbulb,
  Wrench,
  Scroll,
  Stamp,
  Wallet as WalletIcon,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import {
  ledgerLabel,
  deltaTone,
  formatDelta,
  matchesFilter,
  LEDGER_FILTERS,
  type LedgerFilter,
  type Tone,
} from "../lib/transactions";
import type { LedgerEntry } from "../types";

// The Universal Transaction Ledger: a read-only, immutable
// bank statement of every coin/charter movement, newest-first. The rows are
// fetched page-by-page from the store (cloud: coin_events; guest: the local
// mirror); this component only filters, paginates, and renders them.

/** A small icon per event kind, for at-a-glance scanning. */
const KIND_ICON: Record<string, LucideIcon> = {
  opening: WalletIcon,
  purchase: Gamepad2,
  bounty: Trophy,
  replay_bonus: Repeat,
  shelve_refund: Undo2,
  submission_reward: Lightbulb,
  admin_adjust: Wrench,
  charter_buy: Scroll,
  charter_sell: Scroll,
  charter_consume: Stamp,
};

const TONE_CLASS: Record<Tone, string> = {
  income: "text-success",
  expense: "text-danger",
  neutral: "text-muted",
};

function formatWhen(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TransactionLedger() {
  const fetchLedger = useStore((s) => s.fetchLedger);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [offset, setOffset] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Load the first page on mount. Filtering happens client-side over what's been
  // loaded, so changing the filter never refetches.
  const loadMore = useCallback(async () => {
    setLoading(true);
    const { entries: page, done: noMore } = await fetchLedger(offset);
    setEntries((prev) => [...prev, ...page]);
    setOffset((o) => o + page.length);
    setDone(noMore);
    setLoading(false);
  }, [fetchLedger, offset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLedger(0).then(({ entries: page, done: noMore }) => {
      if (cancelled) return;
      setEntries(page);
      setOffset(page.length);
      setDone(noMore);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchLedger]);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || done) return;
    const obs = new IntersectionObserver(
      (es) => {
        if (es[0]?.isIntersecting && !loading) loadMore();
      },
      { rootMargin: "200px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [done, loading, loadMore]);

  const shown = entries.filter((e) => matchesFilter(e, filter));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="inline-flex items-center gap-2 font-display text-2xl tracking-tight text-ink">
          <History size={22} className="text-accent" /> Transaction Ledger
        </h2>
        <p className="mt-1 text-sm text-muted">
          A permanent, read-only record of every coin you&apos;ve earned and spent.
        </p>
      </div>

      {/* Income / expense / currency filters. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {LEDGER_FILTERS.map((f) => {
          const on = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              aria-pressed={on}
              className={
                "rounded-lg border px-3 py-1.5 text-sm transition " +
                (on
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-panel text-muted hover:text-ink")
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {shown.length === 0 && !loading ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line py-16 text-center">
          <p className="font-display text-xl text-ink">
            {entries.length === 0 ? "No transactions yet" : "Nothing matches this filter"}
          </p>
          <p className="max-w-md text-sm text-muted">
            {entries.length === 0
              ? "Buy, finish, or shelve a game and it'll show up here."
              : "Try a different filter to see more of your history."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((e) => (
            <LedgerRow key={e.id} entry={e} />
          ))}
        </ul>
      )}

      {/* Sentinel + status. */}
      {!done && <div ref={sentinel} aria-hidden="true" className="h-px" />}
      {loading && <p className="py-2 text-center text-sm text-subtle">Loading…</p>}
      {done && shown.length > 0 && (
        <p className="py-2 text-center text-xs text-subtle">That&apos;s your full history.</p>
      )}
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const Icon = KIND_ICON[entry.kind] ?? History;
  const hasCoin = entry.coinDelta !== 0;
  const hasCharter = entry.charterDelta !== 0;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-accent">
        <Icon size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{ledgerLabel(entry)}</p>
        <p className="truncate text-xs text-muted">
          {entry.gameTitle ? <span>{entry.gameTitle} · </span> : null}
          {formatWhen(entry.createdAt)}
        </p>
        {entry.label && entry.kind !== "opening" && (
          <p className="truncate text-xs text-subtle">{entry.label}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {/* Net change — each currency coloured by its own sign. */}
        <div className="flex items-center gap-2 font-display text-sm font-semibold">
          {hasCoin && (
            <span className={"inline-flex items-center gap-1 " + TONE_CLASS[deltaTone(entry.coinDelta)]}>
              {formatDelta(entry.coinDelta)} <CoinIcon size={13} />
            </span>
          )}
          {hasCharter && (
            <span
              className={"inline-flex items-center gap-1 " + TONE_CLASS[deltaTone(entry.charterDelta)]}
            >
              {formatDelta(entry.charterDelta)} <Scroll size={13} />
            </span>
          )}
          {!hasCoin && !hasCharter && <span className="text-muted">—</span>}
        </div>
        {/* Running balance, exactly as it stood after this transaction. */}
        {entry.coinBalanceAfter != null && (
          <span className="inline-flex items-center gap-1 text-[11px] text-subtle">
            <CoinIcon size={11} /> {entry.coinBalanceAfter}
          </span>
        )}
      </div>
    </li>
  );
}
