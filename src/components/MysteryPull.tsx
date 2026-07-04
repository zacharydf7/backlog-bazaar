import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dices, X, Clock, Target } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { mysteryPullPool, completionPullPool, drawPull } from "../lib/mysteryPull";
import { computeFormula } from "../lib/economy";
import { computeFamilyDiscountPrice } from "../lib/pricing";
import { isFamilyDiscounted } from "../lib/families";
import { formatPlaytime } from "../lib/playtime";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { ActivationModal } from "./ActivationModal";
import { CoinIcon } from "./CoinIcon";

/** Which pull this is: "play" draws a Bazaar game to buy & start; "complete"
 *  draws a beaten Finished game to pull back for a free 100% run. */
export type PullKind = "play" | "complete";

/** A one-time explainer shown the first time a player opens each pull, so the
 *  dice aren't a mystery in themselves. Dismissed once (per kind) and skipped
 *  thereafter — veterans go straight to the roll. */
const INTRO: Record<PullKind, { title: string; body: string }> = {
  play: {
    title: "Can't decide? Let the Bazaar pick.",
    body: "Mystery Pull draws a random game from your Bazaar that you can start right now — one you can afford with an open Now Playing slot. Take the Bazaar's pick, re-roll for another, or walk away. Nothing is charged until you actually start a game.",
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
 *  pick. Draws a random eligible game (see lib/mysteryPull.ts) and prompts the
 *  player to take it on, re-roll, or walk away. Accepting reuses the standard
 *  flows — the ActivationModal buy for "play", the free enterCompletionist
 *  re-entry for "complete" — and a confirmed pull is recorded to
 *  mystery_pull_events with its kind. */
export function MysteryPull({ kind = "play" }: { kind?: PullKind }) {
  const games = useStore((s) => s.games);
  const coins = useStore((s) => s.coins);
  const vouchers = useStore((s) => s.vouchers);
  const economy = useStore((s) => s.economy);
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
        onClick={() => setOpen(true)}
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
  const games = useStore((s) => s.games);
  const coins = useStore((s) => s.coins);
  const vouchers = useStore((s) => s.vouchers);
  const economy = useStore((s) => s.economy);
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
  // First-time players see a short explainer before the first roll; everyone
  // else drops straight onto the draw.
  const [phase, setPhase] = useState<"intro" | "pull">(() => (hasSeenIntro(kind) ? "pull" : "intro"));

  function startRolling() {
    markIntroSeen(kind);
    setPhase("pull");
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
      void logMysteryPull(currentId, rerolls, kind);
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
                  <Dices size={15} /> Roll
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

  const fullPrice = computeFormula(current, economy.price);
  const price = isFamilyDiscounted(games, current)
    ? computeFamilyDiscountPrice(fullPrice, replayBonusPct)
    : fullPrice;

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
          <div className="overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="aspect-[16/9] w-full">
              {current.image ? (
                <img src={current.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl opacity-50">🎮</div>
              )}
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl leading-tight text-ink">{current.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
              {kind === "complete" ? (
                <span className="inline-flex items-center gap-1">
                  <Target size={13} className="text-accent/70" /> Free — pays the Completion Bonus
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <CoinIcon size={14} /> {price} to start
                </span>
              )}
              {current.hours != null && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} className="text-accent/70" /> ~{formatPlaytime(current.hours)}
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-subtle">
            {kind === "complete"
              ? "The Bazaar picked this beaten game for a 100% run. Take it back into Now Playing for free, roll again, or walk away."
              : "The Bazaar picked this one for you. Take it on, roll again, or walk away — nothing is charged until you start it."}
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
