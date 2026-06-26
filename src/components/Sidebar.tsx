import { useEffect, useRef, useState, type ReactNode } from "react";
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
  Scroll,
  Ticket,
  Package,
  MoreHorizontal,
  ChevronDown,
  HelpCircle,
  History,
  Library,
  ListChecks,
  ShieldCheck,
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
import { hasAnyAdminPermission } from "../lib/permissions";
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
  | "admin"
  | "users"
  | "economy"
  | "submissions"
  | "catalog"
  | "stats"
  | "roles"
  | "mysubmissions"
  | "whatsnew"
  | "about"
  | "privacy";

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
  onAddCompilation: () => void;
  onMasterLedger: () => void;
  onTransactionLedger: () => void;
  onLeaderboard: () => void;
  onRequests: () => void;
  onAdmin: () => void;
  onMySubmissions: () => void;
  onAccount: () => void;
  onReleaseNotes: () => void;
  onAbout: () => void;
  onPrivacy: () => void;
  onNotificationNavigate: (link: string) => void;
}

/** A single soft currency pill (coins or charters). Tapping opens its detail
 *  surface. `full` lets it grow to share a row evenly on the desktop rail. */
function CurrencyChip({
  title,
  onClick,
  compact = false,
  full = false,
  children,
}: {
  title: string;
  onClick: () => void;
  compact?: boolean;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-panel font-display font-semibold tabular-nums text-ink transition hover:border-brand/40 hover:bg-surface active:scale-[0.98] " +
        (compact ? "px-2.5 py-1 text-sm " : "px-3 py-2 text-base ") +
        (full ? "flex-1 justify-center" : "")
      }
    >
      {children}
    </button>
  );
}

/** The coins + Import Charters chips, sat side by side. Coins opens the
 *  Transaction Ledger; the charter chip opens the buy/sell modal. */
function WalletChips({
  compact = false,
  full = !compact,
  onLedger,
}: {
  compact?: boolean;
  full?: boolean;
  onLedger: () => void;
}) {
  const coins = useStore((s) => s.coins);
  const charters = useStore((s) => s.charters);
  const vouchers = useStore((s) => s.vouchers);
  const openCharters = useStore((s) => s.openCharters);
  return (
    <div className="flex items-center gap-2">
      <CurrencyChip
        title="Coins — view your transaction ledger"
        onClick={onLedger}
        compact={compact}
        full={full}
      >
        <CoinIcon size={compact ? 14 : 17} /> {coins.toLocaleString()}
      </CurrencyChip>
      <CurrencyChip
        title="Import Charters — buy, sell, and spend them to import games"
        onClick={openCharters}
        compact={compact}
        full={full}
      >
        <Scroll size={compact ? 14 : 17} className="text-accent" /> {charters}
      </CurrencyChip>
      {/* Onboarding Free Game Vouchers — only shown while you still hold some. */}
      {vouchers > 0 && (
        <CurrencyChip
          title="Free Game Vouchers — use one to move a Bazaar game into Now Playing for free"
          onClick={onLedger}
          compact={compact}
          full={full}
        >
          <Ticket size={compact ? 14 : 17} className="text-brand" /> {vouchers}
        </CurrencyChip>
      )}
    </div>
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
  const { cloud, isAdmin, permissions, signOut, displayName, submissionCount } = useStore();
  const canAdmin = hasAnyAdminPermission(permissions, isAdmin);
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
        icon={ShieldCheck}
        label="Privacy"
        active={props.view === "privacy"}
        onClick={run(props.onPrivacy)}
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
      {cloud && canAdmin && (
        <UtilRow
          icon={Shield}
          label="Manage"
          count={submissionCount}
          active={
            props.view === "admin" ||
            props.view === "users" ||
            props.view === "economy" ||
            props.view === "submissions" ||
            props.view === "catalog" ||
            props.view === "stats" ||
            props.view === "roles"
          }
          onClick={run(props.onAdmin)}
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
        {!visiting && <WalletChips onLedger={props.onTransactionLedger} />}
        {!visiting && (
          <div className="flex flex-col gap-2">
            <button
              onClick={props.onAdd}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
            >
              <Plus size={18} /> Add games
            </button>
            {/* A compilation is one purchase bundling several games — secondary to
                the everyday "Add games" action. */}
            <button
              onClick={props.onAddCompilation}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-medium text-ink shadow-sm transition hover:border-brand/50"
            >
              <Package size={16} className="text-accent" /> Add compilation
            </button>
          </div>
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
  const isAdmin = useStore((s) => s.isAdmin);
  const permissions = useStore((s) => s.permissions);
  const submissionCount = useStore((s) => s.submissionCount);
  // The admin Catalog Submissions queue lives inside the overflow menu, so flag
  // pending reviews with a dot on the More button — otherwise it'd stay hidden.
  const menuAlert = cloud && hasAnyAdminPermission(permissions, isAdmin) && submissionCount > 0;
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
      {/* Two rows so the full wordmark + tagline never compete with the wallet
          for width: brand on top, the wallet bar below (hidden while visiting). */}
      <header className="sticky top-0 z-30 flex flex-col gap-2 border-b border-line bg-canvas/85 px-4 py-2.5 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => props.setView("backlog")}
            className="min-w-0 text-left transition hover:brightness-110"
          >
            <span className="block whitespace-nowrap font-display text-xl leading-tight tracking-tight text-accent">
              Backlog Bazaar
            </span>
            <span className="block truncate text-[11px] leading-tight text-muted">
              Beat Games. Earn Coins. Play More.
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {cloud && <NotificationBell onNavigate={props.onNotificationNavigate} />}
            {!visiting && (
              <button
                onClick={() => setMenuOpen(true)}
                aria-label={menuAlert ? "More options (items need review)" : "More options"}
                className="relative rounded-xl border border-line bg-surface p-2 text-muted transition hover:text-ink"
              >
                <MoreHorizontal size={18} />
                {menuAlert && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-canvas" />
                )}
              </button>
            )}
          </div>
        </div>
        {!visiting && <WalletChips compact full onLedger={props.onTransactionLedger} />}
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
        <div className="fixed bottom-20 right-4 z-30 flex flex-col items-end gap-2 md:hidden">
          <button
            onClick={props.onAddCompilation}
            aria-label="Add compilation"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2.5 text-sm font-semibold text-ink shadow-lg transition active:brightness-95"
          >
            <Package size={16} className="text-accent" /> Compilation
          </button>
          <button
            onClick={props.onAdd}
            aria-label="Add games"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-3 font-semibold text-brand-fg shadow-lg transition active:brightness-95"
          >
            <Plus size={18} /> Add
          </button>
        </div>
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
