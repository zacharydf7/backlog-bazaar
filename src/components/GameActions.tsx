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
  FlagOff,
  RotateCcw,
  Stamp,
  CalendarCheck,
  CalendarClock,
  PartyPopper,
  Users,
  Handshake,
  Timer,
  Infinity as InfinityIcon,
} from "lucide-react";
import type { Game } from "../types";
import { useStore, selectCoachTarget } from "../store";
import { ActivationModal } from "./ActivationModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { FINISH_TAGS, finishHint, finishTagLabel, type FinishTag } from "../lib/finishTags";
import { canRedeemVoucher } from "../lib/vouchers";
import {
  canStartGame,
  canEnterLane,
  laneOf,
  playingGames,
  LANE_LABEL,
  type Lane,
} from "../lib/slots";
import { formatResetCountdown } from "../lib/rotation";
import { isReplayFinish, isFamilyDiscounted, familyStats } from "../lib/families";
import {
  activePactForCard,
  playtimeLockedByPact,
  playtimeSharedToPartner,
} from "../lib/coopPacts";
import { prerequisiteOf } from "../lib/prerequisites";
import {
  isPreordered,
  isPreorderOut,
  preorderCountdownLabel,
  projectedUnlockPrice,
} from "../lib/preorders";
import { AskLoanButton } from "./Loans";
import { parsePlaytime, formatPlaytime } from "../lib/playtime";
import { formatElapsed } from "../lib/playSessions";
import { useNow } from "../lib/useNow";
import { summarizePlatformPlaytime } from "../lib/platformPlaytime";
import { loggableVersions, versionKey, versionLabel } from "../lib/copies";
import {
  computeFinishReward,
  computeCompletionReward,
  computeShelveRefund,
  computeFamilyDiscountPrice,
} from "../lib/pricing";
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
import { StackVersionPicker, useStackVersions } from "./StackVersionPicker";

// Icon + label per Now Playing lane, for the lane badge on a playing card
// (Rotation wears its own In Rotation chip). Labels come from the shared lane
// catalog so every surface says the same thing.
const LANE_BADGE: Record<
  Exclude<Lane, "rotation">,
  { icon: typeof Gamepad2; label: string }
> = {
  focus: { icon: Gamepad2, label: LANE_LABEL.focus },
  replay: { icon: RotateCcw, label: LANE_LABEL.replay },
  completionist: { icon: Target, label: LANE_LABEL.completionist },
  coop: { icon: Handshake, label: LANE_LABEL.coop },
};

// Icon per finish tag, for the Finished-board status chip.
const FINISH_TAG_ICON: Record<FinishTag, typeof Gamepad2> = {
  beaten: Flag,
  completed: Trophy,
  endless: InfinityIcon,
  retired: FlagOff,
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

/** Confirm popup for Retire It — the terminal drop. Explains where the game
 *  goes (Finished shelf, Retired tag), what comes back (the salvage refund for
 *  a lane retire; nothing for a Bazaar one), and that returning to play later
 *  means a full-price re-buy. An optional note captures why it didn't click. */
function RetireModal({
  title,
  fromLane,
  refund,
  refundPct,
  onConfirm,
  onClose,
}: {
  title: string;
  /** True when retiring from a Now Playing lane (salvage applies). */
  fromLane: boolean;
  refund: number;
  refundPct: number;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
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
          <FlagOff size={15} className="text-accent" /> Retire it
        </div>
        <p className="text-sm text-muted">
          Done with <span className="font-medium text-ink">{title}</span>? It moves to your
          Finished shelf under the <span className="font-medium text-ink">Retired</span> tag —
          out of the backlog, honestly marked as a drop (it won&apos;t count as a clear).{" "}
          {fromLane && refund > 0 ? (
            <>
              You&apos;ll salvage{" "}
              <span className="inline-flex items-center gap-1 font-semibold text-success">
                <CoinIcon size={12} /> {refund}
              </span>{" "}
              ({refundPct}% of what you paid) — the rest is forfeited.
            </>
          ) : (
            <>No coins move — nothing was invested.</>
          )}{" "}
          Changing your mind later means returning it to the Bazaar and buying it again at full
          price.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Why didn't it click? (optional — saved to its note)"
          className="mt-3 w-full resize-none rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onConfirm(note)}
            className="flex-1 rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white transition hover:brightness-105 active:brightness-95"
          >
            {fromLane && refund > 0 ? (
              <span className="inline-flex items-center justify-center gap-1">
                Retire · +<CoinIcon size={13} /> {refund}
              </span>
            ) : (
              "Retire it"
            )}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-line px-3 py-2 text-sm text-muted transition hover:bg-panel hover:text-ink"
          >
            Keep it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Chooser popup for removing a bazaar-origin (or legacy, pre-provenance) game
 *  from the Rotation lane: park it back in the Bazaar for later, or conclude it
 *  to Finished. (A finished-origin game skips this — removal sends it straight
 *  back to Finished via a plain ConfirmDialog.) Modal for the same reason as
 *  ShelveModal: opening it must never grow the card. */
function RemoveFromRotationModal({
  title,
  keptTag,
  onBazaar,
  onFinished,
  onClose,
}: {
  title: string;
  keptTag: string | null;
  onBazaar: () => void;
  onFinished: () => void;
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
          <Undo2 size={15} className="text-accent" /> Remove from Rotation
        </div>
        <p className="text-sm text-muted">
          Where should <span className="font-medium text-ink">{title}</span> go? Park it in the
          Bazaar to come back to later, or call it done.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={onBazaar}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105 active:brightness-95"
          >
            <Store size={15} /> Back to the Bazaar
          </button>
          <button
            onClick={onFinished}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-panel"
          >
            <Trophy size={15} /> Move to Finished{keptTag ? ` — keeps ${keptTag}` : " — tagged Endless"}
          </button>
          <button
            onClick={onClose}
            className="mt-1 text-xs text-subtle transition hover:text-ink"
          >
            Cancel
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
export function GameActions({
  game,
  familyMembers,
}: {
  game: Game;
  /** The unified family card's full member list (game = the primary): the
   *  displayed playtime then sums every member's hours — zero-migration rule,
   *  each record keeps its own history and the card shows the family total.
   *  New logging still targets `game`, the primary. */
  familyMembers?: Game[];
}) {
  const {
    coins,
    vouchers,
    finishGame,
    replayGame,
    abortReplay,
    logPlaytime,
    abandonGame,
    importWithCharter,
    fulfillPreorder,
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
    replaySlots,
    completionistSlots,
    enterRotation,
    exitRotation,
    enterCompletionist,
    exitCompletionist,
    abandonCompletion,
    retireRotation,
    convertToEndless,
    retireGame,
    unretireGame,
    setFinishTag,
    rotationCheckin,
    rotationCheckedIn,
    rotationCheckinReward,
    rotationReset,
    trackEditions,
    compilations,
    economyEnabled,
    coOpPacts,
    cloud,
    activeSession,
    startPlaySession,
    openSessionStop,
  } = useStore();
  // Getting Started quests highlight the real control they teach (derived —
  // the ring clears itself the moment the quest's predicate flips).
  const coachTarget = useStore(selectCoachTarget);
  const coachRing = " ring-2 ring-brand ring-offset-2 ring-offset-canvas";
  const [showWhy, setShowWhy] = useState(false);
  const [activating, setActivating] = useState(false);
  // Which Finished-card action is awaiting confirmation (its payout note lives in the
  // dialog, keeping the card itself uncluttered). Null = no dialog.
  const [finishedAction, setFinishedAction] = useState<null | "replay" | "completion" | "convert" | "unretire">(null);
  // Retire It confirm (Bazaar or lane) — a modal, like ShelveModal, so the card
  // never grows.
  const [retiring, setRetiring] = useState(false);
  const [logHours, setLogHours] = useState("");
  const [logVersionKey, setLogVersionKey] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [shelving, setShelving] = useState(false);
  const [removingRotation, setRemovingRotation] = useState(false);
  const [showLockInfo, setShowLockInfo] = useState(false);
  // On a collapsed stack, the cold-start CTAs first ask WHICH folded version
  // they target: which CTA is waiting on a pick (null = none), and the version
  // chosen for the modal-backed actions (activation / retire) once picked.
  const stackVersions = useStackVersions();
  const [stackPick, setStackPick] = useState<null | "activate" | "rotation" | "import" | "retire">(null);
  const [activationGame, setActivationGame] = useState<Game | null>(null);
  const [retireTarget, setRetireTarget] = useState<Game | null>(null);

  // Priced off the game's own acquisition date (a compilation child's added_at
  // was stamped when the bundle was expanded, so bundles need no special case).
  const fullPrice = computeFormula(game, economy.price);
  // Family Discount: a Bazaar edition whose family is already active/cleared
  // activates for the Replay-Bonus percentage of its fee (cost mirrors payout).
  const familyDiscount = isFamilyDiscounted(games, game);
  const price = familyDiscount ? computeFamilyDiscountPrice(fullPrice, replayBonusPct) : fullPrice;
  const bounty = computeFormula(game, economy.bounty);
  // A resumed game (a finished game pulled back for free) or a family edition whose
  // family is already cleared re-finishes for the smaller Replay Bonus — mirror the
  // server (apply_finish) so the card never advertises the full bounty for free.
  const isResumed = game.resumed === true;
  const willReplay = isReplayFinish(games, game) || isResumed;
  // Which lane this playing game sits in (Focus / Replay / Completionist / Rotation).
  const lane = laneOf(game);
  const isCompletionist = game.completionist === true;
  // Economy off — or a run started for free while it was off — pays and charges
  // nothing: every coin figure below zeroes/hides and activation is free (the
  // store + server both force it).
  const showEconomy = economyEnabled && game.startedEconomyOff !== true;
  // The finish payout: a Completionist game pays its base + the Completion Bonus.
  const reward = showEconomy
    ? isCompletionist
      ? computeCompletionReward(willReplay, bounty, completionBonusPct)
      : computeFinishReward(willReplay, bounty, replayBonusPct)
    : 0;
  const shelveRefund = showEconomy
    ? computeShelveRefund(game.pricePaid ?? price, shelveRefundPct)
    : 0;
  const canAfford = !economyEnabled || coins >= price;
  const hasVoucher = economyEnabled && canRedeemVoucher(vouchers, game.status);
  const hasOpenSlot = canStartGame(game, games, generalSlots);
  // Story lock: an unfinished prerequisite blocks the cold start (Bazaar →
  // Now Playing). Derived live — finishing the prerequisite unlocks instantly.
  // The server re-checks in every cold-start RPC, so this is UX, not security.
  const storyLockPre = game.status === "backlog" ? prerequisiteOf(games, game) : null;
  const storyLocked = storyLockPre != null && storyLockPre.status !== "finished";
  // You can open the activation chooser if there's a slot AND a way to pay —
  // coins or a voucher.
  const canActivate = hasOpenSlot && (canAfford || hasVoucher);
  // A live-service / ongoing game is exempt from the buy/finish economy — it has
  // its own action set (the Rotation lane), rendered as a dedicated branch below.
  const isOngoing = game.ongoing === true;
  const checkedInThisWeek = rotationCheckedIn.includes(game.id);
  // Whether the Replay / Completionist lanes have room for this game right now.
  // (The Rotation lane is uncapped — an ongoing game always fits.)
  const replayHasRoom = canEnterLane(game, games, "replay", replaySlots);
  const completionistHasRoom = canEnterLane(game, games, "completionist", completionistSlots);
  const bd = formulaBreakdown(game, economy.price);
  const enabledFactors = FACTOR_KEYS.filter((k) => economy.price.factors[k].enabled);
  const factorLabel = (k: FactorKey) =>
    k === "length" ? `Length (${game.hours ? formatPlaytime(game.hours) : "?"})` : FACTOR_META[k].label;
  const played = game.playedHours ?? 0;
  // Unified family card: the DISPLAYED playtime sums every member's hours
  // (zero migration — each record keeps its own history; the card shows the
  // family total). `played` keeps driving the per-record logic underneath.
  const familyPlayed =
    familyMembers && familyMembers.length > 1 ? familyStats(familyMembers).totalPlayed : null;
  const displayPlayed = familyPlayed ?? played;
  const familyPlayedTitle =
    familyPlayed != null && familyMembers
      ? `Combined across ${familyMembers.length} linked editions — new time logs to ${game.title}`
      : undefined;
  const logParsed = parsePlaytime(logHours);
  // Shared co-op time: while a pact is active with Player 1's half unfinished,
  // Player 1 logs for both sides — the partner's log box is replaced with a
  // note (the server enforces the same lock), and Player 1's box gains an
  // "also counts for <partner>" hint.
  const pact = activePactForCard(coOpPacts, game.id);
  const pactLocksLog = playtimeLockedByPact(pact);
  const pactSharesLog = playtimeSharedToPartner(pact);
  // Play-session stopwatch: the live tick only runs while the watch is on THIS
  // game. Cloud-only; a pact-locked card can't log time, so it can't start a
  // watch either.
  const sessionOnThis = activeSession?.gameId === game.id;
  const now = useNow(sessionOnThis);
  const showStopwatch = cloud && !pactLocksLog;
  // Stop (log or discard) a running watch on this game before an action that
  // moves it out of the Playing lane, then continue that action — hours logged
  // after the move would be refused.
  const withSessionStopped = (fn: () => void) => {
    if (sessionOnThis) openSessionStop(fn);
    else fn();
  };
  // Each instance tracks its own play time — the picker offers exactly this
  // record's owned copies (a bundle-owned twin logs time on its own card).
  const playtimeCopies = game.copies ?? [];
  // The versions you own this game on, honouring the edition-tracking preference:
  // each platform+format copy when on, or one entry per platform when off (the
  // default). With more than one, ask which you played so the session is
  // attributed correctly — a single version is auto-detected server-side, so no
  // picker is needed then.
  const versions = loggableVersions(playtimeCopies, trackEditions);
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
      // When aggregating by platform, ignore the recorded format so the last
      // platform you played re-selects regardless of which copy it was logged on.
      const key = trackEditions
        ? versionKey(lastVersion.platform, lastVersion.format)
        : versionKey(lastVersion.platform, undefined);
      if (versions.some((v) => versionKey(v.platform, v.format) === key)) setLogVersionKey(key);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, game.status, showVersionPicker, trackEditions]);

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

  // The "Which version?" prompt for a collapsed stack's CTAs. Rendered by both
  // the ongoing branch (Add to Rotation) and the standard one (Buy & Start,
  // Import with Charter); the chosen version receives the pending action.
  const stackPickModal =
    stackPick && stackVersions
      ? createPortal(
          <StackVersionPicker
            games={stackVersions}
            title={
              stackPick === "activate"
                ? "Buy & Start"
                : stackPick === "rotation"
                  ? "Add to Rotation"
                  : stackPick === "import"
                    ? "Import with Charter"
                    : "Retire it"
            }
            onPick={(g) => {
              setStackPick(null);
              if (stackPick === "activate") setActivationGame(g);
              else if (stackPick === "rotation") enterRotation(g.id);
              else if (stackPick === "import") importWithCharter(g.id);
              else setRetireTarget(g);
            }}
            onClose={() => setStackPick(null)}
          />,
          document.body,
        )
      : null;
  // The activation chooser for the picked stack version (a plain card's own
  // activation keeps using `activating` below).
  const stackActivationModal = activationGame ? (
    <ActivationModal game={activationGame} onClose={() => setActivationGame(null)} />
  ) : null;
  // The Retire confirm for the picked stack version — a Bazaar drop (no lane
  // refund), mirroring the standalone backlog Retire below.
  const stackRetireModal = retireTarget
    ? createPortal(
        <RetireModal
          title={retireTarget.title}
          fromLane={false}
          refund={0}
          refundPct={shelveRefundPct}
          onConfirm={(note) => {
            void retireGame(retireTarget.id, note);
            setRetireTarget(null);
          }}
          onClose={() => setRetireTarget(null)}
        />,
        document.body,
      )
    : null;

  // Story-lock interception: explains WHY the start is blocked instead of a
  // dead disabled button. Rendered by both the ongoing and standard branches.
  const lockDialog =
    showLockInfo && storyLockPre ? (
      <ConfirmDialog
        title="Story-locked"
        body={
          <>
            Finish <span className="font-medium text-ink">{storyLockPre.title}</span> first — this
            game unlocks the moment it&apos;s marked Finished. You can change or remove the
            prerequisite from this game&apos;s details.
          </>
        }
        confirmLabel="Got it"
        hideCancel
        onConfirm={() => setShowLockInfo(false)}
        onCancel={() => setShowLockInfo(false)}
      />
    ) : null;

  // ── Live-service / ongoing games: no buy price, no finish bounty. Their whole
  // lifecycle is parked ⇄ in the Rotation lane, with a weekly check-in for coins.
  if (isOngoing) {
    const inRotation = game.status === "playing" && game.inRotation === true;
    return (
      <div className="flex flex-col gap-2">
        {lockDialog}
        {stackPickModal}
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg shadow-stamp-sm transition hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-none"
                >
                  <CalendarCheck size={15} /> Played this week
                  {economyEnabled && rotationCheckinReward > 0 && (
                    <span className="inline-flex items-center gap-1">
                      · +<CoinIcon size={13} /> {rotationCheckinReward}
                    </span>
                  )}
                </button>
                <span className="text-[11px] text-subtle">resets in {formatResetCountdown(new Date(), rotationReset)}</span>
              </div>
            )}
            {/* One origin-aware exit: a game that joined the lane from Finished
                returns straight there (badge intact, check-in over); one that
                joined from the Bazaar chooses between parking and concluding. */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <button
                onClick={() => setRemovingRotation(true)}
                title={
                  game.rotationOrigin === "finished"
                    ? `Remove ${game.title} from Rotation — back to your Finished shelf`
                    : `Remove ${game.title} from your Rotation lane`
                }
                className="inline-flex items-center gap-1.5 text-xs text-subtle transition hover:text-ink"
              >
                <Undo2 size={13} /> Remove from Rotation
              </button>
            </div>
            {removingRotation &&
              (game.rotationOrigin === "finished" ? (
                createPortal(
                  <ConfirmDialog
                    title="Remove from Rotation?"
                    body={
                      <>
                        <span className="font-medium text-ink">{game.title}</span> goes back to
                        your Finished shelf
                        {game.finishTag ? (
                          <>
                            {" "}
                            with its{" "}
                            <span className="font-medium text-ink">
                              {finishTagLabel(game.finishTag)}
                            </span>{" "}
                            badge
                          </>
                        ) : null}
                        .{" "}
                        {game.preRotationOngoing
                          ? "You can add it back to Rotation anytime."
                          : "The weekly check-in ends and it's a regular finished game again."}
                      </>
                    }
                    confirmLabel="Return to Finished"
                    onConfirm={() => {
                      retireRotation(game.id);
                      setRemovingRotation(false);
                    }}
                    onCancel={() => setRemovingRotation(false)}
                  />,
                  document.body,
                )
              ) : (
                <RemoveFromRotationModal
                  title={game.title}
                  keptTag={game.finishTag ? finishTagLabel(game.finishTag) : null}
                  onBazaar={() => {
                    exitRotation(game.id);
                    setRemovingRotation(false);
                  }}
                  onFinished={() => {
                    retireRotation(game.id);
                    setRemovingRotation(false);
                  }}
                  onClose={() => setRemovingRotation(false)}
                />
              ))}
          </>
        ) : (
          <>
            <button
              onClick={() =>
                storyLocked
                  ? setShowLockInfo(true)
                  : stackVersions
                    ? setStackPick("rotation")
                    : enterRotation(game.id)
              }
              className={
                storyLocked
                  ? "inline-flex items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/15"
                  : "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-stamp-sm transition hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-none"
              }
            >
              {storyLocked ? (
                <>
                  <Lock size={15} /> Story-locked
                </>
              ) : (
                <>
                  <InfinityIcon size={15} /> Add to Rotation — free
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-subtle">
              {economyEnabled ? (
                <>
                  Free to add. Check in once a week for <CoinIcon size={11} />{" "}
                  {rotationCheckinReward} — no buy price, no finish bounty.
                </>
              ) : (
                "Free to add — check in once a week to log that you're still playing."
              )}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {lockDialog}
      {stackPickModal}
      {stackActivationModal}
      {stackRetireModal}
      {activating && game.status === "backlog" && !storyLocked && (
        <ActivationModal game={game} onClose={() => setActivating(false)} />
      )}
      {/* A pre-ordered Bazaar card: already yours, not out yet — so no price,
          no Buy & Start (the server's PREORDER_LOCKED gate backs this up),
          just the countdown. The release-day sweep unlocks it into the normal
          block below; the free arrival confirm covers dateless orders and a
          date passing mid-session. */}
      {game.status === "backlog" && isPreordered(game) && (
        <div className="flex flex-col gap-2">
          {isPreorderOut(game) ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
              <PartyPopper size={13} /> {preorderCountdownLabel(game.preorderExpectedOn)} Your
              pre-order has arrived.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
              <CalendarClock size={13} />
              {game.preorderExpectedOn
                ? `Pre-ordered · ${preorderCountdownLabel(game.preorderExpectedOn)}`
                : "Pre-ordered"}
            </span>
          )}
          {/* The projected Buy & Start fee (issue 35cd8572): priced as a
              fresh pickup at the expected release day — the unlock redates
              the acquisition to arrival — with the Family Discount mirrored
              when it currently applies. An estimate — the tilde and tooltip
              say so. */}
          {showEconomy && (
            <span
              className="inline-flex items-center gap-1 self-start text-xs text-muted"
              title="An estimate priced at the release date — playtime, rating, or economy changes before then can shift the real fee"
            >
              <CoinIcon size={13} /> ~
              {familyDiscount
                ? computeFamilyDiscountPrice(projectedUnlockPrice(game, economy.price), replayBonusPct)
                : projectedUnlockPrice(game, economy.price)}{" "}
              coins to start once it&apos;s unlocked — have them ready
            </span>
          )}
          {isPreorderOut(game) || !game.preorderExpectedOn ? (
            <button
              onClick={() => fulfillPreorder(game.id)}
              title="Unlock your arrived pre-order — it becomes a normal Bazaar game, ready to start"
              className={
                "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold shadow-stamp-sm transition active:translate-x-px active:translate-y-px active:shadow-none " +
                (isPreorderOut(game)
                  ? "bg-brand text-brand-fg hover:brightness-105"
                  : "border-[1.5px] border-edge bg-panel text-ink hover:bg-surface")
              }
            >
              <PartyPopper size={15} /> It&apos;s arrived — unlock it
            </button>
          ) : (
            <p className="text-center text-[11px] text-subtle">
              Unlocks by itself on release day — nothing to do until then.
            </p>
          )}
        </div>
      )}
      {game.status === "backlog" && !isPreordered(game) && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowWhy((v) => !v)}
            className="inline-flex items-center gap-1 self-start text-left text-xs text-muted transition hover:text-accent"
          >
            <CoinIcon size={13} />{" "}
            {familyDiscount ? (
              // Family Discount: full fee crossed out, the cheaper fee leads.
              <>
                <s className="text-subtle">{fullPrice}</s>{" "}
                <span className="font-semibold text-success">{price}</span> coins
              </>
            ) : (
              <>{price} coins</>
            )}{" "}
            {showWhy ? "▲" : "▼"}
          </button>
          {familyDiscount && (
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              <Users size={11} /> Family Discount — an edition is already active or finished
            </span>
          )}
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
              {familyDiscount && (
                <div className="flex justify-between font-medium text-success">
                  <span>Family Discount</span>
                  <span className="tabular-nums">{signedCoins(price - fullPrice)}</span>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() =>
              storyLocked
                ? setShowLockInfo(true)
                : stackVersions
                  ? setStackPick("activate")
                  : setActivating(true)
            }
            disabled={!storyLocked && !canActivate}
            title={
              storyLocked
                ? `Locked until you finish ${storyLockPre?.title}`
                : !hasOpenSlot
                  ? "No open Now Playing slot — finish or shelve a game first"
                  : undefined
            }
            className={
              "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition " +
              (storyLocked
                ? "border border-accent/40 bg-accent/10 text-accent hover:bg-accent/15"
                : canActivate
                  ? "bg-brand text-brand-fg shadow-stamp-sm hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-none"
                  : "cursor-not-allowed bg-panel text-subtle") +
              (coachTarget === "activate" && game.status === "backlog" && canActivate && !storyLocked
                ? coachRing
                : "")
            }
          >
            {storyLocked ? (
              <>
                <Lock size={14} /> Story-locked
              </>
            ) : !hasOpenSlot ? (
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
            ) : economyEnabled ? (
              <>
                Buy &amp; Start · <CoinIcon size={14} /> {price}
              </>
            ) : (
              <>
                <Gamepad2 size={14} /> Start playing
              </>
            )}
          </button>
          {/* Short on coins with no voucher? A friend can front the difference
              (Friend Loans, issue 7973d721) — repaid from the bounty. */}
          {game.status === "backlog" && !storyLocked && showEconomy && !canAfford && !hasVoucher && (
            <AskLoanButton game={game} need={price - coins} />
          )}
          {(storyLocked || !hasOpenSlot || economyEnabled) && (
            <p className="text-center text-[11px] text-subtle">
              {storyLocked ? (
                <>
                  Finish <span className="text-muted">{storyLockPre?.title}</span> first — this
                  unlocks automatically.
                </>
              ) : !hasOpenSlot && (canAfford || hasVoucher) ? (
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
          )}
          {/* The graceful way OUT of the backlog: no more faking a "Beaten" to
              declutter — retire it to the Finished shelf as an honest drop. On a
              collapsed stack, ask which version first (like Buy & Start). */}
          <button
            onClick={() => (stackVersions ? setStackPick("retire") : setRetiring(true))}
            title={`Done with ${game.title}? Retire it out of your Bazaar`}
            className="inline-flex items-center justify-center gap-1.5 text-xs text-subtle transition hover:text-ink"
          >
            <FlagOff size={13} /> Retire it
          </button>
          {retiring && (
            <RetireModal
              title={game.title}
              fromLane={false}
              refund={0}
              refundPct={shelveRefundPct}
              onConfirm={(note) => {
                void retireGame(game.id, note);
                setRetiring(false);
              }}
              onClose={() => setRetiring(false)}
            />
          )}
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
              <span className="inline-flex items-center gap-1" title={familyPlayedTitle}>
                <Clock size={13} className="text-accent" /> {formatPlaytime(displayPlayed)} played
                {familyPlayed != null && <span className="text-subtle">· family total</span>}
              </span>
            </div>
            {pactLocksLog ? (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-subtle">
                <Handshake size={12} className="mt-0.5 shrink-0 text-accent" />
                <span>
                  {pact?.partnerName ?? "Player 1"} logs your shared time while the pact is on —
                  it lands here automatically.
                </span>
              </p>
            ) : (
              <>
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
                <div
                  className={
                    "mt-2 flex gap-2 rounded-lg" +
                    (coachTarget === "log-time" && game.status === "playing" ? coachRing : "")
                  }
                >
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
                {pactSharesLog && (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-subtle">
                    <Handshake size={12} className="shrink-0 text-accent" />
                    Time you log also counts for {pact?.partnerName ?? "your co-op partner"}.
                  </p>
                )}
                {showStopwatch &&
                  (sessionOnThis ? (
                    <button
                      onClick={() => openSessionStop()}
                      title={`Stop the stopwatch and log the time on ${game.title}`}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-brand bg-brand/10 px-2 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/20"
                    >
                      <Timer size={13} /> Stop stopwatch ·{" "}
                      <span className="tabular-nums">
                        {activeSession ? formatElapsed(activeSession.startedAt, now) : ""}
                      </span>
                    </button>
                  ) : activeSession ? (
                    <button
                      onClick={() => openSessionStop()}
                      title="One stopwatch at a time — stop it to start one here"
                      className="mt-2 inline-flex w-full items-center justify-center gap-1.5 text-[11px] text-subtle transition hover:text-ink"
                    >
                      <Timer size={12} /> Stopwatch running on {activeSession.gameTitle} — tap to
                      stop
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const version = showVersionPicker ? selectedVersion : undefined;
                        void startPlaySession(game.id, version?.platform, version?.format);
                      }}
                      title={`Start a stopwatch — stopping it logs the play time on ${game.title}`}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-xs font-medium text-muted transition hover:border-brand hover:text-ink"
                    >
                      <Timer size={13} /> Start stopwatch
                    </button>
                  ))}
              </>
            )}
          </div>
          <button
            onClick={() => withSessionStopped(() => finishGame(game.id))}
            title={finishHint({ reward, isCompletionist, willReplay, isResumed })}
            className={
              "inline-flex items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-success bg-success/10 px-3 py-2 text-sm font-semibold text-success shadow-stamp-sm transition hover:bg-success/20 active:translate-x-px active:translate-y-px active:shadow-none" +
              (coachTarget === "finish" && game.status === "playing" ? coachRing : "")
            }
          >
            <Check size={15} /> {isCompletionist ? "Mark Complete" : "Mark Finished"}
            {reward > 0 && (
              <>
                {" "}
                · <CoinIcon size={15} /> {reward}
              </>
            )}
          </button>
          {lane === "replay" ? (
            // Two distinct exits for a replay: "Mark Finished" above is a re-clear that
            // pays the Replay Bonus; this cancels the replay — back to Finished with no
            // bonus, as if you never pulled it back.
            <button
              onClick={() => withSessionStopped(() => abortReplay(game.id))}
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
              onClick={() => withSessionStopped(() => abandonCompletion(game.id))}
              title={`Abandon the 100% run and move ${game.title} back to Finished`}
              className="inline-flex items-center justify-center gap-1.5 text-xs text-subtle transition hover:text-ink"
            >
              <Undo2 size={13} /> Abandon Completion
            </button>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                <button
                  onClick={() => withSessionStopped(() => setShelving(true))}
                  title={`Shelve ${game.title} back into the Bazaar for later`}
                  className="inline-flex items-center justify-center gap-1.5 text-xs text-subtle transition hover:text-ink"
                >
                  <Undo2 size={13} /> Shelve it
                  {shelveRefund > 0 && (
                    <span className="inline-flex items-center gap-1">
                      · +<CoinIcon size={12} /> {shelveRefund}
                    </span>
                  )}
                </button>
                {/* Same salvage as Shelve, but terminal: straight to the Finished
                    shelf as Retired instead of back into the backlog. */}
                <button
                  onClick={() => withSessionStopped(() => setRetiring(true))}
                  title={`Done with ${game.title} for good? Retire it to the Finished shelf`}
                  className="inline-flex items-center justify-center gap-1.5 text-xs text-subtle transition hover:text-ink"
                >
                  <FlagOff size={13} /> Retire it
                </button>
              </div>
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
              {retiring && (
                <RetireModal
                  title={game.title}
                  fromLane
                  refund={shelveRefund}
                  refundPct={shelveRefundPct}
                  onConfirm={(note) => {
                    void retireGame(game.id, note);
                    setRetiring(false);
                  }}
                  onClose={() => setRetiring(false)}
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
            {displayPlayed > 0 && (
              <span className="text-subtle" title={familyPlayedTitle}>
                · {formatPlaytime(displayPlayed)} played
              </span>
            )}
          </div>

          {/* Subtle "what next" actions — each opens a confirm dialog carrying the
              payout details, so the card stays uncluttered. Actions stay visible but
              disable (with a reason) when their target lane is full; "Go for 100%" is
              hidden only when the game is already Completed (redundant). */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
            {game.finishTag === "retired" ? (
              // A retired game has no free re-entry (replay / 100% / Endless are
              // for real clears). Its one road back is the Bazaar — full price.
              <button
                onClick={() => setFinishedAction("unretire")}
                title={`Return ${game.title} to your Bazaar — playing it again is a normal buy`}
                className="inline-flex items-center gap-1.5 text-xs text-subtle transition hover:text-ink"
              >
                <Store size={13} /> Return to Bazaar
              </button>
            ) : (
              <>
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
                    title={`Convert ${game.title} into an ongoing Rotation game`}
                    className="inline-flex items-center gap-1.5 text-xs text-subtle transition hover:text-ink"
                  >
                    <InfinityIcon size={13} /> Convert to Endless
                  </button>
                )}
              </>
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
                      : finishedAction === "unretire"
                        ? "Return it to the Bazaar?"
                        : "Convert to Endless?"
                }
                body={
                  finishedAction === "unretire" ? (
                    <>
                      Give <span className="font-medium text-ink">{game.title}</span> another
                      chance: it returns to your Bazaar with the Retired tag cleared. Playing it
                      again is a normal buy at its full price — retiring never earns a free
                      re-entry.
                    </>
                  ) : finishedAction === "replay" ? (
                    showEconomy ? (
                      <>
                        Pull <span className="font-medium text-ink">{game.title}</span> back into Now
                        Playing for free. Finishing it again pays the smaller{" "}
                        <CoinIcon size={12} /> {computeFinishReward(true, bounty, replayBonusPct)} Replay
                        Bonus.
                      </>
                    ) : (
                      <>
                        Pull <span className="font-medium text-ink">{game.title}</span> back into Now
                        Playing for another run.
                      </>
                    )
                  ) : finishedAction === "completion" ? (
                    showEconomy ? (
                      <>
                        Pull <span className="font-medium text-ink">{game.title}</span> back into Now
                        Playing to 100% it. Completing pays the <CoinIcon size={12} /> Completion Bonus
                        on top of the base reward.
                      </>
                    ) : (
                      <>
                        Pull <span className="font-medium text-ink">{game.title}</span> back into Now
                        Playing to 100% it.
                      </>
                    )
                  ) : (
                    <>
                      Turn <span className="font-medium text-ink">{game.title}</span> into an ongoing
                      Rotation game. It earns a weekly check-in instead of a finish bounty — and it&apos;s
                      fully reversible: remove it from Rotation anytime and it returns here
                      {game.finishTag ? (
                        <>
                          {" "}
                          with its{" "}
                          <span className="font-medium text-ink">{finishTagLabel(game.finishTag)}</span>{" "}
                          badge
                        </>
                      ) : null}
                      , a regular finished game again.
                    </>
                  )
                }
                confirmLabel={
                  finishedAction === "replay"
                    ? "Replay"
                    : finishedAction === "completion"
                      ? "Go for completion"
                      : finishedAction === "unretire"
                        ? "Return to Bazaar"
                        : "Convert"
                }
                onConfirm={() => {
                  if (finishedAction === "replay") replayGame(game.id);
                  else if (finishedAction === "completion") enterCompletionist(game.id);
                  else if (finishedAction === "unretire") unretireGame(game.id);
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
          {!economyEnabled ? (
            // Economy off: importing is free — no charter involved.
            <button
              onClick={() =>
                stackVersions ? setStackPick("import") : importWithCharter(game.id)
              }
              title="Move this into your Bazaar"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-stamp-sm transition hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-none"
            >
              <Stamp size={15} /> Import to your Bazaar
            </button>
          ) : charters > 0 ? (
            <button
              onClick={() =>
                stackVersions ? setStackPick("import") : importWithCharter(game.id)
              }
              title="Spend one Import Charter to move this into your Bazaar"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-stamp-sm transition hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-none"
            >
              <Scroll size={15} /> Consume 1 Charter to Import
            </button>
          ) : (
            <button
              onClick={openCharters}
              title="You need an Import Charter to move this into your Bazaar"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-edge bg-panel px-3 py-2 text-sm font-semibold text-ink shadow-stamp-sm transition hover:bg-surface active:translate-x-px active:translate-y-px active:shadow-none"
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
export function ReadOnlyFooter({
  game,
  familyMembers,
}: {
  game: Game;
  /** Unified family card while visiting: display the family's summed hours. */
  familyMembers?: Game[];
}) {
  const economy = useStore((s) => s.economy);
  // A visited player who turned the coin economy off has no unlock prices.
  const hostEconomyOn = useStore((s) => s.viewing?.economyEnabled !== false);
  const played =
    familyMembers && familyMembers.length > 1
      ? familyStats(familyMembers).totalPlayed
      : (game.playedHours ?? 0);

  if (game.status === "backlog") {
    // A visited pre-order isn't startable, so its unlock price is noise —
    // show the countdown the owner sees instead.
    if (isPreordered(game)) {
      return (
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
          <CalendarClock size={13} />
          {game.preorderExpectedOn
            ? `Pre-ordered · ${preorderCountdownLabel(game.preorderExpectedOn)}`
            : "Pre-ordered"}
        </div>
      );
    }
    return (
      <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-xs text-muted">
        {hostEconomyOn ? (
          <>
            <CoinIcon size={13} /> {computeFormula(game, economy.price)} to unlock
          </>
        ) : (
          <>
            <Store size={13} /> In their Bazaar
          </>
        )}
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
