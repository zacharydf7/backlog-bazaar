import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Handshake, Hourglass, X, Check, Ban, Unlink, Users } from "lucide-react";
import type { CoOpPact, CoOpPartnerOption, Game } from "../types";
import { useStore } from "../store";
import {
  activePactForCard,
  isPlayer2Join,
  pactForGame,
  pactJoinDraft,
  pactStatusLine,
  player2Invites,
} from "../lib/coopPacts";
import { computeFormula } from "../lib/economy";
import { computeFamilyDiscountPrice } from "../lib/pricing";
import { formatPlaytime } from "../lib/playtime";
import { isFamilyDiscounted } from "../lib/families";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { Avatar } from "./Avatar";
import { CoinIcon } from "./CoinIcon";
import { ConfirmDialog } from "./ConfirmDialog";

/** Pick a friend and send them a Co-op Pact invite (issue d57afe4f). The list
 *  comes from the server (co_op_partner_options): every accepted friend with no
 *  live pact on this game — friends who don't own it join as Player 2 on the
 *  inviter's copy (it's auto-added to their library when they accept). The
 *  inviter can also offer to cover the partner's activation fee. */
export function CoOpInviteModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const { fetchCoOpPartnerOptions, inviteCoOpPact } = useStore();
  const [options, setOptions] = useState<CoOpPartnerOption[] | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [coverFee, setCoverFee] = useState(false);

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  useEffect(() => {
    let active = true;
    void fetchCoOpPartnerOptions(game.id).then((list) => active && setOptions(list));
    return () => {
      active = false;
    };
  }, [game.id, fetchCoOpPartnerOptions]);

  async function invite(partnerId: string) {
    if (sending) return;
    setSending(partnerId);
    const ok = await inviteCoOpPact(game.id, partnerId, coverFee);
    setSending(null);
    if (ok) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg text-ink">
            <Handshake size={18} className="text-accent" /> Invite to Co-op Pact
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted transition hover:bg-panel hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">
          Pledge to finish <span className="font-medium text-ink">{game.title}</span> together.
          Friends who don&apos;t own it can join as{" "}
          <span className="font-medium text-ink">Player 2</span> on your copy. While the pact is
          in play your card sits in the Co-op lane — no Focus slot used.
        </p>
        {options == null ? (
          <p className="py-6 text-center text-sm text-muted">Checking your friends…</p>
        ) : options.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No friends are available for a pact on this game right now (they may already be in
            one for it).
          </p>
        ) : (
          <>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={sending != null}
                  onClick={() => void invite(o.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-panel/50 px-2.5 py-2 text-left transition hover:border-brand/50 disabled:opacity-60"
                >
                  <Avatar url={o.avatarUrl} name={o.displayName} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{o.displayName}</span>
                  {!o.ownsGame && (
                    <span
                      title="Doesn't own this game — they'd join as Player 2 on your copy"
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-panel px-1.5 py-0.5 text-[10px] font-medium text-muted"
                    >
                      <Users size={10} /> Player 2
                    </span>
                  )}
                  <span className="shrink-0 text-xs font-medium text-accent">
                    {sending === o.id ? "Inviting…" : "Invite"}
                  </span>
                </button>
              ))}
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-panel/50 px-2.5 py-2">
              <input
                type="checkbox"
                checked={coverFee}
                onChange={(e) => setCoverFee(e.target.checked)}
                className="mt-0.5 accent-[var(--brand)]"
              />
              <span className="text-xs text-muted">
                <span className="font-medium text-ink">Cover their activation fee</span> — charged
                to you when they accept, so coins never stand between you. If you can&apos;t
                afford it at that moment, they pay as usual.
              </span>
            </label>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The accept surface for an invite on a game the player doesn't own: previews
 *  the game from the inviter's card, explains the Player 2 copy, and prices the
 *  activation (or shows it covered). Accepting auto-adds the game and starts it
 *  in the Co-op lane. */
export function PactJoinModal({ pact, onClose }: { pact: CoOpPact; onClose: () => void }) {
  const { games, coins, economy, coOpBonusPct, joinCoOpPact, declineCoOpPact } = useStore();
  const [working, setWorking] = useState(false);

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  const name = pact.partnerName ?? "A friend";
  // The rare case the player picked the game up since the invite: the server
  // binds their own copy instead of creating one — say so instead of the
  // Player 2 pitch.
  const joining = isPlayer2Join(pact, games);
  const price = computeFormula(pactJoinDraft(pact), economy.price);
  const canAfford = pact.coversFee || coins >= price;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg text-ink">
            <Handshake size={18} className="text-accent" /> Co-op Pact invite
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted transition hover:bg-panel hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-3">
          {pact.partnerGameImage && (
            <img
              src={pact.partnerGameImage}
              alt=""
              className="h-16 w-12 shrink-0 rounded-lg border border-line object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-base text-ink">{pact.title}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Avatar url={pact.partnerAvatar} name={name} size={16} />
              <span className="truncate">{name} wants to finish it together</span>
            </p>
          </div>
        </div>

        {joining ? (
          <p className="mb-3 text-xs text-muted">
            You don&apos;t own this game — accepting adds it to your library as a{" "}
            <span className="font-medium text-ink">Player 2</span> copy
            {pact.partnerGamePlatform ? ` on ${pact.partnerGamePlatform}` : ""} (you&apos;ll play
            on {name}&apos;s copy; no Import Charter needed). It starts right away in your Co-op
            lane.
          </p>
        ) : (
          <p className="mb-3 text-xs text-muted">
            Accepting binds your own copy and starts it in your Co-op lane.
          </p>
        )}

        <div className="mb-3 rounded-lg border border-line bg-panel/50 px-3 py-2 text-xs text-muted">
          {pact.coversFee ? (
            <span>
              Activation fee: <span className="font-medium text-success">covered by {name}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              Activation fee: <span className="font-medium text-ink">{price}</span>
              <CoinIcon size={12} />
            </span>
          )}
          {coOpBonusPct > 0 && (
            <span className="block text-subtle">
              +{coOpBonusPct}% bounty each when you both finish.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={working || !canAfford}
            onClick={async () => {
              setWorking(true);
              const ok = await joinCoOpPact(pact.id);
              setWorking(false);
              if (ok) onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-brand-fg transition hover:brightness-95 disabled:opacity-60"
          >
            <Check size={13} /> Accept &amp; start
          </button>
          <button
            type="button"
            disabled={working}
            onClick={async () => {
              setWorking(true);
              const ok = await declineCoOpPact(pact.id);
              setWorking(false);
              if (ok) onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-medium text-muted transition hover:text-ink disabled:opacity-60"
          >
            <Ban size={13} /> Decline
          </button>
          {!canAfford && <span className="text-[11px] text-danger">Not enough coins</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The Bazaar-top strip listing pending pact invites for games the player
 *  doesn't own — with no card to host the pact banner, this is where those
 *  invites live (plus the notification). Renders nothing while visiting
 *  another player's bazaar or when there's nothing pending. */
export function PactInviteStrip() {
  const { coOpPacts, games, viewing } = useStore();
  const [openPactId, setOpenPactId] = useState<string | null>(null);

  if (viewing) return null;
  const invites = player2Invites(coOpPacts, games);
  if (invites.length === 0) return null;
  const open = openPactId ? invites.find((p) => p.id === openPactId) : null;

  return (
    <div className="mb-4 rounded-xl border border-brand/40 bg-brand/5 p-3">
      <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent">
        <Handshake size={14} /> Pact invites
      </div>
      <div className="flex flex-wrap gap-1.5">
        {invites.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpenPactId(p.id)}
            title={`${p.partnerName ?? "A friend"} invites you to finish ${p.title} together`}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-panel py-1 pl-1 pr-2.5 text-xs text-ink transition hover:border-brand/40"
          >
            <Avatar url={p.partnerAvatar} name={p.partnerName ?? "?"} size={18} />
            <span className="truncate">{p.title}</span>
            <span className="shrink-0 text-subtle">from {p.partnerName ?? "a friend"}</span>
          </button>
        ))}
      </div>
      {open && <PactJoinModal pact={open} onClose={() => setOpenPactId(null)} />}
    </div>
  );
}

/** The pact strip on a game's page (owner only): the incoming invite with
 *  Accept (priced like a normal activation when the copy is in the Bazaar) and
 *  Decline, the outgoing wait state, the active pact with its partner and the
 *  Dissolve escape hatch, or a short recently-ended line. Renders nothing when
 *  no pact touches this game. */
export function CoOpPactBanner({ game }: { game: Game }) {
  const { coOpPacts, games, coins, economy, replayBonusPct, acceptCoOpPact, declineCoOpPact, dissolveCoOpPact } =
    useStore();
  const [working, setWorking] = useState(false);
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const [reviewJoin, setReviewJoin] = useState(false);

  const pact = pactForGame(coOpPacts, game);
  if (!pact) return null;

  // A wishlist-only entry can't bind (it stays a want-list for a copy of your
  // own) — an incoming invite on it goes through the Player 2 join flow, which
  // creates the playing copy alongside it.
  const wishlistJoin =
    game.status === "wishlist" && pact.status === "pending" && !pact.iAmInviter;

  // The activation fee an accept would charge for a Bazaar copy — the same
  // math as the buy button, so the fee shown is the fee paid. An inviter
  // offering to cover it lifts the coin gate (the server settles who pays).
  const fullPrice = computeFormula(game, economy.price);
  const price = isFamilyDiscounted(games, game)
    ? computeFamilyDiscountPrice(fullPrice, replayBonusPct)
    : fullPrice;
  const needsBuy = game.status === "backlog";
  const canAfford = !needsBuy || pact.coversFee || coins >= price;

  const partnerChip = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar url={pact.partnerAvatar} name={pact.partnerName ?? "?"} size={22} />
      <span className="truncate text-sm font-medium text-ink">{pact.partnerName ?? "Someone"}</span>
      {/* Relative progress: the partner's logged hours on their bound copy. */}
      {pact.status === "active" && pact.partnerHours != null && pact.partnerHours > 0 && (
        <span className="shrink-0 text-xs text-subtle">
          {formatPlaytime(pact.partnerHours)} in
        </span>
      )}
    </span>
  );

  return (
    <section
      data-testid="coop-pact-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-brand/40 bg-brand/5 px-3.5 py-2.5"
    >
      <Handshake size={17} className="shrink-0 text-accent" />
      {partnerChip}
      <span className="min-w-0 flex-1 text-sm text-muted">
        {pactStatusLine(pact)}
        {/* The carrot: both finishing pays each side an extra cut of their own
            bounty (snapshotted on the pact at accept). */}
        {pact.status === "active" && (pact.bonusPct ?? 0) > 0 && (
          <span className="text-subtle"> · +{pact.bonusPct}% bounty each when you both finish</span>
        )}
      </span>

      {pact.status === "pending" && !pact.iAmInviter && (
        <span className="flex items-center gap-2">
          {wishlistJoin ? (
            <button
              type="button"
              disabled={working}
              onClick={() => setReviewJoin(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-brand-fg transition hover:brightness-95 disabled:opacity-60"
            >
              <Check size={13} /> Review invite
            </button>
          ) : (
            <button
              type="button"
              disabled={working || !canAfford}
              onClick={async () => {
                setWorking(true);
                await acceptCoOpPact(pact.id, game.id);
                setWorking(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-brand-fg transition hover:brightness-95 disabled:opacity-60"
            >
              <Check size={13} />
              {!needsBuy ? (
                "Accept"
              ) : pact.coversFee ? (
                <>Accept &amp; start · fee on {pact.partnerName ?? "them"}</>
              ) : (
                <>
                  Accept &amp; start · {price} <CoinIcon size={12} />
                </>
              )}
            </button>
          )}
          <button
            type="button"
            disabled={working}
            onClick={async () => {
              setWorking(true);
              await declineCoOpPact(pact.id);
              setWorking(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-ink disabled:opacity-60"
          >
            <Ban size={13} /> Decline
          </button>
          {needsBuy && !canAfford && (
            <span className="text-[11px] text-danger">Not enough coins</span>
          )}
        </span>
      )}
      {reviewJoin && <PactJoinModal pact={pact} onClose={() => setReviewJoin(false)} />}

      {(pact.status === "active" || (pact.status === "pending" && pact.iAmInviter)) && (
        <button
          type="button"
          disabled={working}
          onClick={() => setConfirmDissolve(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-danger disabled:opacity-60"
        >
          <Unlink size={13} /> {pact.status === "pending" ? "Withdraw" : "Dissolve"}
        </button>
      )}

      {confirmDissolve &&
        createPortal(
          <ConfirmDialog
            tone="danger"
            title={pact.status === "pending" ? "Withdraw this invite?" : "Dissolve the pact?"}
            body={
              pact.status === "pending"
                ? `${pact.partnerName ?? "Your friend"} will be told you withdrew the pact invite for ${pact.title}.`
                : `Breaking the pact shelves your copy back to the Bazaar (standard refund). ${
                    pact.partnerName ?? "Your partner"
                  } keeps playing solo, without the pact bonus.`
            }
            confirmLabel={pact.status === "pending" ? "Withdraw" : "Dissolve"}
            onConfirm={async () => {
              setConfirmDissolve(false);
              setWorking(true);
              await dissolveCoOpPact(pact.id);
              setWorking(false);
            }}
            onCancel={() => setConfirmDissolve(false)}
          />,
          document.body,
        )}
    </section>
  );
}

/** The compact chip marking a shared playthrough on a board card: the partner's
 *  avatar + a Co-op tag, in the card's marker-chip style. A PENDING outgoing
 *  invite (the copy already waits in the Co-op lane) reads as "Co-op · invited"
 *  in a dashed chip until the friend decides. */
export function CoOpBadge({ pact }: { pact: CoOpPact }) {
  const pending = pact.status === "pending";
  return (
    <span
      title={
        pending
          ? `Waiting for ${pact.partnerName ?? "your friend"} to accept the Co-op Pact`
          : `Co-op Pact with ${pact.partnerName ?? "a friend"} — finish it together`
      }
      className={
        "inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1.5 text-[10px] font-medium text-accent " +
        (pending
          ? "border border-dashed border-brand/40 bg-brand/5"
          : "border border-brand/40 bg-brand/10")
      }
    >
      <Avatar url={pact.partnerAvatar} name={pact.partnerName ?? "?"} size={14} />
      {pending ? (
        <>
          <Hourglass size={10} /> Co-op · invited
        </>
      ) : (
        <>
          <Handshake size={10} /> Co-op
        </>
      )}
    </span>
  );
}

/** Convenience: this card's live pact (active, or a pending invite bound to
 *  it), or null. Re-exported through a hook so card call sites stay one line. */
export function useActivePact(gameId: string): CoOpPact | null {
  const pacts = useStore((s) => s.coOpPacts);
  return activePactForCard(pacts, gameId);
}
