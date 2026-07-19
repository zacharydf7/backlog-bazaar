import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  FileUp,
  MoreHorizontal,
  ChevronDown,
  ChevronLeft,
  HelpCircle,
  History,
  Library,
  ListChecks,
  ListOrdered,
  ShieldCheck,
  Search,
  Bell,
  Users,
  Mail,
  X,
  UserRound,
  UserPlus,
  UserCheck,
  UserMinus,
  Flag,
  Medal,
  ShoppingBag,
  Tent,
  type LucideIcon,
} from "lucide-react";
import { useStore, selectCoachTarget } from "../store";
import { CoinIcon } from "./CoinIcon";
import { Avatar } from "./Avatar";
import { SearchBar } from "./SearchBar";
import { ThemeToggle } from "./ThemeToggle";
import { ReportModal } from "./ReportModal";
import { isOnline, lastSeenLabel } from "../lib/presence";
import { isUnseen, LATEST_RELEASE_ID } from "../lib/changelog";
import { useScrollLock } from "../lib/useScrollLock";
import { hasAnyAdminPermission } from "../lib/permissions";
import type { InboxTab } from "./InboxDrawer";
import type { GameStatus } from "../types";

export type Tab = GameStatus | "market";

/** Every primary destination: the game sections plus the utility pages that used
 *  to be modals (leaderboard, requests, account, …). */
export type View =
  | Tab
  | "profile"
  | "lists"
  | "master-ledger"
  | "transaction-ledger"
  | "leaderboard"
  | "shop"
  | "achievements"
  | "requests"
  | "account"
  | "admin"
  | "users"
  | "slots"
  | "economy"
  | "shopmanager"
  | "submissions"
  | "catalog"
  | "taxonomy"
  | "reports"
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
  // Universal search: the live query (also filters the active board) and a way to
  // open the global results modal (Enter / the search icon).
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onOpenSearch: () => void;
  onAdd: () => void;
  onAddCompilation: () => void;
  /** Open the bulk CSV importer (Add menu third row). */
  onImportCsv: () => void;
  onMasterLedger: () => void;
  onTransactionLedger: () => void;
  onLeaderboard: () => void;
  /** Open the Curio Shop (cosmetic coin sink). */
  onShop: () => void;
  onAchievements: () => void;
  /** Open the My Lists workspace (custom game lists). */
  onLists: () => void;
  onRequests: () => void;
  onAdmin: () => void;
  onMySubmissions: () => void;
  onAccount: () => void;
  onProfile: () => void;
  /** Leave the Bazaar you're visiting (rendered in the nav while visiting). */
  onLeave: () => void;
  /** Open the inbox composer to message the visited player. */
  onMessageUser: (id: string, name: string) => void;
  onReleaseNotes: () => void;
  onAbout: () => void;
  onPrivacy: () => void;
  // Open the unified inbox drawer, optionally to a specific tab. Desktop passes a
  // tab from each separate icon; the mobile single button opens the default.
  onOpenInbox: (tab?: InboxTab) => void;
}

/** Shared styling for the square top-bar icon buttons (search, inbox, more) so they
 *  all render at the same size. */
const iconBtn =
  "relative rounded-lg border border-edge bg-surface p-2.5 text-muted transition hover:bg-panel hover:text-ink";

/** A square top-bar icon button with an optional count badge. */
function IconBadgeButton({
  icon: Icon,
  label,
  count,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={iconBtn}>
      <Icon size={18} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-fg">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

/** Mobile-only single inbox toggle: opens the unified Alerts / Messages / Friends
 *  drawer. Its badge sums everything that needs attention — unread notifications,
 *  unread messages, and incoming friend requests — so the cramped phone header needs
 *  just one icon. (Desktop has room for the three separate buttons below.) */
function InboxButton({ onClick }: { onClick: () => void }) {
  const cloud = useStore((s) => s.cloud);
  const unreadAlerts = useStore((s) => s.notifications.filter((n) => !n.readAt).length);
  const unreadMessages = useStore((s) => s.unreadMessageCount);
  const friendRequests = useStore((s) => s.friendRequestCount);
  const fetchUnreadMessageCount = useStore((s) => s.fetchUnreadMessageCount);
  const fetchFriendRequests = useStore((s) => s.fetchFriendRequests);
  useEffect(() => {
    if (!cloud) return;
    void fetchUnreadMessageCount();
    void fetchFriendRequests();
  }, [cloud, fetchUnreadMessageCount, fetchFriendRequests]);
  return (
    <IconBadgeButton
      icon={Bell}
      label="Inbox"
      count={unreadAlerts + unreadMessages + friendRequests}
      onClick={onClick}
    />
  );
}

/** Desktop notifications button — opens the inbox on the Alerts tab. */
function NotificationsButton({ onClick }: { onClick: () => void }) {
  const unread = useStore((s) => s.notifications.filter((n) => !n.readAt).length);
  return <IconBadgeButton icon={Bell} label="Notifications" count={unread} onClick={onClick} />;
}

/** Desktop messages button — opens the inbox on the Messages tab. */
function MessageButton({ onClick }: { onClick: () => void }) {
  const cloud = useStore((s) => s.cloud);
  const unread = useStore((s) => s.unreadMessageCount);
  const fetchUnreadMessageCount = useStore((s) => s.fetchUnreadMessageCount);
  useEffect(() => {
    if (cloud) void fetchUnreadMessageCount();
  }, [cloud, fetchUnreadMessageCount]);
  return <IconBadgeButton icon={Mail} label="Messages" count={unread} onClick={onClick} />;
}

/** Desktop friends button — opens the inbox on the Friends tab. Badges incoming
 *  friend requests. */
function SocialButton({ onClick }: { onClick: () => void }) {
  const cloud = useStore((s) => s.cloud);
  const requests = useStore((s) => s.friendRequestCount);
  const fetchFriendRequests = useStore((s) => s.fetchFriendRequests);
  useEffect(() => {
    if (cloud) void fetchFriendRequests();
  }, [cloud, fetchFriendRequests]);
  return (
    <IconBadgeButton icon={Users} label="Friends and activity" count={requests} onClick={onClick} />
  );
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
        "inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface font-mono font-medium tabular-nums text-ink shadow-stamp-sm transition hover:bg-panel active:translate-x-px active:translate-y-px active:shadow-none " +
        (compact ? "px-2.5 py-1 text-[13px] " : "px-3 py-1.5 text-sm ") +
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
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition " +
        (active ? "bg-brand text-brand-fg shadow-stamp-sm" : "text-muted hover:bg-panel hover:text-ink")
      }
    >
      <Icon
        size={18}
        className={active ? "text-brand-fg" : "text-subtle transition group-hover:text-ink"}
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
  onProfile,
  onAccount,
  onSignOut,
}: {
  displayName: string | null;
  avatarUrl: string | null;
  active: boolean;
  onProfile: () => void;
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
          "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition " +
          (active || open
            ? "border-accent bg-accent/10 text-accent"
            : "border-edge text-muted hover:bg-panel hover:text-ink")
        }
      >
        <Avatar url={avatarUrl} name={displayName || "Account"} size={24} />
        <span className="max-w-[140px] truncate">{displayName || "Account"}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-lg border border-edge bg-surface p-1 shadow-stamp">
          <button
            onClick={() => {
              onProfile();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
          >
            <UserRound size={15} className="text-accent" /> My Profile
          </button>
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

/** Desktop top bar: the universal search bar on the left; notifications, theme,
 *  and the profile menu on the right. */
export function TopBar(props: ChromeProps) {
  const { cloud, displayName, avatarUrl, signOut } = useStore();
  const visitingName = useStore((s) => s.viewing?.displayName ?? null);
  return (
    <header className="sticky top-0 z-20 hidden h-14 items-center justify-between gap-2 border-b border-edge bg-canvas/80 px-4 backdrop-blur md:flex">
      <SearchBar
        value={props.searchQuery}
        onChange={props.onSearchChange}
        onSubmit={props.onOpenSearch}
        placeholder={visitingName ? `Search ${visitingName}'s games…` : "Search your games…"}
      />
      <div className="flex items-center gap-2">
        {/* Desktop has room for three distinct entry points; they open the same
            unified drawer on their respective tab. */}
        {cloud && <SocialButton onClick={() => props.onOpenInbox("friends")} />}
        {cloud && <MessageButton onClick={() => props.onOpenInbox("messages")} />}
        {cloud && <NotificationsButton onClick={() => props.onOpenInbox("alerts")} />}
        <ThemeToggle />
        {cloud && (
          <ProfileMenu
            displayName={displayName}
            avatarUrl={avatarUrl}
            // While visiting, the profile view is the VISITED player's — your
            // own account button lighting up there would be misleading.
            active={
              visitingName == null && (props.view === "account" || props.view === "profile")
            }
            onProfile={props.onProfile}
            onAccount={props.onAccount}
            onSignOut={() => void signOut()}
          />
        )}
      </div>
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
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition " +
        (active ? "bg-brand text-brand-fg shadow-stamp-sm" : "text-muted hover:bg-panel hover:text-ink")
      }
    >
      <span className="relative">
        <Icon
          size={18}
          className={active ? "text-brand-fg" : "text-subtle transition group-hover:text-ink"}
        />
        {dot && (
          <span
            aria-label="New"
            className={
              "absolute -right-1 -top-1 h-2 w-2 rounded-full " +
              (active ? "bg-brand-fg ring-2 ring-brand" : "bg-accent ring-2 ring-surface")
            }
          />
        )}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {count > 0 && (
        <span
          aria-label={`${count} pending`}
          className={
            "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-xs font-semibold " +
            (active ? "bg-brand-fg text-brand" : "bg-brand text-brand-fg")
          }
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/** One consolidated "Add" control: a single button that opens a small menu with
 *  "Add a game" and "Add a compilation". Replaces the two separate buttons so the
 *  primary action is one tap. Rendered as a full-width primary button on the
 *  desktop rail (`variant="sidebar"`) and as a floating action button on mobile
 *  (`variant="fab"`). */
function AddMenu({
  onAdd,
  onAddCompilation,
  onImportCsv,
  variant,
}: {
  onAdd: () => void;
  onAddCompilation: () => void;
  onImportCsv: () => void;
  variant: "sidebar" | "fab";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Getting Started quest 1 highlights this control (both variants) — derived,
  // so the ring clears itself the moment the first game lands.
  const coachRing = useStore(selectCoachTarget) === "add-game";
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const choose = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  const ringCls = coachRing ? " ring-2 ring-brand ring-offset-2 ring-offset-canvas" : "";
  const menu = (
    <div className="overflow-hidden rounded-lg border border-edge bg-surface p-1 shadow-stamp">
      <button
        onClick={choose(onAdd)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink transition hover:bg-panel"
      >
        <Plus size={16} className="text-accent" /> Add a game
      </button>
      <button
        onClick={choose(onAddCompilation)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink transition hover:bg-panel"
      >
        <Package size={16} className="text-accent" /> Add a compilation
      </button>
      <button
        onClick={choose(onImportCsv)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink transition hover:bg-panel"
      >
        <FileUp size={16} className="text-accent" /> Import from CSV
      </button>
    </div>
  );

  if (variant === "fab") {
    return (
      <div ref={ref} className="relative flex flex-col items-end">
        {open && <div className="absolute bottom-full right-0 mb-2 w-52">{menu}</div>}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Add a game or compilation"
          className={
            "inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-3 font-display text-base font-semibold text-brand-fg shadow-stamp transition active:translate-x-px active:translate-y-px active:shadow-stamp-sm" +
            ringCls
          }
        >
          <Plus size={18} /> Add
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          "inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 font-display text-[15px] font-semibold text-brand-fg shadow-stamp transition hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-stamp-sm" +
          ringCls
        }
      >
        <Plus size={18} /> Add games <ChevronDown size={15} className="opacity-80" />
      </button>
      {open && <div className="absolute z-40 mt-2 w-full">{menu}</div>}
    </div>
  );
}

/** The labeled utility/page-nav rows. `profile` appends Account + Sign out (used
 *  in the mobile menu; on desktop those live in the top-bar profile menu). */
function UtilityActions(props: ChromeProps & { onClose?: () => void; profile?: boolean }) {
  const { cloud, isAdmin, permissions, signOut, displayName, submissionCount, reportCount } =
    useStore();
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
          icon={Tent}
          label="Market Square"
          active={props.view === "leaderboard"}
          onClick={run(props.onLeaderboard)}
        />
      )}
      {cloud && (
        <UtilRow
          icon={ShoppingBag}
          label="Curio Shop"
          active={props.view === "shop"}
          onClick={run(props.onShop)}
        />
      )}
      {cloud && (
        <UtilRow
          icon={Medal}
          label="Achievements"
          active={props.view === "achievements"}
          onClick={run(props.onAchievements)}
        />
      )}
      {cloud && (
        <UtilRow
          icon={ListOrdered}
          label="My Lists"
          active={props.view === "lists"}
          onClick={run(props.onLists)}
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
          count={submissionCount + reportCount}
          active={
            props.view === "admin" ||
            props.view === "users" ||
            props.view === "slots" ||
            props.view === "economy" ||
            props.view === "submissions" ||
            props.view === "catalog" ||
            props.view === "taxonomy" ||
            props.view === "reports" ||
            props.view === "stats" ||
            props.view === "roles"
          }
          onClick={run(props.onAdmin)}
        />
      )}
      {props.profile && cloud && (
        <UtilRow
          icon={UserRound}
          label="My Profile"
          active={props.view === "profile"}
          onClick={run(props.onProfile)}
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

/** Who the nav belongs to while visiting: the visited player's avatar, name and
 *  presence, in a brand tint so it can't be mistaken for your own chrome.
 *  Clicking it opens their profile (the visit's landing page). */
function VisitingChip({ onProfile }: { onProfile: () => void }) {
  const viewing = useStore((s) => s.viewing);
  if (!viewing) return null;
  const online = isOnline(viewing.lastSeenAt);
  return (
    <button
      onClick={onProfile}
      title={`View ${viewing.displayName}'s profile`}
      className="flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-left transition hover:bg-brand/20"
    >
      <Avatar url={viewing.avatarUrl} name={viewing.displayName} size={30} />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-accent/80">
          You&apos;re visiting
        </span>
        <span className="block truncate text-sm font-medium text-ink">{viewing.displayName}</span>
        {online ? (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-success">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
            <span className="truncate">{viewing.activity ?? "Online"}</span>
          </span>
        ) : (
          lastSeenLabel(viewing.lastSeenAt) && (
            <span className="mt-0.5 block truncate text-[10px] text-subtle">
              {lastSeenLabel(viewing.lastSeenAt)}
            </span>
          )
        )}
      </span>
    </button>
  );
}

/** Friend/message affordance for the visited player (moved here from the
 *  retired ViewingBanner): a nav row on the desktop rail, a compact icon button
 *  in the mobile top bar. States reflect your real relationship — friends get
 *  Message, an incoming request gets Accept, a sent one shows as pending. */
function VisitFriendRow({
  compact = false,
  onMessage,
}: {
  compact?: boolean;
  onMessage: (id: string, name: string) => void;
}) {
  const viewing = useStore((s) => s.viewing);
  const cloud = useStore((s) => s.cloud);
  const selfId = useStore((s) => s.userId);
  const friends = useStore((s) => s.friends);
  const requests = useStore((s) => s.friendRequests);
  const { fetchFriends, fetchFriendRequests, sendFriendRequest, respondFriendRequest } = useStore();

  const targetId = viewing?.userId;
  useEffect(() => {
    if (!cloud || !targetId) return;
    void fetchFriends();
    void fetchFriendRequests();
  }, [cloud, targetId, fetchFriends, fetchFriendRequests]);

  if (!cloud || !selfId || !viewing || selfId === viewing.userId) return null;

  const isFriend = friends.some((f) => f.id === viewing.userId);
  const incoming = requests.find((r) => r.otherId === viewing.userId && r.direction === "incoming");
  const outgoing = requests.find((r) => r.otherId === viewing.userId && r.direction === "outgoing");

  if (compact) {
    if (isFriend) {
      return (
        <button
          onClick={() => onMessage(viewing.userId, viewing.displayName)}
          aria-label="Message"
          title={`Send ${viewing.displayName} a message`}
          className={iconBtn}
        >
          <Mail size={18} />
        </button>
      );
    }
    if (incoming) {
      return (
        <button
          onClick={() => void respondFriendRequest(incoming.id, true)}
          aria-label="Accept friend request"
          title="Accept friend request"
          className={iconBtn}
        >
          <UserCheck size={18} />
        </button>
      );
    }
    if (outgoing) {
      return (
        <span aria-label="Friend request sent" title="Friend request sent" className={iconBtn + " opacity-60"}>
          <UserMinus size={18} />
        </span>
      );
    }
    return (
      <button
        onClick={() => void sendFriendRequest(viewing.userId)}
        aria-label="Add friend"
        title={`Send ${viewing.displayName} a friend request`}
        className={iconBtn}
      >
        <UserPlus size={18} />
      </button>
    );
  }

  if (isFriend) {
    return (
      <UtilRow
        icon={Mail}
        label="Message"
        onClick={() => onMessage(viewing.userId, viewing.displayName)}
      />
    );
  }
  if (incoming) {
    return (
      <UtilRow
        icon={UserCheck}
        label="Accept request"
        onClick={() => void respondFriendRequest(incoming.id, true)}
      />
    );
  }
  if (outgoing) {
    return (
      <span className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-subtle">
        <UserMinus size={18} /> Requested
      </span>
    );
  }
  return (
    <UtilRow
      icon={UserPlus}
      label="Add friend"
      onClick={() => void sendFriendRequest(viewing.userId)}
    />
  );
}

/** Report the visited player (moved here from the retired ViewingBanner). */
function VisitReportRow({ compact = false }: { compact?: boolean }) {
  const viewing = useStore((s) => s.viewing);
  const cloud = useStore((s) => s.cloud);
  const selfId = useStore((s) => s.userId);
  const [reporting, setReporting] = useState(false);
  if (!cloud || !viewing || !selfId || selfId === viewing.userId) return null;
  return (
    <>
      {compact ? (
        <button
          onClick={() => setReporting(true)}
          aria-label="Report"
          title={`Report ${viewing.displayName}`}
          className={iconBtn + " hover:text-danger"}
        >
          <Flag size={18} />
        </button>
      ) : (
        <UtilRow icon={Flag} label="Report" onClick={() => setReporting(true)} />
      )}
      {reporting && (
        <ReportModal
          target={{ id: viewing.userId, name: viewing.displayName }}
          kind="user"
          onClose={() => setReporting(false)}
        />
      )}
    </>
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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto border-r border-edge bg-surface/95 backdrop-blur md:flex">
      <div className="flex shrink-0 flex-col gap-4 p-4">
        <button onClick={() => props.setView("backlog")} className="block text-left">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink transition hover:text-accent">
            Backlog Bazaar
          </h1>
          {/* Each motto phrase is atomic — if the line must break, it breaks
              between phrases, never mid-phrase ("Play / more"). */}
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
            <span className="whitespace-nowrap">Beat games</span> ·{" "}
            <span className="whitespace-nowrap">Earn coins</span> ·{" "}
            <span className="whitespace-nowrap">Play more</span>
          </p>
        </button>
        {!visiting && <WalletChips onLedger={props.onTransactionLedger} />}
        {!visiting && (
          <AddMenu onAdd={props.onAdd} onAddCompilation={props.onAddCompilation} onImportCsv={props.onImportCsv} variant="sidebar" />
        )}
        {/* Whose pages the nav below leads to — the wallet/Add slot is free
            while visiting, so the visited player's identity takes it. */}
        {visiting && <VisitingChip onProfile={() => props.setView("profile")} />}
      </div>

      {/* The daily-use rows (Add games above + these boards) stay pinned on
          short viewports — overflow scrolls in the utility section below, never
          here. */}
      <nav className="shrink-0 px-3 py-1">
        <div className="flex flex-col gap-1">
          {/* While visiting, their Profile is the visit's landing page — pin it
              first so it's reachable without scrolling to the banner. */}
          {visiting && (
            <UtilRow
              icon={UserRound}
              label="Profile"
              active={props.view === "profile"}
              onClick={() => props.setView("profile")}
            />
          )}
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

      {visiting ? (
        /* The visit's social actions plus the way home, bottom-anchored where
           the utility pages normally sit — no banner to scroll back up to. */
        <div className="mt-auto border-t border-line p-3">
          <div className="flex flex-col gap-0.5">
            <VisitFriendRow onMessage={props.onMessageUser} />
            <VisitReportRow />
            <UtilRow icon={ChevronLeft} label="Leave" onClick={props.onLeave} />
          </div>
        </div>
      ) : (
        /* mt-auto keeps this block bottom-anchored on tall screens. Under
           height pressure it shrinks — becoming the sidebar's scroll region
           while the primary nav above stays fully visible — but only down to
           min-h-36 (a few visibly-scrollable rows); squeezed further, the
           whole rail scrolls instead (the aside's overflow-y-auto fallback)
           so the menu can never be pushed out of reach entirely. */
        <div className="mt-auto min-h-36 overflow-y-auto border-t border-line p-3">
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
  const reportCount = useStore((s) => s.reportCount);
  // The admin Catalog Submissions queue and Reports queue live inside the overflow
  // menu, so flag pending items with a dot on the More button — otherwise hidden.
  const menuAlert =
    cloud && hasAnyAdminPermission(permissions, isAdmin) && submissionCount + reportCount > 0;
  // See Sidebar: while visiting, drop your-account chrome (wallet, Add, The
  // Caravan, and the overflow menu of utility pages).
  const visiting = useStore((s) => s.viewing != null);
  const sections = visiting ? TABS.filter((t) => t.id !== "market") : TABS;
  // The floating Add button only makes sense on the game boards — on a utility
  // page (Requests & bugs, Leaderboard, …) it would read as "add an issue".
  const onGameTab = TABS.some((t) => t.id === props.view);
  useScrollLock(menuOpen, { mobileOnly: true });

  // Publish this header's live height to --mobile-chrome-h so sticky sub-bars
  // (the Master Ledger control bar) can pin just below it. The header grows when
  // its second row swaps the wallet strip for the taller "You're visiting" card,
  // so a fixed offset can't track it — we measure and republish on every resize
  // (issue 7df3dd85). Off-breakpoint (md+) the header is display:none and reports
  // 0, which the CSS media query ignores in favour of the desktop TopBar height.
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--mobile-chrome-h", `${el.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      {/* Two rows so the full wordmark + tagline never compete with the wallet
          for width: brand on top, the wallet bar below (hidden while visiting). */}
      <header
        ref={headerRef}
        className="sticky top-0 z-30 flex flex-col gap-2 border-b border-edge bg-canvas/85 px-4 py-2.5 backdrop-blur md:hidden"
      >
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => props.setView("backlog")}
            className="min-w-0 text-left transition hover:brightness-110"
          >
            <span className="block whitespace-nowrap font-display text-xl font-semibold leading-tight tracking-tight text-ink">
              Backlog Bazaar
            </span>
            {/* The compact motto — the full "Beat games · Earn coins · Play more"
                doesn't fit beside the header icons on a phone. */}
            <span className="block truncate font-mono text-[9px] uppercase leading-tight tracking-[0.14em] text-subtle">
              Beat · Earn · Play
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={props.onOpenSearch} aria-label="Search games" className={iconBtn}>
              <Search size={18} />
            </button>
            {cloud && <InboxButton onClick={() => props.onOpenInbox()} />}
            {!visiting && (
              <button
                onClick={() => setMenuOpen(true)}
                aria-label={menuAlert ? "More options (items need review)" : "More options"}
                className={iconBtn}
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
        {/* The wallet's row doubles as the whose-pages marker while visiting,
            with the visit's actions compacted into icon buttons beside it. */}
        {visiting && (
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <VisitingChip onProfile={() => props.setView("profile")} />
            </div>
            <VisitFriendRow compact onMessage={props.onMessageUser} />
            <VisitReportRow compact />
            <button
              onClick={props.onLeave}
              aria-label="Leave"
              title="Leave this Bazaar"
              className={iconBtn}
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        )}
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-edge bg-surface/95 backdrop-blur md:hidden">
        {/* While visiting, their Profile (the visit landing) gets a tab too —
            same reachability as the desktop rail. */}
        {visiting && (
          <button
            onClick={() => props.setView("profile")}
            aria-current={props.view === "profile" ? "page" : undefined}
            className={
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition " +
              (props.view === "profile" ? "text-accent" : "text-subtle")
            }
          >
            <UserRound size={20} />
            <span className="max-w-full truncate px-0.5">Profile</span>
          </button>
        )}
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
        <div className="fixed bottom-20 right-4 z-30 md:hidden">
          <AddMenu onAdd={props.onAdd} onAddCompilation={props.onAddCompilation} onImportCsv={props.onImportCsv} variant="fab" />
        </div>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-edge bg-surface p-4 pb-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-edge/60" />
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
