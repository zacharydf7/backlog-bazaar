import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Gamepad2,
  Clock,
  Check,
  Trophy,
  Heart,
  Store,
  Pencil,
  StickyNote,
  Undo2,
  Lock,
  Scroll,
  Ticket,
  Target,
  Flag,
  RotateCcw,
  CalendarCheck,
  Infinity as InfinityIcon,
} from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { ActivationModal } from "./ActivationModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { FINISH_TAGS, finishTagLabel, type FinishTag } from "../lib/finishTags";
import { canRedeemVoucher } from "../lib/vouchers";
import {
  canStartGame,
  canEnterRotation,
  canEnterLane,
  laneOf,
  playingGames,
} from "../lib/slots";
import { formatResetCountdown } from "../lib/rotation";
import { isReplayFinish } from "../lib/families";
import { parsePlaytime, formatPlaytime } from "../lib/playtime";
import { summarizePlatformPlaytime } from "../lib/platformPlaytime";
import { ownedVersions, versionKey, versionLabel } from "../lib/copies";
import { computeFinishReward, computeCompletionReward, computeShelveRefund } from "../lib/pricing";
import {
  computeFormula,
  formulaBreakdown,
  signedCoins,
  FACTOR_KEYS,
  FACTOR_META,
  type FactorKey,
} from "../lib/economy";
import { useScrollLock } from "../lib/useScrollLock";
import { CoinIcon } from "./CoinIcon";

// Icon + label per Now Playing lane, for the lane badge on a playing card.
const LANE_BADGE: Record<"focus" | "replay" | "completionist", { icon: typeof Gamepad2; label: string }> = {
  focus: { icon: Gamepad2, label: "Focus" },
  replay: { icon: RotateCcw, label: "Replay" },
  completionist: { icon: Target, label: "Completionist" },
};

// Icon per finish tag, for the Finished-board status chip.
const FINISH_TAG_ICON: Record<FinishTag, typeof Gamepad2> = {
  beaten: Flag,
  completed: Trophy,
  endless: InfinityIcon,
};

/** Small confirm popup for Shelve It. A modal (not an inline expander) so opening
 *  it never grows the card and stretches its row-mates on the board. */
function ShelveModal({
  title,
  refund,
  refundPct,
  onConfirm,
  onClose,
}: {
  title: string;
  refund: number;
  refundPct: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useScrollLock(true);
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-subtle">
          <Undo2 size={15} className="text-accent" /> Shelve it
        </div>
        <p className="text-sm text-muted">
          Shelve <span className="font-medium text-ink">{title}</span> back into the Bazaar?{" "}
          {refund > 0 ? (
            <>
              You&apos;ll be refunded{" "}
              <span className="inline-flex items-center gap-1 font-semibold text-success">
                <CoinIcon size={12} /> {refund}
              </span>{" "}
              ({refundPct}% of what you paid) — the rest is forfeited.
            </>
          ) : (
            <>No coins are refunded.</>
          )}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white transition hover:brightness-105 active:brightness-95"
          >
            {refund > 0 ? (
              <span className="inline-flex items-center justify-center gap-1">
                Shelve · +<CoinIcon size={13} /> {refund}
              </span>
            ) : (
              "Shelve it"
            )}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-line px-3 py-2 text-sm text-muted transition hover:bg-panel hover:text-ink"
          >
            Keep playing
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The status-specific action footer for a single game (buy / log time / finish /
 * shelve / move to Bazaar). Extracted from GameCard so it can be reused both on
 * a standalone card and inside a Game Family's per-edition detail tab.
 */
export function GameActions({ game }: { game: Game }) {
  const {
    coins,
    vouchers,
    finishGame,
    replayGame,
    abortReplay,
    logPlaytime,
    abandonGame,
    importWithCharter,
    charters,
    openCharters,
    setProgressNote,
    fetchPlaySessions,
    shelveRefundPct,
    replayBonusPct,
    completionBonusPct,
    economy,
    games,
    generalSlots,
    rotationSlots,
    replaySlots,
    completionistSlots,
    enterRotation,
    exitRotation,
    enterCompletionist,
    exitCompletionist,
    abandonCompletion,
    retireRotation,
    convertToEndless,
    setFinishTag,
    rotationCheckin,
    rotationCheckedIn,
    rotationCheckinReward,
    rotationReset,
  } = useStore();
  const [showWhy, setShowWhy] = useState(false);
  const [activating, setActivating] = useState(false);
  // Which Finished-card action is awaiting confirmation (its payout note lives in the
  // dialog, keeping the card itself uncluttered). Null = no dialog.
  const [finishedAction, setFinishedAction] = useState<null | "replay" | "completion" | "convert">(null);
  const [logHours, setLogHours] = useState("");
  const [logVersionKey, setLogVersionKey] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [shelving, setShelving] = useState(false);

  const price = computeFormula(game, economy.price);
  const bounty = computeFormula(game, economy.bounty);
  // A resumed game (a finished game pulled back for free) or a family edition whose
  // family is already cleared re-finishes for the smaller Replay Bonus — mirror the
  // server (apply_finish) so the card never advertises the full bounty for free.
  const isResumed = game.resumed === true;
  const willReplay = isReplayFinish(games, game) || isResumed;
  // Which lane this playing game sits in (Focus / Replay / Completionist / Rotation).
  const lane = laneOf(game);
  const isCompletionist = game.completionist === true;
  // The finish payout: a Completionist game pays its base + the Completion Bonus.
  const reward = isCompletionist
    ? computeCompletionReward(willReplay, bounty, completionBonusPct)
    : computeFinishReward(willReplay, bounty, replayBonusPct);
  const shelveRefund = computeShelveRefund(game.pricePaid ?? price, shelveRefundPct);
  const canAfford = coins >= price;
  const hasVoucher = canRedeemVoucher(vouchers, game.status);
  const hasOpenSlot = canStartGame(game, games, generalSlots);
  // You can open the activation chooser if there's a slot AND a way to pay —
  // coins or a voucher.
  const canActivate = hasOpenSlot && (canAfford || hasVoucher);
  // A live-service / ongoing game is exempt from the buy/finish economy — it has
  // its own action set (the Rotation lane), rendered as a dedicated branch below.
  const isOngoing = game.ongoing === true;
  const checkedInThisWeek = rotationCheckedIn.includes(game.id);
  // Whether the Replay / Completionist lanes have room for this game right now.
  const replayHasRoom = canEnterLane(game, games, "replay", replaySlots);
  const completionistHasRoom = canEnterLane(game, games, "completionist", completionistSlots);
  // Whether the Rotation lane has room for this ongoing game right now.
  const rotationHasRoom = canEnterRotation(game, games, rotationSlots);
  const bd = formulaBreakdown(game, economy.price);
  const enabledFactors = FACTOR_KEYS.filter((k) => economy.price.factors[k].enabled);
  const factorLabel = (k: FactorKey) =>
    k === "length" ? `Length (${game.hours ? formatPlaytime(game.hours) : "?"})` : FACTOR_META[k].label;
  const played = game.playedHours ?? 0;
  const logParsed = parsePlaytime(logHours);
  // The versions (platform + format) you own this game on. With more than one,
  // ask which you played so the session is attributed correctly — a single copy
  // is auto-detected server-side, so no picker is needed then. A physical and a
  // digital copy of the same platform are distinct versions.
  const versions = ownedVersions(game.copies);
  const showVersionPicker = versions.length > 1;
  const selectedVersion =
    versions.find((v) => versionKey(v.platform, v.format) === logVersionKey) ?? versions[0];

  // Pre-select the version you last logged time on, so returning to log more time
  // defaults to the same one instead of resetting to the first.
  useEffect(() => {
    if (game.status !== "playing" || !showVersionPicker) return;
    let active = true;
    void fetchPlaySessions(game.id).then((sessions) => {
      if (!active) return;
      const { lastVersion } = summarizePlatformPlaytime(sessions);
      if (!lastVersion) return;
      const key = versionKey(lastVersion.platform, lastVersion.format);
      if (versions.some((v) => versionKey(v.platform, v.format) === key)) setLogVersionKey(key);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, game.status, showVersionPicker]);

  function submitLog() {
    if (!(logParsed && logParsed > 0)) return;
    // Single copy → let the server auto-detect the version; otherwise attribute to
    // the chosen one.
    const version = showVersionPicker ? selectedVersion : undefined;
    logPlaytime(game.id, logParsed, version?.platform, version?.format);
    setLogHours("");
  }
  function startNote() {
    setNoteDraft(game.progressNote ?? "");
    setEditingNote(true);
  }
  function saveNote() {
    setProgressNote(game.id, noteDraft);
    setEditingNote(false);
  }

  // ── Live-service / ongoing games: no buy price, no finish bounty. Their whole
  // lifecycle is parked ⇄ in the Rotation lane, with a weekly check-in for coins.
  if (isOngoing) {
    const inRotation = game.status === "playing" && game.inRotation === true;
    return (
      <div className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
          <InfinityIcon size={11} /> {inRotation ? "In Rotation" : "Live-service game"}
        </span>

        {inRotation ? (
          <>
            {checkedInThisWeek ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel/60 p-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-success">
                  <CalendarCheck size={14} /> Checked in this week
                </span>
                <span className="text-subtle">resets in {formatResetCountdown(new Date(), rotationReset)}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel/60 p-2">
                <button
                  onClick={() => rotationCheckin(game.id)}
                  title={`Log this week's play of ${game.title}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
                >
                  <CalendarCheck size={15} /> Played this week
                  {rotationCheckinReward > 0 && (
                    <span className="inline-flex items-center gap-1">
                      · +<CoinIcon size={13} /> {rotationCheckinReward}
                    </span>
                  )}
                </button>
                <span className="text-[11px] text-subtle">resets in {formatResetCountdown(new Date(), rotationReset)}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <button
                onClick={() => retireRotation(game.id)}
                title={`Retire ${game.title} to Finished (tagged Endless)`}
                className="inline-flex items-center gap-1.5 text-xs text-subtle transition hover:text-ink"
              >
                <Trophy size={13} /> Retire to Finished
              </button>
              <button
                onClick={() => exitRotation(game.id)}
                title={`Remove ${game.title} from your Rotation lane (back to the Bazaar)`}
                className="inline-flex items-center gap-1.5 text-xs text-subtle transition hover:text-ink"
              >
                <Undo2 size={13} /> Remove from Rotation
              </button>
            </div>
          </>
        ) : rotationHasRoom ? (
          <>
            <button
              onClick={() => enterRotation(game.id)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
            >
              <InfinityIcon size={15} /> Add to Rotation — free
            </button>
            <p className="text-center text-[11px] text-subtle">
              Free to add. Check in once a week for <CoinIcon size={11} /> {rotationCheckinReward} — no
              buy price, no finish bounty.
            </p>
          </>
        ) : (
          <p className="inline-flex items-center gap-1.5 rounded-xl bg-panel px-3 py-2 text-xs text-danger">
            <Lock size={13} /> Your Rotation lane is full — remove one to add this.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {activating && game.status === "backlog" && (
        <ActivationModal game={game} onClose={() => setActivating(false)} />
      )}
      {game.status === "backlog" && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowWhy((v) => !v)}
            className="inline-flex items-center gap-1 self-start text-left text-xs text-muted transition hover:text-accent"
          >
            <CoinIcon size={13} /> {price} coins {showWhy ? "▲" : "▼"}
          </button>
          {showWhy && (
            <div className="rounded-lg bg-panel p-2 text-[11px] text-muted">
              <div className="flex justify-between">
                <span>Base</span>
                <span>{bd.base}</span>
              </div>
              {enabledFactors.map((k) => (
                <div key={k} className="flex justify-between">
                  <span>{factorLabel(k)}</span>
                  <span className="tabular-nums">{signedCoins(bd.factors[k])}</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setActivating(true)}
            disabled={!canActivate}
            title={!hasOpenSlot ? "No open Now Playing slot — finish or shelve a game first" : undefined}
            className={
              "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition " +
              (canActivate
                ? "bg-brand text-brand-fg shadow-sm hover:brightness-105 active:brightness-95"
                : "cursor-not-allowed bg-panel text-subtle")
            }
          >
            {!hasOpenSlot ? (
              <>
                <Lock size={14} /> No open slot
              </>
            ) : !canAfford && !hasVoucher ? (
              <>
                Need <CoinIcon size={14} /> {price - coins} more
              </>
            ) : hasVoucher && !canAfford ? (
              <>
                <Ticket size={14} /> Use voucher to start
              </>
            ) : (
              <>
                Buy &amp; Start · <CoinIcon size={14} /> {price}
              </>
            )}
          </button>
          <p className="text-center text-[11px] text-subtle">
            {!hasOpenSlot && (canAfford || hasVoucher) ? (
              "Finish or shelve a Now Playing game to free up a slot."
            ) : hasVoucher ? (
              <span className="inline-flex items-center gap-1">
                <Ticket size={12} className="text-brand" /> {vouchers} free voucher
                {vouchers === 1 ? "" : "s"} · finish bounty <CoinIcon size={12} /> {bounty}
              </span>
            ) : (
              <>
                Finish bounty <CoinIcon size={12} /> {bounty}
              </>
            )}
          </p>
        </div>
      )}

      {game.status === "playing" && (
        <div className="flex flex-col gap-2">
          {/* Which lane this game sits in (Focus / Replay / Completionist), plus a
              one-tap way to start or stop a 100% (Completionist) run. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(() => {
              const badge = LANE_BADGE[lane === "rotation" ? "focus" : lane];
              const Icon = badge.icon;
              return (
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                  <Icon size={11} /> {badge.label}
                </span>
              );
            })()}
            {/* A previously-finished game (e.g. pulled into Replay) keeps its prior
                status tag, so it's clear it was already Beaten/Completed. */}
            {game.finishTag && (
              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-subtle">
                {(() => {
                  const TagIcon = FINISH_TAG_ICON[game.finishTag];
                  return <TagIcon size={11} />;
                })()}
                {finishTagLabel(game.finishTag)}
              </span>
            )}
            {isCompletionist ? (
              // "Stop completing" only makes sense for a never-beaten game — it returns
              // to Focus to keep playing. An already-beaten game (resumed) just exits
              // via Mark Complete or Abandon Completion, so no Stop button is shown.
              !game.resumed &&
              (() => {
                const room = canEnterLane(game, games, "focus", generalSlots);
                return (
                  <button
                    onClick={() => exitCompletionist(game.id)}
                    disabled={!room}
                    title={
                      room
                        ? `Stop going for completion on ${game.title}`
                        : "Your Focus lane is full — free a slot first"
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-muted"
                  >
                    <Undo2 size={11} /> Stop completing
                  </button>
                );
              })()
            ) : (
              // An already-completed game isn't offered the completion flow again;
              // otherwise the button stays visible but disabled when the lane is full.
              game.finishTag !== "completed" && (
                <button
                  onClick={() => enterCompletionist(game.id)}
                  disabled={!completionistHasRoom}
                  title={
                    completionistHasRoom
                      ? `Work to 100%-complete ${game.title}`
                      : "Your Completionist lane is full — free a slot first"
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/5 px-2 py-0.5 text-[11px] font-medium text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent/5"
                >
                  <Target size={11} /> Go for completion
                </button>
              )
            )}
          </div>

          {editingNote ? (
            <div className="rounded-lg bg-panel p-2">
              <label className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-subtle">
                <StickyNote size={12} className="text-accent" /> Current status
              </label>
              <textarea
                autoFocus
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    saveNote();
                  }
                }}
                rows={2}
                maxLength={280}
                placeholder="e.g. Chapter 4 — heading to the swamp temple"
                className="w-full resize-none rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button
                  onClick={() => setEditingNote(false)}
                  className="rounded-md px-2 py-1 text-xs text-muted transition hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNote}
                  className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-brand-fg transition hover:brightness-105"
                >
                  <Check size={12} /> Save
                </button>
              </div>
            </div>
          ) : game.progressNote ? (
            <button
              onClick={startNote}
              title="Edit progress note"
              className="group/note flex w-full items-start gap-1.5 rounded-lg border border-line bg-panel/60 p-2 text-left transition hover:border-brand/40"
            >
              <StickyNote size={13} className="mt-0.5 shrink-0 text-accent" />
              <span className="flex-1 whitespace-pre-wrap break-words text-xs text-ink">
                {game.progressNote}
              </span>
              <Pencil
                size={12}
                className="mt-0.5 shrink-0 text-subtle opacity-0 transition group-hover/note:opacity-100"
              />
            </button>
          ) : (
            <button
              onClick={startNote}
              className="inline-flex items-center gap-1.5 self-start text-xs text-muted transition hover:text-accent"
            >
              <StickyNote size={13} /> Add a progress note
            </button>
          )}

          <div className="rounded-lg bg-panel p-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={13} className="text-accent" /> {formatPlaytime(played)} played
              </span>
            </div>
            {showVersionPicker && (
              <div className="mt-2 flex items-center gap-2">
                <label className="shrink-0 text-[11px] text-muted">Played on</label>
                <select
                  value={selectedVersion ? versionKey(selectedVersion.platform, selectedVersion.format) : ""}
                  onChange={(e) => setLogVersionKey(e.target.value)}
                  aria-label={`Version played for ${game.title}`}
                  className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
                >
                  {versions.map((v) => {
                    const key = versionKey(v.platform, v.format);
                    return (
                      <option key={key} value={key}>
                        {versionLabel(v.platform, v.format)}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                inputMode="text"
                value={logHours}
                onChange={(e) => setLogHours(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitLog();
                  }
                }}
                placeholder="Add time (e.g. 1h 30m)"
                aria-label={`Log play time for ${game.title}`}
                className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
              />
              <button
                onClick={submitLog}
                disabled={!(logParsed && logParsed > 0)}
                className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Log
              </button>
            </div>
            {logHours.trim() !== "" && logParsed == null && (
              <p className="mt-1 text-[11px] text-danger">
                Try formats like “1h 30m”, “90m”, or “2.75”.
              </p>
            )}
          </div>
          <div className="text-xs">
            <span className="font-medium text-success">
              {isCompletionist ? "Completion reward " : "Finish bounty "}
              <CoinIcon size={12} /> {reward}
            </span>
            <span className="text-subtle">
              {isCompletionist ? " — paid when you complete this." : " — paid when you mark this finished."}
            </span>
            {isCompletionist && (
              <span className="mt-0.5 block text-accent">
                {willReplay
                  ? "Already finished once, so completing pays just the "
                  : "Completing pays the full bounty plus the "}
                <CoinIcon size={12} /> Completion Bonus.
              </span>
            )}
            {!isCompletionist && willReplay && (
              <span className="mt-0.5 block text-accent">
                {isResumed
                  ? "Replay clear — this finished game was pulled back for free, so it pays the smaller "
                  : "Replay clear — another edition in this family is already finished, so this pays the smaller "}
                <CoinIcon size={12} /> {reward} Replay Bonus.
              </span>
            )}
          </div>
          <button
            onClick={() => finishGame(game.id)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95"
          >
            <Check size={15} /> {isCompletionist ? "Mark Complete" : "Mark Finished"} + <CoinIcon size={15} />
          </button>
          {lane === "replay" ? (
            // Two distinct exits for a replay: "Mark Finished" above is a re-clear that
            // pays the Replay Bonus; this cancels the replay — back to Finished with no
            // bonus, as if you never pulled it back.
            <button
              onClick={() => abortReplay(game.id)}
              title={`Cancel the replay — return ${game.title} to Finished without the Replay Bonus`}
              className="inline-flex items-center justify-center gap-1.5 text-xs text-subtle transition hover:text-ink"
            >
              <Undo2 size={13} /> Cancel replay
            </button>
          ) : isCompletionist && isResumed ? (
            // Only a previously-finished game can be ABANDONED to Finished (it has a
            // Finished state to return to) — tagged Beaten, no coins. A never-beaten
            // completionist game instead Shelves back to the Bazaar (or "Stop
            // completing" returns it to Focus), so it's never marked finished early.
            <button
              onClick={() => abandonCompletion(game.id)}
              title={`Abandon the 100% run and move ${game.title} back to Finished`}
              className="inline-flex items-center justify-center gap-1.5 text-xs text-subtle transition hover:text-ink"
            >
              <Undo2 size={13} /> Abandon Completion
            </button>
          ) : (
            <>
              <button
                onClick={() => setShelving(true)}
                className="inline-flex items-center justify-center gap-1.5 text-xs text-subtle transition hover:text-ink"
              >
                <Undo2 size={13} /> Shelve it
                {shelveRefund > 0 && (
                  <span className="inline-flex items-center gap-1">
                    · +<CoinIcon size={12} /> {shelveRefund}
                  </span>
                )}
              </button>
              {shelving && (
                <ShelveModal
                  title={game.title}
                  refund={shelveRefund}
                  refundPct={shelveRefundPct}
                  onConfirm={() => {
                    abandonGame(game.id);
                    setShelving(false);
                  }}
                  onClose={() => setShelving(false)}
                />
              )}
            </>
          )}
        </div>
      )}

      {game.status === "finished" && (
        <div className="flex flex-col gap-2">
          {/* How it concluded (auto-assigned, overridable) + played time. The board
              already shows a status chip, so there's no big "Finished" banner here. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-subtle">Status</span>
            <div className="relative inline-flex items-center">
              {(() => {
                const TagIcon = game.finishTag ? FINISH_TAG_ICON[game.finishTag] : Flag;
                return <TagIcon size={13} className="pointer-events-none absolute left-2 text-accent" />;
              })()}
              <select
                value={game.finishTag ?? "beaten"}
                onChange={(e) => setFinishTag(game.id, e.target.value as FinishTag)}
                aria-label={`Status tag for ${game.title}`}
                className="rounded-lg border border-line bg-panel py-1 pl-7 pr-2 text-xs font-medium text-ink outline-none transition focus:border-brand"
              >
                {FINISH_TAGS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {played > 0 && <span className="text-subtle">· {formatPlaytime(played)} played</span>}
          </div>

          {/* Subtle "what next" actions — each opens a confirm dialog carrying the
              payout details, so the card stays uncluttered. Actions stay visible but
              disable (with a reason) when their target lane is full; "Go for 100%" is
              hidden only when the game is already Completed (redundant). */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
            <button
              onClick={() => setFinishedAction("replay")}
              disabled={!replayHasRoom}
              title={
                replayHasRoom
                  ? `Replay ${game.title} for free`
                  : "Your Replay lane is full — free a slot first"
              }
              className="inline-flex items-center gap-1.5 text-xs text-subtle transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-subtle"
            >
              <RotateCcw size={13} /> Replay
            </button>
            {!isOngoing && game.finishTag !== "completed" && (
              <button
                onClick={() => setFinishedAction("completion")}
                disabled={!completionistHasRoom}
                title={
                  completionistHasRoom
                    ? `Go for 100% completion of ${game.title}`
                    : "Your Completionist lane is full — free a slot first"
                }
                className="inline-flex items-center gap-1.5 text-xs text-subtle transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-subtle"
              >
                <Target size={13} /> Go for 100%
              </button>
            )}
            {!isOngoing && (
              <button
                onClick={() => setFinishedAction("convert")}
                disabled={!rotationHasRoom}
                title={
                  rotationHasRoom
                    ? `Convert ${game.title} into an ongoing Rotation game`
                    : "Your Rotation lane is full — free a slot first"
                }
                className="inline-flex items-center gap-1.5 text-xs text-subtle transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-subtle"
              >
                <InfinityIcon size={13} /> Convert to Endless
              </button>
            )}
          </div>

          {finishedAction &&
            createPortal(
              <ConfirmDialog
                title={
                  finishedAction === "replay"
                    ? "Replay this game?"
                    : finishedAction === "completion"
                      ? "Go for 100%?"
                      : "Convert to Endless?"
                }
                body={
                  finishedAction === "replay" ? (
                    <>
                      Pull <span className="font-medium text-ink">{game.title}</span> back into Now
                      Playing for free. Finishing it again pays the smaller{" "}
                      <CoinIcon size={12} /> {computeFinishReward(true, bounty, replayBonusPct)} Replay
                      Bonus.
                    </>
                  ) : finishedAction === "completion" ? (
                    <>
                      Pull <span className="font-medium text-ink">{game.title}</span> back into Now
                      Playing to 100% it. Completing pays the <CoinIcon size={12} /> Completion Bonus
                      on top of the base reward.
                    </>
                  ) : (
                    <>
                      Turn <span className="font-medium text-ink">{game.title}</span> into an ongoing
                      Rotation game. It keeps its status tag and earns a weekly check-in instead of a
                      finish bounty.
                    </>
                  )
                }
                confirmLabel={
                  finishedAction === "replay"
                    ? "Replay"
                    : finishedAction === "completion"
                      ? "Go for completion"
                      : "Convert"
                }
                onConfirm={() => {
                  if (finishedAction === "replay") replayGame(game.id);
                  else if (finishedAction === "completion") enterCompletionist(game.id);
                  else convertToEndless(game.id);
                  setFinishedAction(null);
                }}
                onCancel={() => setFinishedAction(null)}
              />,
              document.body,
            )}
        </div>
      )}

      {game.status === "wishlist" && (
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Heart size={13} /> On your wishlist
          </span>
          {charters > 0 ? (
            <button
              onClick={() => importWithCharter(game.id)}
              title="Spend one Import Charter to move this into your Bazaar"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
            >
              <Scroll size={15} /> Consume 1 Charter to Import
            </button>
          ) : (
            <button
              onClick={openCharters}
              title="You need an Import Charter to move this into your Bazaar"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand/50 bg-brand/10 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-brand/20"
            >
              <Scroll size={15} /> Get a Charter to import
            </button>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The read-only counterpart to <GameActions>, shown when you're visiting another
 * player's Bazaar. Purely informational — a status chip plus that status's key
 * fact (unlock cost / progress note / played time), with no buttons.
 */
export function ReadOnlyFooter({ game }: { game: Game }) {
  const economy = useStore((s) => s.economy);
  const played = game.playedHours ?? 0;

  if (game.status === "backlog") {
    return (
      <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-xs text-muted">
        <CoinIcon size={13} /> {computeFormula(game, economy.price)} to unlock
      </div>
    );
  }

  if (game.status === "playing") {
    return (
      <div className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
          <Gamepad2 size={13} /> Now Playing
          {played ? <span className="text-muted">· {formatPlaytime(played)}</span> : null}
        </span>
        {game.progressNote && (
          <div className="flex items-start gap-1.5 rounded-lg border border-line bg-panel/60 p-2 text-xs text-ink">
            <StickyNote size={13} className="mt-0.5 shrink-0 text-accent" />
            <span className="whitespace-pre-wrap break-words">{game.progressNote}</span>
          </div>
        )}
      </div>
    );
  }

  if (game.status === "finished") {
    return (
      <div className="flex items-center justify-center gap-1.5 rounded-xl bg-success/15 px-3 py-2 text-center text-sm font-medium text-success">
        <Trophy size={15} /> Finished{played ? ` · ${formatPlaytime(played)} played` : ""}
      </div>
    );
  }

  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-xs text-muted">
      <Heart size={13} /> On their wishlist
    </span>
  );
}
