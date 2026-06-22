import { useState } from "react";
import {
  Store,
  Gamepad2,
  Trophy,
  Heart,
  Compass,
  Plus,
  CircleUser,
  LogOut,
  Lightbulb,
  Sparkles,
  Shield,
  MoreHorizontal,
  X,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { isUnseen, LATEST_RELEASE_ID } from "../lib/changelog";
import { useScrollLock } from "../lib/useScrollLock";
import type { GameStatus } from "../types";

export type Tab = GameStatus | "market";

/** Every primary destination: the game sections plus the utility pages that used
 *  to be modals (leaderboard, requests, account, …). */
export type View = Tab | "leaderboard" | "requests" | "account" | "users" | "whatsnew";

interface SectionDef {
  id: Tab;
  /** Full label (desktop sidebar). */
  label: string;
  /** Short label for the cramped mobile bottom bar. */
  short: string;
  icon: LucideIcon;
}

export const TABS: SectionDef[] = [
  { id: "backlog", label: "Bazaar", short: "Bazaar", icon: Store },
  { id: "playing", label: "Now Playing", short: "Playing", icon: Gamepad2 },
  { id: "finished", label: "Finished", short: "Finished", icon: Trophy },
  { id: "wishlist", label: "Wishlist", short: "Wishlist", icon: Heart },
  { id: "market", label: "The Caravan", short: "Caravan", icon: Compass },
];

export interface ChromeProps {
  view: View;
  setView: (v: View) => void;
  counts: Record<GameStatus, number>;
  seenReleaseId: string | null;
  onAdd: () => void;
  onLeaderboard: () => void;
  onRequests: () => void;
  onUsers: () => void;
  onAccount: () => void;
  onReleaseNotes: () => void;
  onNotificationNavigate: (link: string) => void;
}

function countFor(tab: Tab, counts: Record<GameStatus, number>): number | undefined {
  return tab === "market" ? undefined : counts[tab];
}

/** The wallet balance pill. `compact` trims it for the mobile top bar. */
function Wallet({ compact = false }: { compact?: boolean }) {
  const coins = useStore((s) => s.coins);
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-brand/40 bg-brand/10 px-2 py-1.5 font-display text-sm font-semibold text-accent">
        <CoinIcon size={14} /> {coins}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-accent/80">Wallet</span>
      <span className="inline-flex items-center gap-1.5 font-display text-xl font-semibold text-accent">
        <CoinIcon size={18} /> {coins}
      </span>
    </div>
  );
}

/** A primary-section row in the desktop sidebar. */
function SectionRow({
  def,
  active,
  count,
  onClick,
}: {
  def: SectionDef;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  const Icon = def.icon;
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition " +
        (active ? "bg-brand/15 text-accent" : "text-muted hover:bg-panel hover:text-ink")
      }
    >
      <Icon
        size={18}
        className={active ? "text-accent" : "text-subtle transition group-hover:text-ink"}
      />
      <span className="flex-1 text-left">{def.label}</span>
      {count != null && (
        <span
          className={
            "rounded-full px-1.5 py-0.5 text-[11px] " +
            (active ? "bg-brand/20 text-accent" : "bg-line text-subtle")
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Self-contained popover widgets (theme + notifications) shared by both shells. */
function WidgetRow({ onNotificationNavigate }: { onNotificationNavigate: (link: string) => void }) {
  const cloud = useStore((s) => s.cloud);
  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      {cloud && <NotificationBell onNavigate={onNotificationNavigate} />}
    </div>
  );
}

/** A labeled action row in the utility footer / mobile menu. */
function UtilRow({
  icon: Icon,
  label,
  dot = false,
  active = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  dot?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition " +
        (active ? "bg-brand/15 text-accent" : "text-muted hover:bg-panel hover:text-ink")
      }
    >
      <span className="relative">
        <Icon
          size={18}
          className={active ? "text-accent" : "text-subtle transition group-hover:text-ink"}
        />
        {dot && (
          <span
            aria-label="New"
            className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-brand ring-2 ring-surface"
          />
        )}
      </span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

/** The labeled utility actions (What's new, leaderboard, account, …). */
function UtilityActions(props: ChromeProps & { onClose?: () => void }) {
  const { cloud, isAdmin, signOut, displayName } = useStore();
  const unseen = isUnseen(LATEST_RELEASE_ID, props.seenReleaseId);
  const run = (fn: () => void) => () => {
    fn();
    props.onClose?.();
  };
  return (
    <div className="flex flex-col gap-0.5">
      <UtilRow
        icon={Sparkles}
        label="What's new"
        dot={unseen}
        active={props.view === "whatsnew"}
        onClick={run(props.onReleaseNotes)}
      />
      {cloud && (
        <UtilRow
          icon={Trophy}
          label="Leaderboard"
          active={props.view === "leaderboard"}
          onClick={run(props.onLeaderboard)}
        />
      )}
      {cloud && (
        <UtilRow
          icon={Lightbulb}
          label="Requests & bugs"
          active={props.view === "requests"}
          onClick={run(props.onRequests)}
        />
      )}
      {cloud && isAdmin && (
        <UtilRow
          icon={Shield}
          label="Manage users"
          active={props.view === "users"}
          onClick={run(props.onUsers)}
        />
      )}
      {cloud && (
        <UtilRow
          icon={CircleUser}
          label={displayName || "Account"}
          active={props.view === "account"}
          onClick={run(props.onAccount)}
        />
      )}
      {cloud && <UtilRow icon={LogOut} label="Sign out" onClick={run(() => void signOut())} />}
    </div>
  );
}

/** Persistent left rail (md and up). */
export function Sidebar(props: ChromeProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/95 backdrop-blur md:flex">
      <div className="flex flex-col gap-4 p-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-accent">Backlog Bazaar</h1>
          <p className="text-xs text-muted">Finish games to earn coins.</p>
        </div>
        <Wallet />
        <button
          onClick={props.onAdd}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
        >
          <Plus size={18} /> Add games
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-1">
        <div className="flex flex-col gap-1">
          {TABS.map((t) => (
            <SectionRow
              key={t.id}
              def={t}
              active={props.view === t.id}
              count={countFor(t.id, props.counts)}
              onClick={() => props.setView(t.id)}
            />
          ))}
        </div>
      </nav>

      <div className="border-t border-line p-3">
        <div className="mb-1 px-1">
          <WidgetRow onNotificationNavigate={props.onNotificationNavigate} />
        </div>
        <UtilityActions {...props} />
      </div>
    </aside>
  );
}

/** Mobile shell: a sticky top bar, a fixed bottom tab bar, and an overflow sheet. */
export function MobileNav(props: ChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  useScrollLock(menuOpen, { mobileOnly: true });

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur md:hidden">
        <h1 className="font-display text-xl tracking-tight text-accent">Backlog Bazaar</h1>
        <div className="flex items-center gap-2">
          <Wallet compact />
          <button
            onClick={props.onAdd}
            className="inline-flex items-center gap-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-sm transition active:brightness-95"
          >
            <Plus size={16} /> Add
          </button>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="More options"
            className="rounded-xl border border-line bg-surface p-2 text-muted transition hover:text-ink"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur md:hidden">
        {TABS.map((t) => {
          const active = props.view === t.id;
          const Icon = t.icon;
          const count = countFor(t.id, props.counts);
          return (
            <button
              key={t.id}
              onClick={() => props.setView(t.id)}
              aria-current={active ? "page" : undefined}
              className={
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition " +
                (active ? "text-accent" : "text-subtle")
              }
            >
              <span className="relative">
                <Icon size={20} />
                {count != null && count > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-[15px] rounded-full bg-brand px-1 text-center text-[9px] font-bold leading-[15px] text-brand-fg">
                    {count}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-0.5">{t.short}</span>
            </button>
          );
        })}
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4 pb-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-lg text-ink">Menu</span>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1 text-subtle transition hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mb-3 px-1">
              <WidgetRow onNotificationNavigate={props.onNotificationNavigate} />
            </div>
            <UtilityActions {...props} onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
