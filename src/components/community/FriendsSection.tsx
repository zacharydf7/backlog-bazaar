import { useEffect, useMemo, useState } from "react";
import {
  X,
  Search,
  UserPlus,
  UserCheck,
  UserMinus,
  Gamepad2,
  Mail,
  ChevronDown,
  ChevronRight,
  Users,
} from "lucide-react";
import { useStore } from "../../store";
import { Avatar } from "../Avatar";
import { AvatarWithPresence } from "../PresenceDot";
import { CoinIcon } from "../CoinIcon";
import { ConfirmDialog } from "../ConfirmDialog";
import { KebabMenu } from "../KebabMenu";
import { EmptyState } from "./EmptyState";
import { isOnline } from "../../lib/presence";
import { friendAction } from "../../lib/social";
import {
  filterFriends,
  sortFriends,
  friendSubtitle,
  FRIEND_SORTS,
  type FriendSort,
} from "../../lib/friendsList";
import type { Friend, FriendRequest, UserSearchResult } from "../../types";

/** The Friends section: player search and pending requests beside the accepted
 *  friend directory (two columns on a wide screen, stacked on a phone). Row
 *  hierarchy: the row itself visits the profile, Message is the visible
 *  secondary action, and Remove hides behind the overflow menu with a
 *  confirmation. */
export function FriendsSection({
  onVisit,
  onMessage,
}: {
  onVisit: (userId: string) => void;
  onMessage: (userId: string, name: string) => void;
}) {
  const { friends, friendRequests, removeFriend, fetchFriends, fetchFriendRequests } = useStore();
  const [removing, setRemoving] = useState<Friend | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<FriendSort>("online");
  // Sent requests are secondary — collapsed to a one-line disclosure.
  const [sentOpen, setSentOpen] = useState(false);

  useEffect(() => {
    void fetchFriends();
    void fetchFriendRequests();
  }, [fetchFriends, fetchFriendRequests]);

  const incoming = friendRequests.filter((r) => r.direction === "incoming");
  const outgoing = friendRequests.filter((r) => r.direction === "outgoing");
  const shown = useMemo(
    () => sortFriends(filterFriends(friends, filter), sort),
    [friends, filter, sort],
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {/* Find & requests: what needs attention, ahead of the directory. */}
      <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4">
        <Section title="Find players">
          <FriendSearch />
        </Section>

        {incoming.length > 0 && (
          <Section title={`Friend requests · ${incoming.length}`}>
            <ul className="flex flex-col gap-1.5">
              {incoming.map((r) => (
                <IncomingRow key={r.id} req={r} />
              ))}
            </ul>
          </Section>
        )}

        {outgoing.length > 0 && (
          <section>
            <button
              onClick={() => setSentOpen((o) => !o)}
              aria-expanded={sentOpen}
              className="flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wide text-subtle transition hover:text-ink"
            >
              {sentOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Sent requests · {outgoing.length}
            </button>
            {sentOpen && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {outgoing.map((r) => (
                  <OutgoingRow key={r.id} req={r} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* The directory. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">
          {friends.length > 0 ? `Friends · ${friends.length}` : "Friends"}
        </h3>

        {friends.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No friends yet"
            body="Search for players by name and send a request — friends unlock the activity feed, messages, loans, and more."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 basis-40">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
                />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter friends…"
                  aria-label="Filter friends by name"
                  className="w-full rounded-lg border border-line bg-panel py-1.5 pl-8 pr-2.5 text-sm text-ink outline-none transition focus:border-brand/50"
                />
              </div>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Sort friends">
                {FRIEND_SORTS.map((s) => (
                  <button
                    key={s.value}
                    role="radio"
                    aria-checked={sort === s.value}
                    onClick={() => setSort(s.value)}
                    className={
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                      (sort === s.value
                        ? "border-brand bg-brand/10 text-accent"
                        : "border-line text-muted hover:text-ink")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {shown.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">
                No friends match “{filter.trim()}”.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {shown.map((f) => (
                  <FriendRow
                    key={f.id}
                    friend={f}
                    onVisit={() => onVisit(f.id)}
                    onMessage={() => onMessage(f.id, f.displayName)}
                    onRemove={() => setRemoving(f)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

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
      const req = useStore
        .getState()
        .friendRequests.find((x) => x.otherId === r.id && x.direction === "incoming");
      if (req) await respondFriendRequest(req.id, true);
    } else if (cfg.action === "cancel") {
      const req = useStore
        .getState()
        .friendRequests.find((x) => x.otherId === r.id && x.direction === "outgoing");
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
        title="Decline"
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
  const sub = friendSubtitle(friend);
  return (
    <li className="flex items-center gap-1.5 rounded-xl border border-line bg-panel/50 pr-2 transition hover:border-brand/40">
      {/* The row itself is the primary action: visit their profile. */}
      <button
        onClick={onVisit}
        title={`Visit ${friend.displayName}'s profile`}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-l-xl px-2.5 py-2 text-left"
      >
        <AvatarWithPresence
          url={friend.avatarUrl}
          name={friend.displayName}
          size={36}
          online={online}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{friend.displayName}</span>
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
            {sub.text && (
              <span
                className={
                  "truncate " + (sub.kind === "activity" ? "text-success" : "text-subtle")
                }
              >
                {sub.text}
              </span>
            )}
            {friend.nowPlaying && (
              <span className="inline-flex min-w-0 items-center gap-1 text-subtle">
                <Gamepad2 size={11} className="shrink-0" />
                <span className="truncate">{friend.nowPlaying}</span>
              </span>
            )}
            {friend.coins != null && (
              <span className="inline-flex items-center gap-1 text-subtle">
                <CoinIcon size={11} /> {friend.coins.toLocaleString()}
              </span>
            )}
          </span>
        </span>
      </button>
      <button
        onClick={onMessage}
        aria-label={`Message ${friend.displayName}`}
        title="Send a message"
        className="shrink-0 rounded-lg border border-line p-1.5 text-muted transition hover:border-brand/40 hover:text-ink"
      >
        <Mail size={14} />
      </button>
      <KebabMenu
        label={`More actions for ${friend.displayName}`}
        items={[{ icon: UserMinus, label: "Remove friend…", danger: true, onClick: onRemove }]}
      />
    </li>
  );
}
