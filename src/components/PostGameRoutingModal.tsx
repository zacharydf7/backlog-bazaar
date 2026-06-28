import { createPortal } from "react-dom";
import { Trophy, Target, ArrowRight, Lock, Infinity as InfinityIcon, type LucideIcon } from "lucide-react";
import { useStore } from "../store";
import { canEnterLane } from "../lib/slots";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

/**
 * The post-game routing prompt. After a Focus-lane game is finished (its bounty
 * already awarded and tagged "Beaten"), the player picks the game's next life:
 * leave it on the Finished board, pull it into the Completionist lane for a 100%
 * run, or convert it into an ongoing Rotation game. Driven by store.pendingRouteId
 * (set by finishGame); rendered once at the App level so it survives the finishing
 * card unmounting from the board. Closing leaves the game Finished — it can still be
 * routed later from its Finished card.
 */
export function PostGameRoutingModal() {
  const pendingRouteId = useStore((s) => s.pendingRouteId);
  const games = useStore((s) => s.games);
  const completionistSlots = useStore((s) => s.completionistSlots);
  const rotationSlots = useStore((s) => s.rotationSlots);
  const setPendingRoute = useStore((s) => s.setPendingRoute);
  const enterCompletionist = useStore((s) => s.enterCompletionist);
  const convertToEndless = useStore((s) => s.convertToEndless);

  const game = pendingRouteId ? games.find((g) => g.id === pendingRouteId) : null;

  useScrollLock(game != null);
  useHistoryDismiss(game != null, () => setPendingRoute(null));

  // The game may have moved on (e.g. routed) — render nothing then.
  if (!game || game.status !== "finished") return null;

  const close = () => setPendingRoute(null);
  const canGrind = canEnterLane(game, games, "completionist", completionistSlots);
  const canConvert = canEnterLane(game, games, "rotation", rotationSlots);

  async function grind() {
    await enterCompletionist(game!.id);
    close();
  }
  async function convert() {
    await convertToEndless(game!.id);
    close();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pb-2 pt-4">
          <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-success">
            <Trophy size={15} /> Finished!
          </span>
          <h2 className="mt-2 font-display text-lg leading-tight text-ink">{game.title}</h2>
          <p className="mt-1 text-sm text-muted">
            Bounty paid. What&apos;s next for it? You can always decide later from the Finished board.
          </p>
        </div>

        <div className="flex flex-col gap-2 px-5 pb-5 pt-2">
          <RouteButton
            icon={Trophy}
            label="Move to Finished"
            sub="Done — shelve it on the Finished board"
            onClick={close}
          />
          <RouteButton
            icon={Target}
            label="Grind to 100%"
            sub={canGrind ? "Into the Completionist lane" : "Completionist lane is full"}
            disabled={!canGrind}
            onClick={grind}
          />
          <RouteButton
            icon={InfinityIcon}
            label="Convert to Endless"
            sub={canConvert ? "Into the Rotation lane — weekly check-ins" : "Rotation lane is full"}
            disabled={!canConvert}
            onClick={convert}
          />
          <p className="px-1 pt-0.5 text-center text-[11px] text-subtle">
            Tagged <span className="font-medium text-ink">Beaten</span> for now — Grind to 100%
            earns <span className="font-medium text-ink">Completed</span> when you finish it.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RouteButton({
  icon: Icon,
  label,
  sub,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  sub: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-left transition hover:border-brand hover:bg-brand/5 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:bg-transparent"
    >
      <span className="flex items-center gap-2.5">
        {disabled ? (
          <Lock size={17} className="text-subtle" />
        ) : (
          <Icon size={17} className="text-accent" />
        )}
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-ink">{label}</span>
          <span className="text-[11px] text-subtle">{sub}</span>
        </span>
      </span>
      {!disabled && <ArrowRight size={15} className="text-subtle transition group-hover:text-accent" />}
    </button>
  );
}
