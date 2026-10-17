import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { ledgerLabel } from "../lib/transactions";
import { STATS_TIMEFRAMES, timeframeRange, type StatsTimeframe } from "../lib/stats";
import {
  chartSeries,
  economyTotals,
  sourcesAndSinks,
  type EconomyHealth,
  type KindFlow,
} from "../lib/economyHealth";

const inputClass =
  "w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand";

const fmt = (v: number) => v.toLocaleString();

/** Economy health (admin, economy.insights): coins in circulation, coins in
 *  and out over a window and where they came from and went, a daily in/out
 *  chart, and each player's flows — for tuning the economy from data. */
export function EconomyHealthPanel() {
  const fetchEconomyHealth = useStore((s) => s.fetchEconomyHealth);
  const [timeframe, setTimeframe] = useState<StatsTimeframe>("month");
  const [health, setHealth] = useState<EconomyHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const { from, to } = timeframeRange(timeframe);
    void fetchEconomyHealth(from, to).then((h) => {
      if (!alive) return;
      setHealth(h);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [timeframe, fetchEconomyHealth]);

  const totals = health ? economyTotals(health) : null;
  const flows = health ? sourcesAndSinks(health) : null;
  const series = health ? chartSeries(health.daily) : [];
  const peak = Math.max(1, ...series.map((d) => Math.max(d.coinsIn, d.coinsOut)));

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <Activity size={16} className="text-accent" /> Economy health
          </h3>
          <p className="text-xs text-muted">Every player&apos;s coins, from the transaction ledger.</p>
        </div>
        <label className="w-full text-sm text-ink sm:w-48">
          <span className="text-xs text-subtle">Window</span>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as StatsTimeframe)}
            className={inputClass + " mt-1"}
            aria-label="Economy health window"
          >
            {STATS_TIMEFRAMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && !health ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !health || !totals || !flows ? (
        <p className="text-sm text-muted">Couldn&apos;t load the economy right now.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="In circulation" value={health.circulation} />
            <Tile label="Coins in" value={totals.coinsIn} tone="success" />
            <Tile label="Coins out" value={totals.coinsOut} tone="danger" />
            <Tile label="Net" value={totals.net} tone={totals.net >= 0 ? "success" : "danger"} signed />
          </div>

          {series.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-subtle">
                <span>
                  {series.length < health.daily.length ? "Coins in and out by week" : "Coins in and out by day"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-success" /> in
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-danger" /> out
                  </span>
                </span>
              </div>
              <div className="overflow-x-auto">
                <div
                  className="flex h-28 min-w-full items-end gap-0.5"
                  role="img"
                  aria-label="Coins in and out over time"
                >
                  {series.map((d) => (
                    <div
                      key={d.day}
                      title={`${d.day}: +${fmt(d.coinsIn)} in, −${fmt(d.coinsOut)} out`}
                      className="flex h-full min-w-[6px] flex-1 items-end gap-px"
                    >
                      <span
                        className="w-1/2 rounded-t-sm bg-success/80"
                        style={{ height: `${(d.coinsIn / peak) * 100}%` }}
                      />
                      <span
                        className="w-1/2 rounded-t-sm bg-danger/80"
                        style={{ height: `${(d.coinsOut / peak) * 100}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FlowList title="Where coins come from" flows={flows.sources} pick={(k) => k.coinsIn} tone="success" />
            <FlowList title="Where coins go" flows={flows.sinks} pick={(k) => k.coinsOut} tone="danger" />
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink">Players</h4>
            {health.players.length === 0 ? (
              <p className="text-xs text-subtle">No coin activity in this window.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {health.players.map((p) => {
                  const net = p.earned - p.spent;
                  return (
                    <div
                      key={p.userId}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg border border-line bg-panel/40 px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-medium text-ink">{p.displayName}</span>
                      <span className="flex flex-wrap items-center gap-x-3 text-muted">
                        <span title="Current balance" className="inline-flex items-center gap-1">
                          <CoinIcon size={11} /> {fmt(p.balance)}
                        </span>
                        <span className="text-success">+{fmt(p.earned)}</span>
                        <span className="text-danger">−{fmt(p.spent)}</span>
                        <span className={net >= 0 ? "text-success" : "text-danger"}>
                          net {net >= 0 ? "+" : "−"}
                          {fmt(Math.abs(net))}
                        </span>
                        <span>{p.clears} clear{p.clears === 1 ? "" : "s"}</span>
                        {p.topSource && (
                          <span className="text-subtle">mostly {ledgerLabel({ kind: p.topSource })}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  tone,
  signed = false,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
  signed?: boolean;
}) {
  const cls = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</div>
      <div className={`mt-1 inline-flex items-center gap-1 font-display text-xl ${cls}`}>
        <CoinIcon size={15} />
        {signed && value > 0 ? "+" : signed && value < 0 ? "−" : ""}
        {fmt(signed ? Math.abs(value) : value)}
      </div>
    </div>
  );
}

function FlowList({
  title,
  flows,
  pick,
  tone,
}: {
  title: string;
  flows: KindFlow[];
  pick: (k: KindFlow) => number;
  tone: "success" | "danger";
}) {
  const top = Math.max(1, ...flows.map(pick));
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-ink">{title}</h4>
      {flows.length === 0 ? (
        <p className="text-xs text-subtle">None in this window.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {flows.map((k) => (
            <li key={k.kind} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-ink">{ledgerLabel({ kind: k.kind })}</span>
                <span className="shrink-0 text-muted">
                  {fmt(pick(k))} · {k.players} player{k.players === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-panel">
                <div
                  className={`h-full rounded-full ${tone === "success" ? "bg-success/70" : "bg-danger/70"}`}
                  style={{ width: `${(pick(k) / top) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
