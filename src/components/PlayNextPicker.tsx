import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { trackEvent } from "../lib/appEvents";
import {
  AIM_OPTIONS,
  LENGTH_OPTIONS,
  MOOD_OPTIONS,
  coerceAnswers,
  pickNext,
  poolPlatforms,
  type PlayNextAnswers,
} from "../lib/playNext";
import { CoinIcon } from "./CoinIcon";

const ANSWERS_KEY = "playNext.answers";

/** The last answers, so the picker reopens the way the player left it. */
function loadAnswers(): PlayNextAnswers {
  try {
    return coerceAnswers(JSON.parse(localStorage.getItem(ANSWERS_KEY) ?? "null"));
  } catch {
    return coerceAnswers(null);
  }
}

function saveAnswers(a: PlayNextAnswers): void {
  try {
    localStorage.setItem(ANSWERS_KEY, JSON.stringify(a));
  } catch {
    /* storage unavailable — the picker just starts fresh next time */
  }
}

function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={
              "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
              (o.value === value
                ? "border-brand bg-brand text-brand-fg"
                : "border-line bg-panel text-muted hover:text-ink")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** "Help me choose": four quick questions, then up to three games you can
 *  start right now, each with why it was picked. Starting one hands back to
 *  the Mystery Pull modal, which runs the normal activation and logs the
 *  choice with the answers and the suggestions shown. */
export function PlayNextPicker({
  pool,
  priceOf,
  onStart,
  onBack,
}: {
  /** The startable-now pool (mysteryPullPool). */
  pool: Game[];
  priceOf: (g: Game) => number;
  onStart: (game: Game, detail: Record<string, unknown>) => void;
  onBack: () => void;
}) {
  const games = useStore((s) => s.games);
  const economyEnabled = useStore((s) => s.economyEnabled);
  const storyOrderBonus = useStore((s) => s.featureBonuses.storyOrder);
  const [answers, setAnswers] = useState(loadAnswers);

  const platforms = poolPlatforms(pool);
  // A remembered platform you no longer have a startable game on reads as Any.
  const effective = answers.platform && !platforms.includes(answers.platform) ? { ...answers, platform: null } : answers;
  // The parent rebuilds the pool array every render, so picks are keyed on the
  // answers and the pool's ids: a Surprise draw holds until either changes.
  const answersKey = JSON.stringify(effective);
  const poolKey = pool.map((g) => g.id).join(",");
  const [now] = useState(() => Date.now());
  const { picks, matched } = useMemo(
    () => pickNext(pool, games, effective, { now, storyOrderBonus: economyEnabled ? storyOrderBonus : 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [poolKey, answersKey, games, now, economyEnabled, storyOrderBonus],
  );
  const suggested = picks.map((p) => p.game.id);

  // Log each set of suggestions shown (the usage log), once per set of answers.
  useEffect(() => {
    trackEvent("feature", "picker_suggest", { ...effective, suggested, matched });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answersKey]);

  function update(patch: Partial<PlayNextAnswers>) {
    const next = { ...effective, ...patch };
    setAnswers(next);
    saveAnswers(next);
  }

  const platformOptions = [
    { value: "", label: "Any" },
    ...platforms.map((p) => ({ value: p, label: p })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted transition hover:text-ink"
      >
        <ChevronLeft size={14} /> Back
      </button>

      <ChipRow label="How long a game?" options={LENGTH_OPTIONS} value={effective.length} onChange={(length) => update({ length })} />
      {platforms.length > 1 && (
        <ChipRow
          label="Which platform?"
          options={platformOptions}
          value={effective.platform ?? ""}
          onChange={(p) => update({ platform: p || null })}
        />
      )}
      <ChipRow label="What mood?" options={MOOD_OPTIONS} value={effective.mood} onChange={(mood) => update({ mood })} />
      <ChipRow label="What are you after?" options={AIM_OPTIONS} value={effective.aim} onChange={(aim) => update({ aim })} />

      <div className="flex flex-col gap-2" data-testid="play-next-picks">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
          {picks.length === 0 ? "No matches" : `Top ${picks.length} of ${matched}`}
        </p>
        {picks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            {effective.aim === "series"
              ? "None of your startable games is next in a series. Try another answer."
              : "Nothing you can start right now fits all of these. Try loosening an answer."}
          </p>
        ) : (
          picks.map(({ game, reasons }) => (
            <div key={game.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-2.5">
              <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-surface">
                {game.image ? (
                  <img src={game.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-lg opacity-50">🎮</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{game.title}</p>
                <p className="mt-0.5 flex flex-wrap gap-1">
                  {reasons.map((r) => (
                    <span key={r} className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">
                      {r}
                    </span>
                  ))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onStart(game, { ...effective, suggested, rank: suggested.indexOf(game.id) + 1 })}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg shadow-sm transition hover:brightness-105"
              >
                {economyEnabled ? (
                  <>
                    <CoinIcon size={12} /> {priceOf(game)}
                  </>
                ) : (
                  "Start"
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
