import { useEffect, useState } from "react";
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
  ArrowRightLeft,
  Scroll,
  Ticket,
  Timer,
  RotateCcw,
  Infinity as InfinityIcon,
  type LucideIcon,
} from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { ActivationModal } from "./ActivationModal";
import { canRedeemVoucher } from "../lib/vouchers";
import {
  canStartGame,
  movableTargetedSlots,
  openReplaySlots,
  playingGames,
  type SlotKind,
} from "../lib/slots";
import { isReplayFinish } from "../lib/families";
import { parsePlaytime, formatPlaytime } from "../lib/playtime";
import { summarizePlatformPlaytime } from "../lib/platformPlaytime";
import { ownedVersions, versionKey, versionLabel } from "../lib/copies";
import { computeFinishReward, computeShelveRefund } from "../lib/pricing";
import {
  computeFormula,
  formulaBreakdown,
  signedCoins,
  FACTOR_KEYS,
  FACTOR_META,
  type FactorKey,
} from "../lib/economy";
import { CoinIcon } from "./CoinIcon";

// Icon per targeted-slot kind, for the Now Playing slot badge.
const SLOT_KIND_ICON: Record<SlotKind, LucideIcon> = {
  standard: Timer,
  endless: InfinityIcon,
  replay: RotateCcw,
};

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
    logPlaytime,
    abandonGame,
    moveGameToSlot,
    importWithCharter,
    charters,
    openCharters,
    setProgressNote,
    fetchPlaySessions,
    shelveRefundPct,
    replayBonusPct,
    economy,
    games,
    generalSlots,
    myTargetedSlots,
  } = useStore();
  const [showWhy, setShowWhy] = useState(false);
  const [activating, setActivating] = useState(false);
  const [logHours, setLogHours] = useState("");
  const [logVersionKey, setLogVersionKey] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [shelving, setShelving] = useState(false);

  const price = computeFormula(game, economy.price);
  const bounty = computeFormula(game, economy.bounty);
  const willReplay = isReplayFinish(games, game);
  const reward = computeFinishReward(willReplay, bounty, replayBonusPct);
  const shelveRefund = computeShelveRefund(game.pricePaid ?? price, shelveRefundPct);
  const canAfford = coins >= price;
  const hasVoucher = canRedeemVoucher(vouchers, game.status);
  const hasOpenSlot = canStartGame(game, games, generalSlots, myTargetedSlots);
  // You can open the activation chooser if there's a slot AND a way to pay —
  // coins or a voucher.
  const canActivate = hasOpenSlot && (canAfford || hasVoucher);
  // The targeted slot (if any) this game occupies — drives the kind-aware badge.
  const currentSlot =
    game.slotId != null ? (myTargetedSlots.find((s) => s.id === game.slotId) ?? null) : null;
  const moveTargets =
    game.status === "playing"
      ? movableTargetedSlots(game, playingGames(games), myTargetedSlots)
      : [];
  // Open Replay slots let a finished game be pulled back into play (free).
  const replaySlots =
    game.status === "finished" ? openReplaySlots(playingGames(games), myTargetedSlots) : [];
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
          {currentSlot ? (
            // Kind-aware badge: which targeted slot (Standard / Endless / Replay)
            // this game occupies.
            (() => {
              const Icon = SLOT_KIND_ICON[currentSlot.definition.kind];
              return (
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                  <Icon size={11} /> {currentSlot.definition.name} slot
                </span>
              );
            })()
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-[11px] font-medium text-muted">
                <Gamepad2 size={11} /> General slot
              </span>
              {moveTargets.length > 0 && (
                <>
                  <span className="text-[11px] text-subtle">move to:</span>
                  {moveTargets.map((t) => {
                    const Icon = SLOT_KIND_ICON[t.definition.kind];
                    return (
                      <button
                        key={t.id}
                        onClick={() => moveGameToSlot(game.id, t.id)}
                        title={`Move ${game.title} into your ${t.definition.name} slot and free a general slot`}
                        className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/5 px-2 py-0.5 text-[11px] font-medium text-accent transition hover:bg-accent/15"
                      >
                        <Icon size={11} /> {t.definition.name}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
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
              Finish bounty <CoinIcon size={12} /> {reward}
            </span>
            <span className="text-subtle"> — paid when you mark this finished.</span>
            {willReplay && (
              <span className="mt-0.5 block text-accent">
                Replay clear — another edition in this family is already finished, so this pays the
                smaller <CoinIcon size={12} /> {reward} Replay Bonus.
              </span>
            )}
          </div>
          <button
            onClick={() => finishGame(game.id)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:brightness-95"
          >
            <Check size={15} /> Mark Finished + <CoinIcon size={15} />
          </button>
          {shelving ? (
            <div className="rounded-xl border border-line bg-panel p-2.5 text-xs">
              <p className="text-muted">
                Shelve <span className="font-medium text-ink">{game.title}</span> back into the
                Bazaar?{" "}
                {shelveRefund > 0 ? (
                  <>
                    You&apos;ll be refunded{" "}
                    <span className="inline-flex items-center gap-1 font-semibold text-success">
                      <CoinIcon size={12} /> {shelveRefund}
                    </span>{" "}
                    ({shelveRefundPct}% of what you paid) — the rest is forfeited.
                  </>
                ) : (
                  <>No coins are refunded.</>
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    abandonGame(game.id);
                    setShelving(false);
                  }}
                  className="flex-1 rounded-lg bg-danger px-2 py-1.5 font-semibold text-white transition hover:brightness-105 active:brightness-95"
                >
                  {shelveRefund > 0 ? (
                    <span className="inline-flex items-center justify-center gap-1">
                      Shelve · +<CoinIcon size={13} /> {shelveRefund}
                    </span>
                  ) : (
                    "Shelve it"
                  )}
                </button>
                <button
                  onClick={() => setShelving(false)}
                  className="flex-1 rounded-lg border border-line px-2 py-1.5 text-muted transition hover:bg-surface hover:text-ink"
                >
                  Keep playing
                </button>
              </div>
            </div>
          ) : (
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
          )}
        </div>
      )}

      {game.status === "finished" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-success/15 px-3 py-2 text-center text-sm font-medium text-success">
            <Trophy size={15} /> Finished{played ? ` · ${formatPlaytime(played)} played` : ""}
          </div>
          {/* Replay: pull this finished game back into a free Replay slot. Shown
              only when the player holds an open one. */}
          {replaySlots.length > 0 && (
            <>
              <button
                onClick={() => replayGame(game.id, replaySlots[0].id)}
                title={`Replay ${game.title} for free in your ${replaySlots[0].definition.name} slot`}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-accent/50 bg-accent/5 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/15 active:scale-[0.99]"
              >
                <RotateCcw size={15} /> Replay — free
              </button>
              <p className="text-center text-[11px] text-subtle">
                Back into Now Playing at no cost. Finishing again pays the smaller{" "}
                <CoinIcon size={11} /> {computeFinishReward(true, bounty, replayBonusPct)} Replay Bonus.
              </p>
            </>
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
