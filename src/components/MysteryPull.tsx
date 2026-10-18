import { trackEvent } from "../lib/appEvents";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dices, X, Clock, Target, Compass } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { mysteryPullPool, completionPullPool, drawPull } from "../lib/mysteryPull";
import { computeFormula } from "../lib/economy";
import { computeFamilyDiscountPrice } from "../lib/pricing";
import { isFamilyDiscounted } from "../lib/families";
import { formatPlaytime } from "../lib/playtime";
import { eventStartPrice } from "../lib/bonusEvents";
import { gameHash } from "../lib/route";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { ActivationModal } from "./ActivationModal";
import { PlayNextPicker } from "./PlayNextPicker";
import { CoinIcon } from "./CoinIcon";
import { useCoverOf } from "../lib/useCoverOf";

/** Which pull this is: "play" draws a Bazaar game to buy & start; "complete"
 *  draws a beaten Finished game to pull back for a free 100% run. */
export type PullKind = "play" | "complete";

/** A one-time explainer shown the first time a player opens each pull, so the
 *  dice aren't a mystery in themselves. Dismissed once (per kind) and skipped
 *  thereafter — veterans go straight to the roll. */
const INTRO: Record<PullKind, { title: string; body: string }> = {
  play: {
    title: "Can't decide? Let the Bazaar pick.",
    body: "Mystery Pull finds you a game from your Bazaar that you can start right now — one you can afford with an open Now Playing slot. Roll for a random pick, or answer a few quick questions for three suggestions. Nothing is charged until you actually start a game.",
  },
  complete: {
    title: "Pick a beaten game to 100%.",
    body: "Completion Pull draws a random game from your Finished shelf that still has completion left and fits an open Completionist slot. Pulling it back for a 100% run is free — take the pick, re-roll, or walk away anytime.",
  },
};

/** localStorage flag marking the intro as seen for a given pull kind. */
function introSeenKey(kind: PullKind): string {
  return `mysteryPull.introSeen.${kind}`;
}

/** Has this player already seen the intro for this pull kind? (Storage may be
 *  unavailable — treat any failure as "seen" so the intro never wedges a pull.) */
export function hasSeenIntro(kind: PullKind): boolean {
  try {
    return localStorage.getItem(introSeenKey(kind)) != null;
  } catch {
    return true;
  }
}

/** Remember that the intro for this pull kind has been seen. */
function markIntroSeen(kind: PullKind): void {
  try {
    localStorage.setItem(introSeenKey(kind), "1");
  } catch {
    /* storage unavailable — the intro simply shows again next time */
  }
}

/** The board-toolbar Mystery Pull: cure choice paralysis by letting the Bazaar
 *  pick. The play pull opens on a choice: "Surprise me" draws a random
 *  eligible game (see lib/mysteryPull.ts), "Help me choose" asks four quick
 *  questions and suggests three (lib/playNext.ts). Accepting reuses the
 *  standard flows — the ActivationModal buy for "play", the free
 *  enterCompletionist re-entry for "complete" — and a confirmed pull is
 *  recorded to mystery_pull_events with its kind ('picker' for a guided
 *  pick, with the answers and suggestions shown). */
export function MysteryPull({ kind = "play" }: { kind?: PullKind }) {
  const games = useStore((s) => s.games);
  const coins = useStore((s) => s.coins);
  const vouchers = useStore((s) => s.vouchers);
  const economy = useStore((s) => s.economy);
  const economyEnabled = useStore((s) => s.economyEnabled);
  const replayBonusPct = useStore((s) => s.replayBonusPct);
  const generalSlots = useStore((s) => s.generalSlots);
  const completionistSlots = useStore((s) => s.completionistSlots);
  const [open, setOpen] = useState(false);

  const { pool, reason } =
    kind === "complete"
      ? completionPullPool(games, completionistSlots)
      : mysteryPullPool(games, {
          coins,
          vouchers,
          economy,
          replayBonusPct,
          generalSlots,
          completionistSlots,
        });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          trackEvent("feature", "mystery_pull_open");
        }}
        disabled={pool.length === 0}
        title={
          reason ??
          (kind === "complete"
            ? "Let the Bazaar pick a beaten game to 100%"
            : "Let the Bazaar pick your next game")
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-2 text-sm text-ink transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Dices size={15} className="text-accent" />
        <span className="sr-only sm:not-sr-only">Mystery Pull</span>
      </button>
      {open && <MysteryPullModal kind={kind} onClose={() => setOpen(false)} />}
    </>
  );
}

function MysteryPullModal({ kind, onClose }: { kind: PullKind; onClose: () => void }) {
  const coverOf = useCoverOf();
  const games = useStore((s) => s.games);
  const coins = useStore((s) => s.coins);
  const vouchers = useStore((s) => s.vouchers);
  const economy = useStore((s) => s.economy);
  const economyEnabled = useStore((s) => s.economyEnabled);
  const bonusPerks = useStore((s) => s.bonusPerks);
  const replayBonusPct = useStore((s) => s.replayBonusPct);
  const generalSlots = useStore((s) => s.generalSlots);
  const completionistSlots = useStore((s) => s.completionistSlots);
  const logMysteryPull = useStore((s) => s.logMysteryPull);
  const enterCompletionist = useStore((s) => s.enterCompletionist);

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  // The pool recomputes live (coins/slots can change under the modal); the
  // current draw is held by id so re-renders keep showing the same game.
  const { pool } =
    kind === "complete"
      ? completionPullPool(games, completionistSlots)
      : mysteryPullPool(games, {
          coins,
          vouchers,
          economy,
          replayBonusPct,
          generalSlots,
          completionistSlots,
        });

  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [currentId, setCurrentId] = useState<string | null>(() => drawPull(pool, new Set())?.id ?? null);
  const [rerolls, setRerolls] = useState(0);
  const [activating, setActivating] = useState(false);
  const [working, setWorking] = useState(false);
  // First-time players see a short explainer first. The play pull then offers
  // the random roll or the guided picker; the completion pull goes straight
  // to its draw.
  const afterIntro = kind === "play" ? "choose" : "pull";
  const [phase, setPhase] = useState<"intro" | "choose" | "pull" | "picker">(() =>
    hasSeenIntro(kind) ? afterIntro : "intro",
  );
  // Set when the game being activated came from the picker: logged with it.
  const [pickerDetail, setPickerDetail] = useState<Record<string, unknown> | null>(null);

  function startRolling() {
    markIntroSeen(kind);
    setPhase(afterIntro);
  }

  const current: Game | undefined = games.find((g) => g.id === currentId);

  function reroll() {
    if (!currentId) return;
    const nextSeen = new Set(seen).add(currentId);
    const next = drawPull(
      pool.filter((g) => g.id !== currentId),
      nextSeen,
    );
    if (!next) return; // pool of one — nothing else to show
    // A full cycle restarts the exclusion set (keeping the fresh draw) so every
    // game stays reachable without immediate repeats.
    setSeen(nextSeen.has(next.id) ? new Set([next.id]) : nextSeen);
    setCurrentId(next.id);
    setRerolls((n) => n + 1);
  }

  // The accepted game actually started (playing) — the pull is confirmed:
  // record it with its kind and close. Anything else keeps the pull open.
  function settle() {
    const after = useStore.getState().games.find((g) => g.id === currentId);
    if (after?.status === "playing" && currentId) {
      if (pickerDetail) void logMysteryPull(currentId, 0, "picker", pickerDetail);
      else void logMysteryPull(currentId, rerolls, kind);
      onClose();
    }
  }

  // Activation closed (play pulls): confirmed if the game started.
  function onActivationClose() {
    setActivating(false);
    settle();
  }

  // Completion pulls skip the buy — the re-entry is free, so accept directly.
  async function acceptCompletion() {
    if (!currentId || working) return;
    setWorking(true);
    await enterCompletionist(currentId);
    setWorking(false);
    settle();
  }

  // The drawn game vanished under us (removed/merged) — bail out via effect,
  // never as a render side effect.
  useEffect(() => {
    if (!current) onClose();
  }, [current, onClose]);
  if (!current) return null;

  // First-time explainer: what the dice do, and the choice to roll or bail.
  if (phase === "intro") {
    const intro = INTRO[kind];
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 pt-4">
            <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-subtle">
              <Dices size={15} className="text-accent" /> Mystery Pull
            </span>
            <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div className="grid h-20 place-items-center rounded-2xl border border-line bg-panel">
              <Dices size={40} className="text-accent" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h2 className="font-display text-xl leading-tight text-ink">{intro.title}</h2>
              <p className="text-sm text-muted">{intro.body}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={startRolling}
                className="w-full rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Dices size={15} /> {kind === "play" ? "Let's go" : "Roll"}
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl border border-line bg-panel px-3 py-2.5 font-medium text-muted transition hover:text-ink"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const priceOf = (g: Game) => {
    const full = computeFormula(g, economy.price);
    return isFamilyDiscounted(games, g) ? computeFamilyDiscountPrice(full, replayBonusPct) : full;
  };
  const price = priceOf(current);
  // A running coin event's start discount on this pull (applied at purchase).
  const eventStart = eventStartPrice(price, bonusPerks[current.id]);

  // The play pull's opening choice, and the guided picker it leads to.
  if (phase === "choose" || phase === "picker") {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 pt-4">
            <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-subtle">
              {phase === "picker" ? (
                <>
                  <Compass size={15} className="text-accent" /> Help me choose
                </>
              ) : (
                <>
                  <Dices size={15} className="text-accent" /> Mystery Pull
                </>
              )}
            </span>
            <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <div className="overflow-y-auto p-5">
            {phase === "choose" ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    trackEvent("feature", "mystery_pull_mode", { mode: "surprise" });
                    // A fresh random draw, logged as a plain pull (not a
                    // picker choice made earlier in this modal).
                    setPickerDetail(null);
                    setSeen(new Set());
                    setRerolls(0);
                    setCurrentId(drawPull(pool, new Set())?.id ?? currentId);
                    setPhase("pull");
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-4 text-left transition hover:border-brand/50"
                >
                  <Dices size={26} className="shrink-0 text-accent" />
                  <span>
                    <span className="block font-semibold text-ink">Surprise me</span>
                    <span className="block text-sm text-muted">A random game you can start right now.</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    trackEvent("feature", "mystery_pull_mode", { mode: "picker" });
                    setPhase("picker");
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-4 text-left transition hover:border-brand/50"
                >
                  <Compass size={26} className="shrink-0 text-accent" />
                  <span>
                    <span className="block font-semibold text-ink">Help me choose</span>
                    <span className="block text-sm text-muted">
                      Answer a few quick questions and get three picks.
                    </span>
                  </span>
                </button>
              </div>
            ) : (
              <PlayNextPicker
                pool={pool}
                priceOf={priceOf}
                onBack={() => setPhase("choose")}
                onStart={(game, detail) => {
                  setCurrentId(game.id);
                  setPickerDetail(detail);
                  setActivating(true);
                }}
              />
            )}
          </div>
        </div>
        {activating && <ActivationModal game={current} onClose={onActivationClose} />}
      </div>,
      document.body,
    );
  }

  // Jump to the drawn game's page to inspect it before deciding. The pull
  // simply closes unconfirmed (nothing is charged or recorded) — the cleanup in
  // useHistoryDismiss sees the navigation and leaves history pointing at the
  // game page, so Back returns to the board as usual.
  function openDetails() {
    if (!current) return;
    onClose();
    window.location.hash = gameHash(current.id);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-subtle">
            <Dices size={15} className="text-accent" /> Mystery Pull
          </span>
          <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <button
            type="button"
            onClick={openDetails}
            title="Open this game's page"
            aria-label={`Open ${current.title}'s page`}
            className="block w-full overflow-hidden rounded-2xl border border-line bg-panel text-left transition hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <div className="aspect-[16/9] w-full">
              {coverOf(current) ? (
                <img src={coverOf(current)} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl opacity-50">🎮</div>
              )}
            </div>
          </button>

          <div>
            <h2 className="font-display text-xl leading-tight text-ink">
              <button
                type="button"
                onClick={openDetails}
                title="Open this game's page"
                className="text-left transition hover:text-accent"
              >
                {current.title}
              </button>
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
              {kind === "complete" ? (
                economyEnabled ? (
                  <span className="inline-flex items-center gap-1">
                    <Target size={13} className="text-accent/70" /> Free — pays the Completion Bonus
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Target size={13} className="text-accent/70" /> Back in for a 100% run
                  </span>
                )
              ) : economyEnabled ? (
                <span className="inline-flex items-center gap-1">
                  <CoinIcon size={14} />{" "}
                  {eventStart ? (
                    <>
                      <s className="opacity-60">{price}</s>{" "}
                      <span className="font-semibold text-success">{eventStart.price}</span> to start ·{" "}
                      <span className="font-semibold text-success">{eventStart.event}</span>
                    </>
                  ) : (
                    <>{price} to start</>
                  )}
                </span>
              ) : null}
              {current.hours != null && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} className="text-accent/70" /> ~{formatPlaytime(current.hours)}
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-subtle">
            {kind === "complete"
              ? "The Bazaar picked this beaten game for a 100% run. Take it back into Now Playing for free, roll again, or walk away — tap the cover to look it over first."
              : economyEnabled
                ? "The Bazaar picked this one for you. Take it on, roll again, or walk away — tap the cover to look it over first. Nothing is charged until you start it."
                : "The Bazaar picked this one for you. Take it on, roll again, or walk away — tap the cover to look it over first."}
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => (kind === "complete" ? void acceptCompletion() : setActivating(true))}
              disabled={working}
              className="w-full rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:opacity-60"
            >
              {kind === "complete" ? (working ? "Starting…" : "Go for 100%") : "Add to Now Playing"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reroll}
                disabled={pool.length < 2}
                title={pool.length < 2 ? "Nothing else to pull right now" : undefined}
                className="flex-1 rounded-xl border border-line bg-panel px-3 py-2.5 font-medium text-ink transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Dices size={15} className="text-accent" /> Re-roll
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-line bg-panel px-3 py-2.5 font-medium text-muted transition hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {activating && <ActivationModal game={current} onClose={onActivationClose} />}
    </div>,
    document.body,
  );
}
