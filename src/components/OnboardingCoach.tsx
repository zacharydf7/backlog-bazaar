import { useEffect, useState } from "react";
import {
  Ticket,
  X,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  ListChecks,
} from "lucide-react";
import { useStore } from "../store";
import {
  onboardingMode,
  onboardingCopy,
  questProgress,
  questCopy,
  ONBOARDING_QUESTS,
  type OnboardingMode,
  type QuestProgress,
} from "../lib/onboarding";

/** Drives onboarding off live store state. A fresh signup sees two passive
 *  cards (welcome → primer), claims its starter vouchers, then the interactive
 *  Getting Started checklist — quests auto-complete from the player's REAL
 *  library, so there's no per-step persistence: `pending` (tutorial phase) +
 *  `grantedAt` (past the welcome cards) resume it across sessions. An existing
 *  account granted a voucher gets the short board-state-driven granted intro.
 *  Gated on sessionLoaded so it never acts on transient cross-account state
 *  mid auth-switch. */
function useOnboardingTour(): {
  mode: OnboardingMode | null;
  claimed: boolean;
  progress: QuestProgress;
  vouchers: number;
  coins: number;
  /** Vouchers to advertise on the primer — the amount about to be claimed. */
  grantCount: number;
  claim: () => void;
  complete: () => void;
} {
  const sessionLoaded = useStore((s) => s.sessionLoaded);
  const completed = useStore((s) => s.onboardingCompletedAt) != null;
  const pending = useStore((s) => s.onboardingVouchersPending);
  const claimed = useStore((s) => s.onboardingVouchersGrantedAt) != null;
  const vouchers = useStore((s) => s.vouchers);
  const coins = useStore((s) => s.coins);
  const onboardingVouchers = useStore((s) => s.onboardingVouchers);
  const isAdmin = useStore((s) => s.isAdmin);
  const games = useStore((s) => s.games);
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const claimOnboardingVouchers = useStore((s) => s.claimOnboardingVouchers);

  return {
    mode: onboardingMode({ loaded: sessionLoaded, completed, pending, vouchers, isAdmin }),
    claimed,
    progress: questProgress({ games }),
    vouchers,
    coins,
    grantCount: onboardingVouchers,
    claim: () => void claimOnboardingVouchers(),
    complete: () => void completeOnboarding(),
  };
}

/** The onboarding coach. Fresh signup: welcome → primer (claims vouchers) →
 *  Getting Started checklist → finale. Existing account granted a voucher: the
 *  short contextual intro, unchanged. */
export function OnboardingCoach({
  onHowItWorks,
  onNavigate,
}: {
  onHowItWorks: () => void;
  onNavigate: (view: string) => void;
}) {
  const { mode, claimed, progress, vouchers, coins, grantCount, claim, complete } =
    useOnboardingTour();
  // Passive phase position (welcome=0, primer=1) — session-local by design:
  // once claimed, the durable grantedAt flag takes over as the phase marker.
  const [passiveIndex, setPassiveIndex] = useState(0);
  // Checklist docked-to-pill state. Session-local and default-expanded: a
  // multi-day quest 4 should greet a fresh session with the full card once.
  const [collapsed, setCollapsed] = useState(false);

  const inChecklist = mode === "fresh" && claimed;
  const activeQuest = progress.activeQuest;

  // Follow along: whenever the ACTIVE quest changes (checklist entry, or a
  // quest just completed), show the board it happens on — and pop the card
  // back open so the newly-ticked row and the next quest are visible.
  useEffect(() => {
    if (!inChecklist || !activeQuest) return;
    onNavigate(activeQuest.view);
    setCollapsed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inChecklist, activeQuest?.id]);

  if (!mode) return null;

  // ---- Existing-account granted intro (unchanged behavior) ----
  if (mode === "granted") {
    const copy = onboardingCopy("granted", vouchers);
    return (
      <Shell>
        <CardHeader eyebrow={copy.eyebrow} onDismiss={complete} dismissLabel="Dismiss" />
        <h3 className="mt-0.5 font-display text-base leading-tight text-ink">{copy.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{copy.body}</p>
        <div className="mt-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-medium text-accent">
            <Ticket size={13} className="text-brand" /> “Buy &amp; Start” → “Use voucher”
          </span>
        </div>
        <button
          onClick={onHowItWorks}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:text-ink"
        >
          <HelpCircle size={13} /> Read how it works
        </button>
      </Shell>
    );
  }

  // ---- Fresh signup, passive phase: welcome → primer ----
  if (!claimed) {
    const step = passiveIndex === 0 ? "welcome" : "primer";
    const copy = onboardingCopy(step, grantCount);
    return (
      <Shell>
        <CardHeader eyebrow={copy.eyebrow} onDismiss={complete} dismissLabel="Skip tour" />
        <h3 className="mt-0.5 font-display text-base leading-tight text-ink">{copy.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{copy.body}</p>
        {step === "welcome" && (
          <button
            onClick={onHowItWorks}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:text-ink"
          >
            <HelpCircle size={13} /> Read how it works
          </button>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {[0, 1].map((i) => (
              <span
                key={i}
                className={
                  "h-1.5 rounded-full transition-all " +
                  (i === passiveIndex ? "w-4 bg-brand" : "w-1.5 bg-line")
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step === "primer" && (
              <button
                onClick={() => setPassiveIndex(0)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition hover:text-ink"
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {step === "welcome" ? (
              <button
                onClick={() => setPassiveIndex(1)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
              >
                Show me around <ArrowRight size={15} />
              </button>
            ) : (
              <button
                onClick={claim}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
              >
                <Ticket size={14} /> {grantCount > 0 ? "Claim my vouchers" : "Let's go"}
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  // ---- Fresh signup, collapsed pill ----
  if (collapsed) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:px-4 sm:pb-4">
        <button
          onClick={() => setCollapsed(false)}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-surface px-3.5 py-2 text-xs font-semibold text-ink shadow-lg ring-1 ring-brand/20 transition hover:brightness-105"
        >
          <ListChecks size={13} className="text-brand" />
          Getting started · {progress.completedCount}/{progress.total}
          <ChevronUp size={13} className="text-subtle" />
        </button>
      </div>
    );
  }

  // ---- Fresh signup, finale: every quest complete ----
  if (!activeQuest) {
    const copy = onboardingCopy("finale");
    return (
      <Shell>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
            {copy.eyebrow}
          </span>
          <Sparkles size={14} className="text-brand" aria-hidden />
        </div>
        <h3 className="mt-0.5 font-display text-base leading-tight text-ink">{copy.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{copy.body}</p>
        <div className="mt-3 flex justify-end">
          <button
            onClick={complete}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
          >
            Finish
          </button>
        </div>
      </Shell>
    );
  }

  // ---- Fresh signup, the Getting Started checklist ----
  return (
    <Shell>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
          <ListChecks size={13} className="text-brand" /> Getting started ·{" "}
          {progress.completedCount}/{progress.total}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={complete}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-subtle transition hover:text-ink"
          >
            Skip tour <X size={12} />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            aria-label="Collapse the checklist"
            className="rounded-md p-1 text-subtle transition hover:text-ink"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      <ul className="mt-2 flex flex-col gap-1">
        {ONBOARDING_QUESTS.map((q) => {
          const done = progress.done[q.id];
          const active = activeQuest.id === q.id;
          const copy = questCopy(q.id, { vouchers, coins });
          return (
            <li
              key={q.id}
              className={
                "rounded-xl px-2.5 py-2 " + (active ? "bg-brand/10" : done ? "opacity-70" : "")
              }
            >
              <div className="flex items-center gap-2">
                {done ? (
                  <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle size={16} className="shrink-0 text-subtle" aria-hidden />
                )}
                <span
                  className={
                    "min-w-0 flex-1 truncate text-sm " +
                    (done ? "text-muted line-through" : active ? "font-semibold text-ink" : "text-muted")
                  }
                >
                  {copy.title}
                </span>
                {active && (
                  <button
                    onClick={() => {
                      onNavigate(q.view);
                      // Get out of the way of the control we just highlighted.
                      setCollapsed(true);
                    }}
                    className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-brand-fg transition hover:brightness-105"
                  >
                    {copy.cta}
                  </button>
                )}
              </div>
              {active && (
                <p className="mt-1 pl-6 text-[13px] leading-relaxed text-muted">{copy.body}</p>
              )}
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

/** The docked coach container (shared card chrome). */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-brand/40 bg-surface p-4 shadow-2xl ring-1 ring-brand/20">
        {children}
      </div>
    </div>
  );
}

function CardHeader({
  eyebrow,
  onDismiss,
  dismissLabel,
}: {
  eyebrow: string;
  onDismiss: () => void;
  dismissLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
        {eyebrow}
      </span>
      <button
        onClick={onDismiss}
        className="-mr-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-subtle transition hover:text-ink"
      >
        {dismissLabel} <X size={12} />
      </button>
    </div>
  );
}
