import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, Clock, Trophy, Coins, Medal, Target, X, Flame, type LucideIcon } from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { ledgerLabel } from "../lib/transactions";
import { progressFraction } from "../lib/challenges";
import { hoursLabel, medalLabel, weekRangeLabel, type WeeklyRecap } from "../lib/weeklyRecap";
import type { View } from "./Sidebar";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <p className="font-display text-2xl leading-tight text-ink">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
        <Icon size={13} className="text-accent" /> {title}
      </h3>
      <div className="flex flex-col gap-1 text-sm text-ink">{children}</div>
    </section>
  );
}

/** The "Your week" card: last week's play, clears, coins and progress, plus
 *  the medals you're close to. Shown once at the first open of a new week
 *  (and again from its bell notification); closing marks it seen. */
export function WeeklyRecapModal({ recap, onNavigate }: { recap: WeeklyRecap; onNavigate: (view: View) => void }) {
  const close = useStore((s) => s.closeWeeklyRecap);
  useScrollLock(true);
  const { play, clears, coins, progress } = recap;
  const go = (view: View) => {
    close();
    onNavigate(view);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-label="Your week"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
              <CalendarRange size={13} className="text-accent" /> {weekRangeLabel(recap.weekStart)}
            </p>
            <h2 className="font-display text-2xl leading-tight text-ink">Your week</h2>
          </div>
          <button onClick={close} aria-label="Close" className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Played"
              value={hoursLabel(play.hours)}
              sub={`on ${play.days} ${play.days === 1 ? "day" : "days"}`}
            />
            <Stat
              label="Finished"
              value={String(clears.finished)}
              sub={clears.finished > 0 ? `${clears.verified} Verified` : undefined}
            />
            {coins && <Stat label="Coins earned" value={`+${coins.earned.toLocaleString()}`} />}
            {coins && <Stat label="Coins spent" value={coins.spent.toLocaleString()} />}
          </div>

          {(play.topGame || play.sessions > 0) && (
            <Section icon={Clock} title="Play">
              {play.topGame && (
                <p>
                  Most played: <strong>{play.topGame.title}</strong> · {hoursLabel(play.topGame.hours)}
                </p>
              )}
              {play.sessions > 0 && (
                <p className="text-muted">
                  {play.sessions} stopwatch {play.sessions === 1 ? "session" : "sessions"}
                </p>
              )}
            </Section>
          )}

          {(clears.finished > 0 || clears.streak > 0) && (
            <Section icon={Trophy} title="Clears">
              {clears.titles.length > 0 && <p>{clears.titles.join(", ")}</p>}
              {clears.streak > 0 && (
                <p className="inline-flex items-center gap-1 text-muted">
                  <Flame size={13} className="text-accent" /> Clear Streak {clears.streak}
                  {clears.bestStreak > clears.streak && ` · best ${clears.bestStreak}`}
                </p>
              )}
            </Section>
          )}

          {coins && coins.topSources.length > 0 && (
            <Section icon={Coins} title="Where your coins came from">
              {coins.topSources.map((s) => (
                <p key={s.kind} className="flex justify-between gap-3">
                  <span>{ledgerLabel({ kind: s.kind })}</span>
                  <span className="text-muted">+{s.coins.toLocaleString()}</span>
                </p>
              ))}
            </Section>
          )}

          {(progress.achievements.length > 0 || progress.goals.length > 0) && (
            <Section icon={Medal} title="Earned">
              {progress.achievements.map((a) => (
                <p key={a.name}>{medalLabel(a)}</p>
              ))}
              {progress.goals.map((g) => (
                <p key={g}>
                  <Target size={12} className="mr-1 inline text-accent" />
                  {g}
                </p>
              ))}
            </Section>
          )}

          {progress.close.length > 0 && (
            <Section icon={Target} title="You're close to">
              {progress.close.map((c) => (
                <div key={c.name}>
                  <p className="flex justify-between gap-3">
                    <span>
                      <strong>{c.name}</strong> <span className="text-muted">· {c.description}</span>
                    </span>
                    <span className="shrink-0 text-muted">
                      {c.value.toLocaleString()} / {c.threshold.toLocaleString()}
                    </span>
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel">
                    <div
                      className="h-full rounded-full bg-accent/70"
                      style={{ width: `${Math.round(progressFraction(c.value, c.threshold) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </Section>
          )}

          {progress.unclaimed > 0 && (
            <p className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink">
              <Coins size={14} className="mr-1 inline text-accent" />
              {progress.unclaimed.toLocaleString()} coins in rewards are waiting to be claimed.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => go("achievements")}
              className="flex-1 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm font-medium text-ink transition hover:border-brand/50"
            >
              Achievements
            </button>
            <button
              type="button"
              onClick={() => go("challenges")}
              className="flex-1 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm font-medium text-ink transition hover:border-brand/50"
            >
              Challenges
            </button>
          </div>
          <button
            type="button"
            onClick={close}
            className="w-full rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105"
          >
            Nice week!
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
