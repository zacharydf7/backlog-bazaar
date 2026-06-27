import { useMemo, useState } from "react";
import {
  Coins,
  RotateCcw,
  Check,
  Scroll,
  Ticket,
  Plus,
  Minus,
  SlidersHorizontal,
  Infinity as InfinityIcon,
} from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { charterResale } from "../lib/charters";
import { formatPlaytime } from "../lib/playtime";
import { rotationResetSummary, resetDayLabel } from "../lib/rotation";
import {
  formulaBreakdown,
  cloneFormula,
  splitWeight,
  combineWeight,
  signedCoins,
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

/** A compact +/− segmented control choosing whether a factor adds to or reduces
 *  the total. The glyph carries the meaning, so the active state stays on-brand
 *  in every theme. */
function DirectionToggle({
  value,
  disabled,
  onChange,
}: {
  value: 1 | -1;
  disabled?: boolean;
  onChange: (dir: 1 | -1) => void;
}) {
  return (
    <div
      className={
        "inline-flex shrink-0 overflow-hidden rounded-lg border border-line " +
        (disabled ? "opacity-50" : "")
      }
    >
      {([1, -1] as const).map((d) => {
        const active = value === d;
        return (
          <button
            key={d}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            aria-label={d === 1 ? "Adds to the total" : "Reduces the total"}
            onClick={() => onChange(d)}
            className={
              "flex h-8 w-8 items-center justify-center transition " +
              (active
                ? "bg-brand text-brand-fg"
                : "bg-panel text-muted hover:text-ink disabled:hover:text-muted")
            }
          >
            {d === 1 ? <Plus size={14} /> : <Minus size={14} />}
          </button>
        );
      })}
    </div>
  );
}

/** Editor for a single formula: base, the recency decay window, and a row per
 *  factor (enable + signed weight as a +/− direction × magnitude). */
function FormulaEditor({
  value,
  onChange,
}: {
  value: FormulaConfig;
  onChange: (next: FormulaConfig) => void;
}) {
  // Sticky direction for a factor whose magnitude is currently 0 (where the
  // stored weight's sign is ambiguous). Above 0, the weight's sign is authoritative.
  const [dirs, setDirs] = useState<Partial<Record<FactorKey, 1 | -1>>>({});

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

      <p className="text-[11px] text-subtle">
        Each factor can <span className="text-ink">add</span> to or{" "}
        <span className="text-ink">reduce</span> the total — pick + or − and an amount per unit. The
        final total never drops below 0.
      </p>

      <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {FACTOR_KEYS.map((k) => {
          const f = value.factors[k];
          const meta = FACTOR_META[k];
          const { direction: signDir, magnitude } = splitWeight(f.weight);
          const dir: 1 | -1 = magnitude > 0 ? signDir : (dirs[k] ?? 1);
          const setDir = (d: 1 | -1) => {
            setDirs((prev) => ({ ...prev, [k]: d }));
            setFactor(k, { weight: combineWeight(d, magnitude) });
          };
          return (
            <div key={k} className="flex flex-col gap-2 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                  <DirectionToggle value={dir} disabled={!f.enabled} onChange={setDir} />
                  <input
                    type="number"
                    min={0}
                    value={magnitude}
                    disabled={!f.enabled}
                    onChange={(e) => setFactor(k, { weight: combineWeight(dir, num(e.target.value)) })}
                    aria-label={`${meta.label} amount`}
                    className={inputClass + " max-w-20 disabled:opacity-50"}
                  />
                  <span className="w-24 shrink-0 text-[11px] text-subtle">{meta.weightUnit}</span>
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
          <span className="tabular-nums">{signedCoins(r.value)}</span>
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

/** Admin editor for Import Charter economics: buy cost + resale %. Self-contained
 *  (its own Save), since it persists to app_config independently of the formulas. */
function ChartersCard() {
  const { charterCost, charterResalePct, setCharterCost, setCharterResalePct } = useStore();
  const [cost, setCost] = useState(String(charterCost));
  const [pct, setPct] = useState(String(charterResalePct));
  const [saving, setSaving] = useState(false);

  const dirty = num(cost) !== charterCost || num(pct) !== charterResalePct;
  const resale = charterResale(num(cost), num(pct));

  async function save() {
    setSaving(true);
    await setCharterCost(num(cost));
    await setCharterResalePct(num(pct));
    setSaving(false);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3">
        <h3 className="inline-flex items-center gap-2 font-display text-lg text-ink">
          <Scroll size={16} className="text-accent" /> Import Charters
        </h3>
        <p className="text-xs text-muted">
          What it costs to buy an Import Charter, and how much selling one returns.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm text-ink">
          <span>
            Cost to buy <span className="text-xs text-subtle">— coins per charter</span>
          </span>
          <input
            type="number"
            min={0}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className={inputClass + " mt-1"}
          />
        </label>
        <label className="flex-1 text-sm text-ink">
          <span>
            Resale <span className="text-xs text-subtle">— % of cost returned</span>
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            className={inputClass + " mt-1"}
          />
        </label>
      </div>
      <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted">
        Selling a charter returns <CoinIcon size={11} /> {resale} of {num(cost)} ({num(pct)}%).
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={() => {
            setCost(String(charterCost));
            setPct(String(charterResalePct));
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

/** Admin editor for how many Onboarding Free Game Vouchers each NEW account is
 *  granted at signup. Self-contained Save → app_config.onboarding_vouchers.
 *  Affects future signups only; existing users are untouched. */
function OnboardingCard() {
  const { onboardingVouchers, setOnboardingVouchers } = useStore();
  const [count, setCount] = useState(String(onboardingVouchers));
  const [saving, setSaving] = useState(false);

  const dirty = num(count) !== onboardingVouchers;

  async function save() {
    setSaving(true);
    await setOnboardingVouchers(num(count));
    setSaving(false);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3">
        <h3 className="inline-flex items-center gap-2 font-display text-lg text-ink">
          <Ticket size={16} className="text-brand" /> Onboarding vouchers
        </h3>
        <p className="text-xs text-muted">
          Free Game Vouchers each new account gets at signup, to start games they're already
          playing without spending coins. Applies to future signups only.
        </p>
      </div>
      <label className="block text-sm text-ink sm:max-w-[12rem]">
        <span>
          Vouchers at signup <span className="text-xs text-subtle">— 0–100</span>
        </span>
        <input
          type="number"
          min={0}
          max={100}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className={inputClass + " mt-1"}
        />
      </label>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={() => setCount(String(onboardingVouchers))}
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

const RESET_TZ_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];

/** Admin editor for the Rotation lane economy: the weekly check-in reward and the
 *  fixed weekly reset (day + hour + timezone) that gates it — mirroring how a
 *  live-service game resets its quests. Self-contained Save → app_config. The lane
 *  SIZE is the "Rotation" slot's default grant, managed on the Slots tab. */
function RotationCard() {
  const { rotationCheckinReward, rotationReset, setRotationConfig } = useStore();
  const [reward, setReward] = useState(String(rotationCheckinReward));
  const [dow, setDow] = useState(rotationReset.resetDow);
  const [hour, setHour] = useState(String(rotationReset.resetHour));
  const [tz, setTz] = useState(rotationReset.resetTz);
  const [saving, setSaving] = useState(false);

  const draft = { resetDow: dow, resetHour: num(hour), resetTz: tz };
  const dirty =
    num(reward) !== rotationCheckinReward ||
    dow !== rotationReset.resetDow ||
    num(hour) !== rotationReset.resetHour ||
    tz !== rotationReset.resetTz;

  async function save() {
    setSaving(true);
    await setRotationConfig(num(reward), draft);
    setSaving(false);
  }

  function revert() {
    setReward(String(rotationCheckinReward));
    setDow(rotationReset.resetDow);
    setHour(String(rotationReset.resetHour));
    setTz(rotationReset.resetTz);
  }

  const tzOptions = RESET_TZ_OPTIONS.includes(tz) ? RESET_TZ_OPTIONS : [tz, ...RESET_TZ_OPTIONS];

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3">
        <h3 className="inline-flex items-center gap-2 font-display text-lg text-ink">
          <InfinityIcon size={16} className="text-brand" /> Rotation lane
        </h3>
        <p className="text-xs text-muted">
          Live-service &amp; ongoing games sit in their own lane (the Now Playing “Rotation” slots)
          and earn a weekly check-in reward instead of a finish bounty. Set the reward and when the
          week resets. The lane <em>size</em> is the “Rotation” slot’s default grant on the Slots tab.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm text-ink">
          <span>
            Check-in reward <span className="text-xs text-subtle">— coins, 0–100000</span>
          </span>
          <input
            type="number"
            min={0}
            max={100000}
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            className={inputClass + " mt-1"}
          />
        </label>
        <label className="block text-sm text-ink">
          <span>Reset day</span>
          <select
            value={dow}
            onChange={(e) => setDow(Number(e.target.value))}
            className={inputClass + " mt-1"}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {resetDayLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-ink">
          <span>
            Reset hour <span className="text-xs text-subtle">— 0–23</span>
          </span>
          <input
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(e.target.value)}
            className={inputClass + " mt-1"}
          />
        </label>
        <label className="block text-sm text-ink">
          <span>Timezone</span>
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className={inputClass + " mt-1"}
          >
            {tzOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11px] text-subtle">{rotationResetSummary(draft)}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={revert}
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

/** One labelled numeric lever inside the Payouts & refunds card. */
function RateField({
  label,
  hint,
  percent,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  percent?: boolean;
  min: number;
  max: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm text-ink">
      <span>{label}</span>
      <span className="relative mt-1 flex items-center">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass + (percent ? " pr-7" : "")}
        />
        {percent && (
          <span className="pointer-events-none absolute right-2 text-sm text-subtle">%</span>
        )}
      </span>
      <span className="mt-1 block text-[11px] text-subtle">{hint}</span>
    </label>
  );
}

/** Admin editor for the standalone economy levers that sit alongside the buy/
 *  finish formulas: the Shelve-It refund, the Replay Bonus, and the catalog
 *  Contribution reward. Self-contained (its own Save), like the Charters card. */
function RatesCard() {
  const {
    shelveRefundPct,
    setShelveRefundPct,
    replayBonusPct,
    setReplayBonusPct,
    submissionReward,
    setSubmissionReward,
  } = useStore();
  const [shelve, setShelve] = useState(String(shelveRefundPct));
  const [replay, setReplay] = useState(String(replayBonusPct));
  const [reward, setReward] = useState(String(submissionReward));
  const [saving, setSaving] = useState(false);

  const pct = (s: string) => Math.max(0, Math.min(100, Math.round(num(s))));
  const coins = (s: string) => Math.max(0, Math.min(1000, Math.round(num(s))));

  const dirty =
    pct(shelve) !== shelveRefundPct ||
    pct(replay) !== replayBonusPct ||
    coins(reward) !== submissionReward;

  const revert = () => {
    setShelve(String(shelveRefundPct));
    setReplay(String(replayBonusPct));
    setReward(String(submissionReward));
  };

  async function save() {
    setSaving(true);
    await setShelveRefundPct(pct(shelve));
    await setReplayBonusPct(pct(replay));
    await setSubmissionReward(coins(reward));
    setSaving(false);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3">
        <h3 className="inline-flex items-center gap-2 font-display text-lg text-ink">
          <SlidersHorizontal size={16} className="text-accent" /> Payouts &amp; refunds
        </h3>
        <p className="text-xs text-muted">
          The refunds and bonuses that sit alongside the buy and finish formulas.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <RateField
          label="Shelve-It refund"
          hint="The % of a game's purchase price refunded when it's dropped from Now Playing without finishing (the rest is forfeited to the Bazaar)."
          percent
          min={0}
          max={100}
          value={shelve}
          onChange={setShelve}
        />
        <RateField
          label="Replay Bonus"
          hint="The % of the normal completion bonus paid for finishing a linked edition after the family's first clear (re-clears on other platforms)."
          percent
          min={0}
          max={100}
          value={replay}
          onChange={setReplay}
        />
        <RateField
          label="Contribution reward (coins)"
          hint="Coins awarded to a player when their catalog edit or new-game suggestion is approved. A partial approval pays half."
          min={0}
          max={1000}
          value={reward}
          onChange={setReward}
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={revert}
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

export function EconomyAdmin() {
  const { economy, setEconomyFormulas, can, games } = useStore();
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

  if (!can("economy.edit")) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">
        You don&apos;t have access to the Economy settings.
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

      <RatesCard />

      <ChartersCard />
      <OnboardingCard />
      <RotationCard />

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
