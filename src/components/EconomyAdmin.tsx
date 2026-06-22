import { useMemo, useState } from "react";
import { Coins, RotateCcw, Check } from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { formatPlaytime } from "../lib/playtime";
import {
  formulaBreakdown,
  cloneFormula,
  FACTOR_KEYS,
  FACTOR_META,
  DEFAULT_PRICE_FORMULA,
  DEFAULT_BOUNTY_FORMULA,
  type FormulaConfig,
  type FactorKey,
} from "../lib/economy";
import type { GameMeta } from "../types";

// A representative game used to preview a formula when an admin has no games of
// their own to sample (or just wants a stable reference point).
const SAMPLE_GAME: GameMeta = {
  title: "Sample · recent 20-hour hit",
  hours: 20,
  released: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  rating: 4.2,
  metacritic: 88,
  playedHours: 8,
  genres: [],
  copies: [{ id: "sample", platform: "PC", cost: 60 }],
};

const inputClass =
  "w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand";

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Editor for a single formula: base, the recency decay window, and a row per
 *  factor (enable + weight). */
function FormulaEditor({
  value,
  onChange,
}: {
  value: FormulaConfig;
  onChange: (next: FormulaConfig) => void;
}) {
  const setFactor = (k: FactorKey, patch: Partial<FormulaConfig["factors"][FactorKey]>) =>
    onChange({ ...value, factors: { ...value.factors, [k]: { ...value.factors[k], ...patch } } });

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between gap-3 text-sm text-ink">
        <span>
          Base <span className="text-xs text-subtle">— every game starts here</span>
        </span>
        <input
          type="number"
          value={value.base}
          onChange={(e) => onChange({ ...value, base: num(e.target.value) })}
          className={inputClass + " max-w-28"}
        />
      </label>

      <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {FACTOR_KEYS.map((k) => {
          const f = value.factors[k];
          const meta = FACTOR_META[k];
          return (
            <div key={k} className="flex flex-col gap-2 p-2.5">
              <div className="flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) => setFactor(k, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  {meta.label}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={f.weight}
                    disabled={!f.enabled}
                    onChange={(e) => setFactor(k, { weight: num(e.target.value) })}
                    aria-label={`${meta.label} weight`}
                    className={inputClass + " max-w-24 disabled:opacity-50"}
                  />
                  <span className="w-28 shrink-0 text-[11px] text-subtle">{meta.weightUnit}</span>
                </div>
              </div>
              <p className="text-[11px] text-subtle">{meta.help}</p>
              {k === "recency" && f.enabled && (
                <label className="flex items-center justify-between gap-3 text-[11px] text-subtle">
                  Fades to zero over
                  <span className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={value.recencyDecayYears}
                      onChange={(e) =>
                        onChange({ ...value, recencyDecayYears: num(e.target.value) })
                      }
                      aria-label="Recency decay years"
                      className={inputClass + " max-w-20"}
                    />
                    years
                  </span>
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Live breakdown of a formula for a chosen sample game. */
function Preview({ cfg, game }: { cfg: FormulaConfig; game: GameMeta }) {
  const bd = formulaBreakdown(game, cfg);
  const rows = FACTOR_KEYS.filter((k) => cfg.factors[k].enabled).map((k) => ({
    key: k,
    label: k === "length" ? `Length (${game.hours ? formatPlaytime(game.hours) : "?"})` : FACTOR_META[k].label,
    value: bd.factors[k],
  }));
  return (
    <div className="rounded-xl border border-line bg-panel p-3 text-sm">
      <div className="flex items-center justify-between text-muted">
        <span>Base</span>
        <span>{bd.base}</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between text-muted">
          <span>{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2 font-semibold text-ink">
        <span>Total</span>
        <span className="inline-flex items-center gap-1 text-accent">
          <CoinIcon size={14} /> {bd.total}
        </span>
      </div>
    </div>
  );
}

function FormulaCard({
  title,
  hint,
  value,
  onChange,
  onReset,
  sample,
}: {
  title: string;
  hint: string;
  value: FormulaConfig;
  onChange: (next: FormulaConfig) => void;
  onReset: () => void;
  sample: GameMeta;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-ink">{title}</h3>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        <button
          onClick={onReset}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-muted transition hover:bg-panel hover:text-ink"
        >
          <RotateCcw size={12} /> Defaults
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,16rem)]">
        <FormulaEditor value={value} onChange={onChange} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-subtle">Preview</span>
          <Preview cfg={value} game={sample} />
        </div>
      </div>
    </div>
  );
}

export function EconomyAdmin() {
  const { economy, setEconomyFormulas, isAdmin, games } = useStore();
  const [price, setPrice] = useState<FormulaConfig>(() => cloneFormula(economy.price));
  const [bounty, setBounty] = useState<FormulaConfig>(() => cloneFormula(economy.bounty));
  const [sampleId, setSampleId] = useState<string>("__sample");
  const [saving, setSaving] = useState(false);

  const sample = useMemo(
    () => (sampleId === "__sample" ? SAMPLE_GAME : (games.find((g) => g.id === sampleId) ?? SAMPLE_GAME)),
    [sampleId, games],
  );

  const dirty =
    JSON.stringify({ price, bounty }) !== JSON.stringify({ price: economy.price, bounty: economy.bounty });

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">
        The Economy settings are admin-only.
      </div>
    );
  }

  async function save() {
    setSaving(true);
    await setEconomyFormulas(price, bounty);
    setSaving(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div>
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <Coins size={18} className="text-accent" /> Economy
        </h2>
        <p className="mt-1 text-sm text-muted">
          Tune how games are priced to buy and how much finishing one pays out. Changes apply to
          everyone once saved.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted">
        Preview against
        <select
          value={sampleId}
          onChange={(e) => setSampleId(e.target.value)}
          className={inputClass + " max-w-xs"}
        >
          <option value="__sample">Sample game</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      </label>

      <FormulaCard
        title="Buy price"
        hint="Coins to unlock a game from your Bazaar."
        value={price}
        onChange={setPrice}
        onReset={() => setPrice(cloneFormula(DEFAULT_PRICE_FORMULA))}
        sample={sample}
      />
      <FormulaCard
        title="Finish bounty"
        hint="Coins paid when a game is marked finished."
        value={bounty}
        onChange={setBounty}
        onReset={() => setBounty(cloneFormula(DEFAULT_BOUNTY_FORMULA))}
        sample={sample}
      />

      <div className="sticky bottom-4 flex items-center justify-end gap-2 rounded-xl border border-line bg-surface/95 p-3 backdrop-blur">
        <span className="mr-auto text-xs text-subtle">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <button
          onClick={() => {
            setPrice(cloneFormula(economy.price));
            setBounty(cloneFormula(economy.bounty));
          }}
          disabled={!dirty || saving}
          className="rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-panel disabled:opacity-50"
        >
          Revert
        </button>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 disabled:opacity-50"
        >
          <Check size={15} /> Save
        </button>
      </div>
    </div>
  );
}
