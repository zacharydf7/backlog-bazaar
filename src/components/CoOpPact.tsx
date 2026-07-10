import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Handshake, X, Check, Ban, Unlink } from "lucide-react";
import type { CoOpPact, CoOpPartnerOption, Game } from "../types";
import { useStore } from "../store";
import { activePactForCard, pactForGame, pactStatusLine } from "../lib/coopPacts";
import { computeFormula } from "../lib/economy";
import { computeFamilyDiscountPrice } from "../lib/pricing";
import { formatPlaytime } from "../lib/playtime";
import { isFamilyDiscounted } from "../lib/families";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { Avatar } from "./Avatar";
import { CoinIcon } from "./CoinIcon";
import { ConfirmDialog } from "./ConfirmDialog";

/** Pick a friend who owns this game too and send them a Co-op Pact invite
 *  (issue d57afe4f). The list comes from the server (co_op_partner_options):
 *  accepted friends holding the same catalog identity, with no live pact on it. */
export function CoOpInviteModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const { fetchCoOpPartnerOptions, inviteCoOpPact } = useStore();
  const [options, setOptions] = useState<CoOpPartnerOption[] | null>(null);
  const [sending, setSending] = useState<string | null>(null);

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
    const ok = await inviteCoOpPact(game.id, partnerId);
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
          Pledge to finish <span className="font-medium text-ink">{game.title}</span> together with
          a friend who owns it too. You&apos;ll both see the pact on your cards.
        </p>
        {options == null ? (
          <p className="py-6 text-center text-sm text-muted">Checking your friends…</p>
        ) : options.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            None of your friends own this game yet (or they&apos;re already in a pact for it).
          </p>
        ) : (
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
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
                <span className="shrink-0 text-xs font-medium text-accent">
                  {sending === o.id ? "Inviting…" : "Invite"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
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

  const pact = pactForGame(coOpPacts, game);
  if (!pact) return null;

  // The activation fee an accept would charge for a Bazaar copy — the same
  // math as the buy button, so the fee shown is the fee paid.
  const fullPrice = computeFormula(game, economy.price);
  const price = isFamilyDiscounted(games, game)
    ? computeFamilyDiscountPrice(fullPrice, replayBonusPct)
    : fullPrice;
  const needsBuy = game.status === "backlog";
  const canAfford = !needsBuy || coins >= price;

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
            {needsBuy ? (
              <>
                Accept &amp; start · {price} <CoinIcon size={12} />
              </>
            ) : (
              "Accept"
            )}
          </button>
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

/** The compact chip marking an active shared playthrough on a board card: the
 *  partner's avatar + a Co-op tag, in the card's marker-chip style. */
export function CoOpBadge({ pact }: { pact: CoOpPact }) {
  return (
    <span
      title={`Co-op Pact with ${pact.partnerName ?? "a friend"} — finish it together`}
      className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 py-0.5 pl-0.5 pr-1.5 text-[10px] font-medium text-accent"
    >
      <Avatar url={pact.partnerAvatar} name={pact.partnerName ?? "?"} size={14} />
      <Handshake size={10} /> Co-op
    </span>
  );
}

/** Convenience: this card's active pact, or null. Re-exported through a hook so
 *  card call sites stay one line. */
export function useActivePact(gameId: string): CoOpPact | null {
  const pacts = useStore((s) => s.coOpPacts);
  return activePactForCard(pacts, gameId);
}
