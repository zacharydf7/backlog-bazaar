import { useEffect, useState } from "react";
import {
  X,
  Users,
  Newspaper,
  Search,
  UserPlus,
  UserCheck,
  UserMinus,
  PartyPopper,
  Gamepad2,
  Loader2,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { AvatarWithPresence } from "./PresenceDot";
import { CoinIcon } from "./CoinIcon";
import { ConfirmDialog } from "./ConfirmDialog";
import { timeAgo } from "../lib/time";
import { isOnline } from "../lib/presence";
import { friendAction, activityHeadline, activityCoins } from "../lib/social";
import type { Friend, FriendRequest, UserSearchResult } from "../types";

type Tab = "feed" | "friends";

/** The Friends tab of the unified inbox: a friend's activity feed and the friend
 *  directory (search, pending requests, accepted friends). Renders as bare content;
 *  the drawer chrome (portal, header, scroll lock) lives in InboxDrawer. */
export function SocialPanel({
  onVisit,
  onMessage,
  onClose,
}: {
  onVisit: (userId: string) => void;
  onMessage: (userId: string, name: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("feed");
  const { fetchFeed, fetchFriends, fetchFriendRequests, friendRequestCount } = useStore();

  // Load everything the panel shows when it opens.
  useEffect(() => {
    void fetchFeed();
    void fetchFriends();
    void fetchFriendRequests();
  }, [fetchFeed, fetchFriends, fetchFriendRequests]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sub-tabs: activity feed vs. the friend directory. */}
      <div className="flex border-b border-line px-2">
        <TabButton icon={Newspaper} label="Feed" active={tab === "feed"} onClick={() => setTab("feed")} />
        <TabButton
          icon={Users}
          label="Friends"
          active={tab === "friends"}
          onClick={() => setTab("friends")}
          badge={friendRequestCount}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "feed" ? (
          <FeedTab />
        ) : (
          <FriendsTab onVisit={onVisit} onMessage={onMessage} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
  badge = 0,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={
        "relative flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition " +
        (active
          ? "border-brand text-accent"
          : "border-transparent text-muted hover:text-ink")
      }
    >
      <Icon size={16} /> {label}
      {badge > 0 && (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-fg">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

// --- Feed ------------------------------------------------------------------

function FeedTab() {
  const { feed, feedHasMore, feedLoadingMore, loadMoreFeed, cheerActivity, uncheerActivity } =
    useStore();

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) void loadMoreFeed();
  }

  if (feed.length === 0) {
    return (
      <EmptyState
        icon={Newspaper}
        title="No activity yet"
        body="When your friends import games, start Game Families, or finish a game, it shows up here."
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto" onScroll={onScroll}>
      <ul className="divide-y divide-line">
        {feed.map((e) => {
          const coins = activityCoins(e);
          return (
            <li key={e.id} className="flex items-start gap-3 px-4 py-3">
              <Avatar url={e.actorAvatar} name={e.actorName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-ink">
                  <span className="font-semibold">{e.actorName}</span>{" "}
                  <span className="text-muted">{activityHeadline(e)}</span>
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                  <span>{timeAgo(e.createdAt)}</span>
                  {coins != null && (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <CoinIcon size={12} /> {coins.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => (e.cheeredByMe ? uncheerActivity(e.id) : cheerActivity(e.id))}
                aria-pressed={e.cheeredByMe}
                title={e.cheeredByMe ? "Remove your cheer" : "Cheer this"}
                className={
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                  (e.cheeredByMe
                    ? "border-brand/50 bg-brand/15 text-accent"
                    : "border-line text-muted hover:border-brand/40 hover:text-ink")
                }
              >
                <PartyPopper size={13} /> {e.cheerCount > 0 ? e.cheerCount : "Cheer"}
              </button>
            </li>
          );
        })}
      </ul>
      {feedLoadingMore && (
        <p className="flex items-center justify-center gap-2 py-3 text-[11px] text-subtle">
          <Loader2 size={13} className="animate-spin" /> Loading…
        </p>
      )}
      {!feedHasMore && feed.length > 0 && (
        <p className="py-3 text-center text-[11px] text-subtle">You&apos;re all caught up.</p>
      )}
    </div>
  );
}

// --- Friends ---------------------------------------------------------------

function FriendsTab({
  onVisit,
  onMessage,
  onClose,
}: {
  onVisit: (id: string) => void;
  onMessage: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const { friends, friendRequests, removeFriend } = useStore();
  const [removing, setRemoving] = useState<Friend | null>(null);

  const incoming = friendRequests.filter((r) => r.direction === "incoming");
  const outgoing = friendRequests.filter((r) => r.direction === "outgoing");

  return (
    <div className="flex flex-col gap-5 p-4">
      <FriendSearch />

      {incoming.length > 0 && (
        <Section title="Friend requests">
          <ul className="flex flex-col gap-1.5">
            {incoming.map((r) => (
              <IncomingRow key={r.id} req={r} />
            ))}
          </ul>
        </Section>
      )}

      {outgoing.length > 0 && (
        <Section title="Sent requests">
          <ul className="flex flex-col gap-1.5">
            {outgoing.map((r) => (
              <OutgoingRow key={r.id} req={r} />
            ))}
          </ul>
        </Section>
      )}

      <Section title={friends.length > 0 ? `Friends · ${friends.length}` : "Friends"}>
        {friends.length === 0 ? (
          <p className="text-sm text-muted">
            No friends yet — search above to find players and send a request.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {friends.map((f) => (
              <FriendRow
                key={f.id}
                friend={f}
                onVisit={() => {
                  onVisit(f.id);
                  onClose();
                }}
                onMessage={() => onMessage(f.id, f.displayName)}
                onRemove={() => setRemoving(f)}
              />
            ))}
          </ul>
        )}
      </Section>

      {removing && (
        <ConfirmDialog
          title="Remove friend?"
          body={`Remove ${removing.displayName} from your friends? You can always send a new request later.`}
          confirmLabel="Remove"
          tone="danger"
          onConfirm={() => {
            void removeFriend(removing.id);
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h3>
      {children}
    </section>
  );
}

function FriendSearch() {
  const { searchUsers, sendFriendRequest, respondFriendRequest, cancelFriendRequest } = useStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Debounced live search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(async () => {
      setResults(await searchUsers(q));
      setSearching(false);
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, searchUsers]);

  async function act(r: UserSearchResult) {
    const cfg = friendAction(r.status);
    if (cfg.action === "send") await sendFriendRequest(r.id);
    else if (cfg.action === "accept") {
      // Find the incoming request id from the store, then accept.
      const req = useStore.getState().friendRequests.find(
        (x) => x.otherId === r.id && x.direction === "incoming",
      );
      if (req) await respondFriendRequest(req.id, true);
    } else if (cfg.action === "cancel") {
      const req = useStore.getState().friendRequests.find(
        (x) => x.otherId === r.id && x.direction === "outgoing",
      );
      if (req) await cancelFriendRequest(req.id);
    }
    // Re-run the search so the button reflects the new status.
    setResults(await searchUsers(query.trim()));
  }

  return (
    <div>
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find players by name…"
          className="w-full rounded-xl border border-line bg-panel py-2 pl-9 pr-3 text-sm text-ink outline-none transition focus:border-brand/50"
        />
      </div>
      {query.trim() && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {searching && results.length === 0 && (
            <li className="px-1 py-2 text-xs text-subtle">Searching…</li>
          )}
          {!searching && results.length === 0 && (
            <li className="px-1 py-2 text-xs text-subtle">No players found.</li>
          )}
          {results.map((r) => {
            const cfg = friendAction(r.status);
            return (
              <li
                key={r.id}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-panel/50 px-2.5 py-2"
              >
                <Avatar url={r.avatarUrl} name={r.displayName} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.displayName}</span>
                <button
                  onClick={() => void act(r)}
                  disabled={cfg.disabled}
                  className={
                    "inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition " +
                    (cfg.disabled
                      ? "cursor-default text-muted"
                      : "bg-brand text-brand-fg hover:brightness-105")
                  }
                >
                  <ActionIcon status={r.status} /> {cfg.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActionIcon({ status }: { status: UserSearchResult["status"] }) {
  if (status === "friends") return <UserCheck size={13} />;
  if (status === "pending_out") return <UserMinus size={13} />;
  if (status === "pending_in") return <UserCheck size={13} />;
  return <UserPlus size={13} />;
}

function IncomingRow({ req }: { req: FriendRequest }) {
  const { respondFriendRequest } = useStore();
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-line bg-panel/50 px-2.5 py-2">
      <Avatar url={req.otherAvatar} name={req.otherName} size={32} />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{req.otherName}</span>
      <button
        onClick={() => void respondFriendRequest(req.id, true)}
        className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-brand-fg transition hover:brightness-105"
      >
        <UserCheck size={13} /> Accept
      </button>
      <button
        onClick={() => void respondFriendRequest(req.id, false)}
        aria-label="Decline"
        className="rounded-lg border border-line p-1.5 text-muted transition hover:text-danger"
      >
        <X size={14} />
      </button>
    </li>
  );
}

function OutgoingRow({ req }: { req: FriendRequest }) {
  const { cancelFriendRequest } = useStore();
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-line bg-panel/50 px-2.5 py-2">
      <Avatar url={req.otherAvatar} name={req.otherName} size={32} />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{req.otherName}</span>
      <span className="text-[11px] text-subtle">Pending</span>
      <button
        onClick={() => void cancelFriendRequest(req.id)}
        className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-ink"
      >
        <UserMinus size={13} /> Cancel
      </button>
    </li>
  );
}

function FriendRow({
  friend,
  onVisit,
  onMessage,
  onRemove,
}: {
  friend: Friend;
  onVisit: () => void;
  onMessage: () => void;
  onRemove: () => void;
}) {
  const online = isOnline(friend.lastSeenAt);
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-line bg-panel/50 px-2.5 py-2">
      <AvatarWithPresence url={friend.avatarUrl} name={friend.displayName} size={36} online={online} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{friend.displayName}</p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-subtle">
          {friend.coins != null && (
            <span className="inline-flex items-center gap-1">
              <CoinIcon size={11} /> {friend.coins.toLocaleString()}
            </span>
          )}
          {friend.nowPlaying && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Gamepad2 size={11} className="shrink-0" />
              <span className="truncate">{friend.nowPlaying}</span>
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onMessage}
        aria-label={`Message ${friend.displayName}`}
        title="Send a message"
        className="shrink-0 rounded-lg border border-line p-1.5 text-muted transition hover:border-brand/40 hover:text-ink"
      >
        <Mail size={14} />
      </button>
      <button
        onClick={onVisit}
        className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition hover:border-brand/40 hover:text-ink"
      >
        Visit
      </button>
      <button
        onClick={onRemove}
        aria-label={`Remove ${friend.displayName}`}
        className="shrink-0 rounded-lg border border-line p-1.5 text-muted transition hover:text-danger"
      >
        <UserMinus size={14} />
      </button>
    </li>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-brand/10 text-accent">
        <Icon size={22} />
      </span>
      <p className="font-display text-base text-ink">{title}</p>
      <p className="max-w-xs text-sm text-muted">{body}</p>
    </div>
  );
}
