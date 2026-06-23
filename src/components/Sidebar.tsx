import { useEffect, useRef, useState } from "react";
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
  ChevronDown,
  HelpCircle,
  History,
  Coins,
  Scroll,
  Library,
  Inbox,
  ListChecks,
  X,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { isUnseen, LATEST_RELEASE_ID } from "../lib/changelog";
import { useScrollLock } from "../lib/useScrollLock";
import type { GameStatus } from "../types";

export type Tab = GameStatus | "market";

/** Every primary destination: the game sections plus the utility pages that used
 *  to be modals (leaderboard, requests, account, …). */
export type View =
  | Tab
  | "master-ledger"
  | "transaction-ledger"
  | "leaderboard"
  | "requests"
  | "account"
  | "users"
  | "economy"
  | "submissions"
  | "mysubmissions"
  | "whatsnew"
  | "about";

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
  seenReleaseId: string | null;
  onAdd: () => void;
  onMasterLedger: () => void;
  onTransactionLedger: () => void;
  onLeaderboard: () => void;
  onRequests: () => void;
  onUsers: () => void;
  onEconomy: () => void;
  onSubmissions: () => void;
  onMySubmissions: () => void;
  onAccount: () => void;
  onReleaseNotes: () => void;
  onAbout: () => void;
  onNotificationNavigate: (link: string) => void;
}

/** The wallet balance pill. `compact` trims it for the mobile top bar; when
 *  `onClick` is given it becomes a button that opens the Transaction Ledger. */
function Wallet({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  const coins = useStore((s) => s.coins);
  const inner = compact ? (
    <>
      <CoinIcon size={14} /> {coins}
    </>
  ) : (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-accent/80">Wallet</span>
      <span className="inline-flex items-center gap-1.5 font-display text-xl font-semibold text-accent">
        <CoinIcon size={18} /> {coins}
      </span>
    </>
  );
  const cls = compact
    ? "inline-flex items-center gap-1 rounded-lg border border-brand/40 bg-brand/10 px-2 py-1.5 font-display text-sm font-semibold text-accent"
    : "flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="View your transaction ledger"
        className={
          cls +
          (compact ? "" : " w-full justify-center") +
          " transition hover:brightness-105 active:brightness-95"
        }
      >
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/** The Import Charter counter, sat beside the wallet. Opens the buy/sell modal. */
function ChartersPill({ compact = false }: { compact?: boolean }) {
  const charters = useStore((s) => s.charters);
  const open = useStore((s) => s.openCharters);
  const cls = compact
    ? "inline-flex items-center gap-1 rounded-lg border border-brand/40 bg-brand/10 px-2 py-1.5 font-display text-sm font-semibold text-accent"
    : "flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2";
  return (
    <button
      type="button"
      onClick={open}
      title="Import Charters — buy, sell, and spend them to import games"
      className={
        cls +
        (compact ? "" : " w-full justify-center") +
        " transition hover:brightness-105 active:brightness-95"
      }
    >
      {compact ? (
        <>
          <Scroll size={14} /> {charters}
        </>
      ) : (
        <>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-accent/80">
            Charters
          </span>
          <span className="inline-flex items-center gap-1.5 font-display text-xl font-semibold text-accent">
            <Scroll size={18} /> {charters}
          </span>
        </>
      )}
    </button>
  );
}

/** A primary-section row in the desktop sidebar. */
function SectionRow({
  def,
  active,
  onClick,
}: {
  def: SectionDef;
  active: boolean;
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
    </button>
  );
}

/** The signed-in user's menu: avatar + name, with Account and Sign out. */
function ProfileMenu({
  displayName,
  avatarUrl,
  active,
  onAccount,
  onSignOut,
}: {
  displayName: string | null;
  avatarUrl: string | null;
  active: boolean;
  onAccount: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={
          "flex items-center gap-2 rounded-xl border px-2 py-1.5 text-sm transition " +
          (active || open
            ? "border-brand/50 bg-brand/10 text-accent"
            : "border-line text-muted hover:bg-panel hover:text-ink")
        }
      >
        <Avatar url={avatarUrl} name={displayName || "Account"} size={24} />
        <span className="max-w-[140px] truncate">{displayName || "Account"}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-2xl">
          <button
            onClick={() => {
              onAccount();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
          >
            <CircleUser size={15} className="text-accent" /> Account
          </button>
          <button
            onClick={() => {
              onSignOut();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
          >
            <LogOut size={15} className="text-accent" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Desktop top bar: notifications, theme, and the profile menu, top-right. */
export function TopBar(props: ChromeProps) {
  const { cloud, displayName, avatarUrl, signOut } = useStore();
  return (
    <header className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-2 border-b border-line bg-canvas/80 px-4 backdrop-blur md:flex">
      {cloud && <NotificationBell onNavigate={props.onNotificationNavigate} />}
      <ThemeToggle />
      {cloud && (
        <ProfileMenu
          displayName={displayName}
          avatarUrl={avatarUrl}
          active={props.view === "account"}
          onAccount={props.onAccount}
          onSignOut={() => void signOut()}
        />
      )}
    </header>
  );
}

/** A labeled action row in the utility footer / mobile menu. */
function UtilRow({
  icon: Icon,
  label,
  dot = false,
  count = 0,
  active = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  dot?: boolean;
  count?: number;
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
      {count > 0 && (
        <span
          aria-label={`${count} pending`}
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-xs font-semibold text-brand-fg"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/** The labeled utility/page-nav rows. `profile` appends Account + Sign out (used
 *  in the mobile menu; on desktop those live in the top-bar profile menu). */
function UtilityActions(props: ChromeProps & { onClose?: () => void; profile?: boolean }) {
  const { cloud, isAdmin, signOut, displayName, submissionCount } = useStore();
  const unseen = isUnseen(LATEST_RELEASE_ID, props.seenReleaseId);
  const run = (fn: () => void) => () => {
    fn();
    props.onClose?.();
  };
  return (
    <div className="flex flex-col gap-0.5">
      <UtilRow
        icon={History}
        label="Transaction Ledger"
        active={props.view === "transaction-ledger"}
        onClick={run(props.onTransactionLedger)}
      />
      <UtilRow
        icon={HelpCircle}
        label="How it works"
        active={props.view === "about"}
        onClick={run(props.onAbout)}
      />
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
      {cloud && (
        <UtilRow
          icon={ListChecks}
          label="My contributions"
          active={props.view === "mysubmissions"}
          onClick={run(props.onMySubmissions)}
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
      {cloud && isAdmin && (
        <UtilRow
          icon={Coins}
          label="Economy"
          active={props.view === "economy"}
          onClick={run(props.onEconomy)}
        />
      )}
      {cloud && isAdmin && (
        <UtilRow
          icon={Inbox}
          label="Submissions"
          count={submissionCount}
          active={props.view === "submissions"}
          onClick={run(props.onSubmissions)}
        />
      )}
      {props.profile && cloud && (
        <UtilRow
          icon={CircleUser}
          label={displayName || "Account"}
          active={props.view === "account"}
          onClick={run(props.onAccount)}
        />
      )}
      {props.profile && cloud && (
        <UtilRow icon={LogOut} label="Sign out" onClick={run(() => void signOut())} />
      )}
    </div>
  );
}

/** Persistent left rail (md and up). */
export function Sidebar(props: ChromeProps) {
  // While visiting another player's Bazaar, hide controls that act on your own
  // account — Add games, The Caravan, your wallet, and the utility pages — so
  // nothing on screen is ambiguous about whose data it is. The visited player's
  // stats live in the ViewingBanner; "Leave" there returns you to your own.
  const visiting = useStore((s) => s.viewing != null);
  const sections = visiting ? TABS.filter((t) => t.id !== "market") : TABS;
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/95 backdrop-blur md:flex">
      <div className="flex flex-col gap-4 p-4">
        <button onClick={() => props.setView("backlog")} className="block text-left">
          <h1 className="font-display text-2xl tracking-tight text-accent transition hover:brightness-110">
            Backlog Bazaar
          </h1>
          <p className="text-xs text-muted">Beat Games. Earn Coins. Play More.</p>
        </button>
        {!visiting && (
          <div className="grid grid-cols-2 gap-2">
            <Wallet onClick={props.onTransactionLedger} />
            <ChartersPill />
          </div>
        )}
        {!visiting && (
          <button
            onClick={props.onAdd}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
          >
            <Plus size={18} /> Add games
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-1">
        <div className="flex flex-col gap-1">
          {sections.map((t) => (
            <SectionRow
              key={t.id}
              def={t}
              active={props.view === t.id}
              onClick={() => props.setView(t.id)}
            />
          ))}
          {/* The Master Ledger is a collection view, so it lives with the game
              boards — and stays reachable while visiting another player. */}
          <UtilRow
            icon={Library}
            label="Master Ledger"
            active={props.view === "master-ledger"}
            onClick={props.onMasterLedger}
          />
        </div>
      </nav>

      {!visiting && (
        <div className="border-t border-line p-3">
          <UtilityActions {...props} />
        </div>
      )}
    </aside>
  );
}

/** Mobile shell: a sticky top bar, a fixed bottom tab bar, and an overflow sheet. */
export function MobileNav(props: ChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cloud = useStore((s) => s.cloud);
  // See Sidebar: while visiting, drop your-account chrome (wallet, Add, The
  // Caravan, and the overflow menu of utility pages).
  const visiting = useStore((s) => s.viewing != null);
  const sections = visiting ? TABS.filter((t) => t.id !== "market") : TABS;
  // The floating Add button only makes sense on the game boards — on a utility
  // page (Requests & bugs, Leaderboard, …) it would read as "add an issue".
  const onGameTab = TABS.some((t) => t.id === props.view);
  useScrollLock(menuOpen, { mobileOnly: true });

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur md:hidden">
        <button
          onClick={() => props.setView("backlog")}
          className="min-w-0 truncate font-display text-xl tracking-tight text-accent transition hover:brightness-110"
        >
          Backlog Bazaar
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {!visiting && <Wallet compact onClick={props.onTransactionLedger} />}
          {!visiting && <ChartersPill compact />}
          {cloud && <NotificationBell onNavigate={props.onNotificationNavigate} />}
          {!visiting && (
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="More options"
              className="rounded-xl border border-line bg-surface p-2 text-muted transition hover:text-ink"
            >
              <MoreHorizontal size={18} />
            </button>
          )}
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur md:hidden">
        {sections.map((t) => {
          const active = props.view === t.id;
          const Icon = t.icon;
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
              <Icon size={20} />
              <span className="max-w-full truncate px-0.5">{t.short}</span>
            </button>
          );
        })}
        {/* Master Ledger sits alongside the boards (and stays available while
            visiting), mirroring the desktop rail. */}
        <button
          onClick={() => props.setView("master-ledger")}
          aria-current={props.view === "master-ledger" ? "page" : undefined}
          className={
            "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition " +
            (props.view === "master-ledger" ? "text-accent" : "text-subtle")
          }
        >
          <Library size={20} />
          <span className="max-w-full truncate px-0.5">Ledger</span>
        </button>
      </nav>

      {/* Add games: a floating action button on mobile (it lives in the sidebar
          on desktop), so the top bar has room for the full wordmark. Hidden
          while visiting — you can't add to someone else's library — and on
          utility pages where adding a game isn't the obvious action. */}
      {!visiting && onGameTab && (
        <button
          onClick={props.onAdd}
          aria-label="Add games"
          className="fixed bottom-20 right-4 z-30 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-3 font-semibold text-brand-fg shadow-lg transition active:brightness-95 md:hidden"
        >
          <Plus size={18} /> Add
        </button>
      )}

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
              <ThemeToggle align="left" />
            </div>
            <UtilityActions {...props} profile onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
