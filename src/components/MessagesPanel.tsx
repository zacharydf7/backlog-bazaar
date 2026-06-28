import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Send,
  Archive,
  ArchiveRestore,
  Trash2,
  ChevronLeft,
  Eye,
  Heart,
  PenSquare,
  Pencil,
  Check,
  Gamepad2,
  Loader2,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { ConfirmDialog } from "./ConfirmDialog";
import { EditGameModal } from "./EditGameModal";
import { ViewingProvider } from "../lib/viewContext";
import { timeAgo } from "../lib/time";
import { toast } from "../lib/toast";
import { MESSAGE_MAX, validateMessageBody, findMentionQuery, libraryHasTitle } from "../lib/social";
import { searchLibrary } from "../lib/librarySearch";
import type { Conversation, Game, Message } from "../types";

/** A game attached to a message being composed. */
type AttachedGame = { id: string; title: string; image: string | null };

/** The person on the other end of an open thread. */
type Other = { id: string; name: string; avatar: string | null };
type Pane = { kind: "list" } | { kind: "thread"; other: Other } | { kind: "pick" };

/** The Messages tab of the unified inbox, chat-style. The list groups messages into
 *  per-friend conversations; opening one shows the full back-and-forth as bubbles with
 *  a reply box. Renders as bare content; the drawer chrome lives in InboxDrawer. */
export function MessagesPanel({
  initialCompose = null,
}: {
  initialCompose?: { id: string; name: string } | null;
}) {
  const { fetchConversations, fetchUnreadMessageCount, fetchFriends } = useStore();
  const [pane, setPane] = useState<Pane>(
    initialCompose
      ? { kind: "thread", other: { id: initialCompose.id, name: initialCompose.name, avatar: null } }
      : { kind: "list" },
  );

  useEffect(() => {
    void fetchConversations();
    void fetchUnreadMessageCount();
    void fetchFriends(); // for the new-message recipient picker
  }, [fetchConversations, fetchUnreadMessageCount, fetchFriends]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {pane.kind === "list" && (
        <ConversationList
          onOpen={(other) => setPane({ kind: "thread", other })}
          onNew={() => setPane({ kind: "pick" })}
        />
      )}
      {pane.kind === "thread" && (
        <ThreadView other={pane.other} onBack={() => setPane({ kind: "list" })} />
      )}
      {pane.kind === "pick" && (
        <PickFriend
          onPick={(other) => setPane({ kind: "thread", other })}
          onCancel={() => setPane({ kind: "list" })}
        />
      )}
    </div>
  );
}

function ConversationList({
  onOpen,
  onNew,
}: {
  onOpen: (other: Other) => void;
  onNew: () => void;
}) {
  const { conversations, conversationsLoading } = useStore();
  const [tab, setTab] = useState<"inbox" | "archived">("inbox");
  const shown = conversations.filter((c) => (tab === "archived" ? c.archived : !c.archived));

  return (
    <>
      <div className="flex items-center border-b border-line px-2">
        {(["inbox", "archived"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "true" : undefined}
            className={
              "flex-1 border-b-2 px-3 py-2.5 text-sm font-medium capitalize transition " +
              (tab === t
                ? "border-brand text-accent"
                : "border-transparent text-muted hover:text-ink")
            }
          >
            {t}
          </button>
        ))}
        <button
          onClick={onNew}
          className="my-1.5 ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-brand-fg transition hover:brightness-105"
        >
          <PenSquare size={14} /> New
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversationsLoading ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-subtle">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </p>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={tab === "archived" ? "No archived chats" : "No conversations yet"}
            body={
              tab === "archived"
                ? "Conversations you archive will show up here."
                : "Start a chat with a friend using New — or “Send message” on a friend in the Friends panel."
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((c) => (
              <ConversationRowItem key={c.otherId} c={c} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ConversationRowItem({ c, onOpen }: { c: Conversation; onOpen: (other: Other) => void }) {
  return (
    <li>
      <button
        onClick={() => onOpen({ id: c.otherId, name: c.otherName, avatar: c.otherAvatar })}
        className={
          "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-panel/60 " +
          (c.unreadCount > 0 ? "bg-brand/5" : "")
        }
      >
        <Avatar url={c.otherAvatar} name={c.otherName} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-ink">{c.otherName}</span>
            <span className="shrink-0 text-[11px] text-subtle">{timeAgo(c.lastCreatedAt)}</span>
          </div>
          <p className="truncate text-xs text-muted">
            {c.lastDeleted ? (
              <span className="italic text-subtle">Message deleted</span>
            ) : (
              <>
                {c.lastOutgoing && <span className="text-subtle">You: </span>}
                {c.lastBody}
              </>
            )}
          </p>
        </div>
        {c.unreadCount > 0 && (
          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-fg">
            {c.unreadCount > 9 ? "9+" : c.unreadCount}
          </span>
        )}
      </button>
    </li>
  );
}

function ThreadView({ other, onBack }: { other: Other; onBack: () => void }) {
  const {
    thread,
    threadLoading,
    conversations,
    fetchThread,
    markThreadRead,
    sendMessage,
    editMessage,
    deleteMessage,
    archiveConversation,
    removeConversation,
    fetchConversations,
    games,
    fetchPlayerLibrary,
    addGame,
  } = useStore();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  // Which message is being edited inline (id), plus its draft text.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmingMsgDelete, setConfirmingMsgDelete] = useState<string | null>(null);
  // Game-embed state: the in-progress "@" mention (if any) and the attached game.
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [attachedGame, setAttachedGame] = useState<AttachedGame | null>(null);
  // A shared game being previewed read-only (like visiting the owner's Bazaar), plus
  // a cache of the other player's library so an incoming card resolves to live data.
  const [preview, setPreview] = useState<{ game: Game; hideSpend: boolean } | null>(null);
  const [otherGames, setOtherGames] = useState<Game[] | null>(null);
  // A send failure to show inline by the composer (e.g. the friends-only guard),
  // rather than the global error banner.
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // Open the read-only preview for an embedded game card. The game belongs to the
  // message's sender: it's in your own library for an outgoing card, or fetched from
  // the sender's (privacy-filtered) library for an incoming one.
  async function openPreview(m: Message) {
    if (m.deleted || !m.gameId) {
      toast("This game isn’t available to preview.");
      return;
    }
    if (m.outgoing) {
      const g = games.find((x) => x.id === m.gameId);
      if (g) setPreview({ game: g, hideSpend: false });
      else toast("This game isn’t in your library anymore.");
      return;
    }
    let lib = otherGames;
    if (!lib) {
      lib = await fetchPlayerLibrary(other.id);
      setOtherGames(lib);
    }
    const g = lib.find((x) => x.id === m.gameId);
    if (g) setPreview({ game: g, hideSpend: true });
    else toast("This game isn’t available to preview.");
  }

  // Add a shared game straight to your Wishlist with sensible defaults — no form,
  // staying in the chat (like adding from the Caravan). Uses the sender's full game
  // (length, genres, the live-service flag…) when we can resolve it, resetting their
  // personal playtime and owned copies; otherwise falls back to the card's snapshot.
  async function addToWishlist(m: Message) {
    if (!m.gameTitle) return;
    let g: Game | undefined;
    if (m.outgoing) {
      g = games.find((x) => x.id === m.gameId);
    } else {
      let lib = otherGames;
      if (!lib) {
        lib = await fetchPlayerLibrary(other.id);
        setOtherGames(lib);
      }
      g = lib.find((x) => x.id === m.gameId);
    }
    await addGame(
      g
        ? { ...g, playedHours: 0, copies: [] }
        : { title: m.gameTitle, image: m.gameImage ?? undefined, genres: [] },
      "wishlist",
    );
  }

  // Own games matching the active @mention (or recent games for a bare "@").
  const suggestions = useMemo<Game[]>(() => {
    if (!mention) return [];
    const q = mention.query.trim();
    const base = q
      ? searchLibrary(games, q)
      : [...games].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    return base.slice(0, 6);
  }, [mention, games]);

  function attachGame(g: Game) {
    setAttachedGame({ id: g.id, title: g.title, image: g.image ?? null });
    if (mention) {
      // Strip the "@query" token that triggered the picker.
      setReply((r) => r.slice(0, mention.start) + r.slice(mention.start + 1 + mention.query.length));
    }
    setMention(null);
    replyRef.current?.focus();
  }

  // The conversation summary (if any) tells us the archived state for the toggle.
  const conv = conversations.find((c) => c.otherId === other.id);
  const archived = conv?.archived ?? false;
  // The id of the caller's most-recent (non-deleted) message — the only one editable.
  const lastOwnId = [...thread].reverse().find((m) => m.outgoing && !m.deleted)?.id ?? null;

  // Load the thread + mark it read on open.
  useEffect(() => {
    void fetchThread(other.id);
    void markThreadRead(other.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [other.id]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread.length]);

  const replyError = reply.trim() ? validateMessageBody(reply) : null;
  const canSend = !sending && !replyError && (reply.trim().length > 0 || attachedGame != null);
  async function onSend() {
    if (!canSend) return;
    setSending(true);
    const err = await sendMessage(other.id, reply, attachedGame?.id ?? null);
    setSending(false);
    if (err) {
      setSendError(err);
      return;
    }
    setSendError(null);
    setReply("");
    setAttachedGame(null);
    setMention(null);
    await fetchThread(other.id);
    void fetchConversations();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <button
          onClick={onBack}
          aria-label="Back"
          className="rounded-lg p-1.5 text-subtle transition hover:bg-panel hover:text-ink"
        >
          <ChevronLeft size={18} />
        </button>
        <Avatar url={other.avatar} name={other.name} size={28} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{other.name}</span>
        <button
          onClick={async () => {
            await archiveConversation(other.id, !archived);
            onBack();
          }}
          aria-label={archived ? "Unarchive conversation" : "Archive conversation"}
          title={archived ? "Unarchive" : "Archive"}
          className="rounded-lg p-1.5 text-subtle transition hover:bg-panel hover:text-ink"
        >
          {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
        </button>
        <button
          onClick={() => setConfirmingRemove(true)}
          aria-label="Remove chat"
          title="Remove chat from your list"
          className="rounded-lg p-1.5 text-subtle transition hover:text-danger"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {threadLoading && thread.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-subtle">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </p>
        ) : thread.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            No messages yet — say hello to {other.name}.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {thread.map((m) => {
              const editing = editingId === m.id;
              // Whether a shared game is already in your library (any board) — if so we
              // hide the wishlist action, since there's nothing to add.
              const owned = libraryHasTitle(games, m.gameTitle);
              return (
                <li
                  key={m.id}
                  className={"group flex flex-col " + (m.outgoing ? "items-end" : "items-start")}
                >
                  {editing ? (
                    <div className="w-full max-w-[85%]">
                      <textarea
                        autoFocus
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingId(null);
                            return;
                          }
                          // Enter saves; Shift+Enter inserts a newline.
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (validateMessageBody(editDraft)) return;
                            void editMessage(m.id, editDraft.trim()).then((ok) => {
                              if (ok) setEditingId(null);
                            });
                          }
                        }}
                        rows={2}
                        maxLength={MESSAGE_MAX}
                        className="w-full resize-none rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-brand/50"
                      />
                      <div className="mt-1 flex justify-end gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-md px-2 py-1 text-xs text-muted transition hover:text-ink"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            if (validateMessageBody(editDraft)) return;
                            const ok = await editMessage(m.id, editDraft.trim());
                            if (ok) setEditingId(null);
                          }}
                          disabled={!editDraft.trim() || validateMessageBody(editDraft) != null}
                          className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
                        >
                          <Check size={12} /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={
                        "flex max-w-[85%] items-end gap-1 " +
                        (m.outgoing ? "flex-row" : "flex-row-reverse")
                      }
                    >
                      {/* Own, non-deleted messages get edit (latest only) + delete on hover. */}
                      {m.outgoing && !m.deleted && (
                        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                          {m.id === lastOwnId && (
                            <button
                              onClick={() => {
                                setEditingId(m.id);
                                setEditDraft(m.body);
                              }}
                              aria-label="Edit message"
                              title="Edit"
                              className="rounded p-1 text-subtle transition hover:text-ink"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmingMsgDelete(m.id)}
                            aria-label="Delete message"
                            title="Delete"
                            className="rounded p-1 text-subtle transition hover:text-danger"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                      <div
                        className={
                          "min-w-0 whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm " +
                          (m.deleted
                            ? "border border-line bg-transparent italic text-subtle"
                            : m.outgoing
                              ? "bg-brand text-brand-fg"
                              : "bg-panel text-ink")
                        }
                      >
                        {m.deleted ? (
                          "This message was deleted"
                        ) : (
                          <>
                            {m.body}
                            {m.gameTitle && (
                              <div
                                className={
                                  "flex flex-col gap-1.5 rounded-lg p-1.5 " +
                                  (m.body ? "mt-1.5 " : "") +
                                  (m.outgoing ? "bg-black/15" : "bg-surface")
                                }
                              >
                                <div className="flex items-center gap-2">
                                  {m.gameImage ? (
                                    <img
                                      src={m.gameImage}
                                      alt=""
                                      className="h-12 w-9 shrink-0 rounded object-cover"
                                    />
                                  ) : (
                                    <span className="grid h-12 w-9 shrink-0 place-items-center rounded bg-line/60">
                                      <Gamepad2 size={14} />
                                    </span>
                                  )}
                                  <span className="min-w-0 flex-1 break-words text-xs font-medium leading-snug">
                                    {m.gameTitle}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  <EmbedButton outgoing={m.outgoing} onClick={() => void openPreview(m)}>
                                    <Eye size={12} /> View card
                                  </EmbedButton>
                                  {/* A shared game is a recommendation → offer to wishlist
                                      it, unless it's already in your library. */}
                                  {!owned && (
                                    <EmbedButton
                                      outgoing={m.outgoing}
                                      onClick={() => void addToWishlist(m)}
                                    >
                                      <Heart size={12} /> Wishlist
                                    </EmbedButton>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  <span className="mt-0.5 px-1 text-[10px] text-subtle">
                    {timeAgo(m.createdAt)}
                    {m.editedAt && !m.deleted ? " · edited" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="relative border-t border-line p-3">
        {/* @-mention game picker (own library). */}
        {mention && suggestions.length > 0 && (
          <div className="absolute inset-x-3 bottom-full mb-1 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
            <p className="border-b border-line px-3 py-1.5 text-[10px] uppercase tracking-wide text-subtle">
              Share a game
            </p>
            <ul className="max-h-56 overflow-y-auto">
              {suggestions.map((g) => (
                <li key={g.id}>
                  <button
                    onClick={() => attachGame(g)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-panel"
                  >
                    {g.image ? (
                      <img
                        src={g.image}
                        alt=""
                        className="h-10 w-[30px] shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="grid h-10 w-[30px] shrink-0 place-items-center rounded bg-line/60">
                        <Gamepad2 size={13} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{g.title}</span>
                    <span className="shrink-0 text-[10px] uppercase text-subtle">{g.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Attached game preview. */}
        {attachedGame && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 p-1.5">
            {attachedGame.image ? (
              <img
                src={attachedGame.image}
                alt=""
                className="h-12 w-9 shrink-0 rounded object-cover"
              />
            ) : (
              <span className="grid h-12 w-9 shrink-0 place-items-center rounded bg-line/60">
                <Gamepad2 size={14} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] uppercase tracking-wide text-accent">Sharing</span>
              <span className="block truncate text-sm font-medium text-ink">
                {attachedGame.title}
              </span>
            </span>
            <button
              onClick={() => setAttachedGame(null)}
              aria-label="Remove attached game"
              className="shrink-0 rounded-lg p-1 text-subtle transition hover:text-danger"
            >
              <X size={15} />
            </button>
          </div>
        )}

        <textarea
          ref={replyRef}
          value={reply}
          onChange={(e) => {
            setReply(e.target.value);
            if (sendError) setSendError(null);
            setMention(findMentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length));
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && mention) {
              setMention(null);
              return;
            }
            // Enter sends; Shift+Enter inserts a newline. While the @-game picker is
            // open, Enter dismisses it first so you don't fire off a half-typed token.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (mention && suggestions.length > 0) {
                setMention(null);
                return;
              }
              void onSend();
            }
          }}
          rows={2}
          maxLength={MESSAGE_MAX}
          placeholder={`Message ${other.name}…  (Enter to send · type @ to share a game)`}
          className="w-full resize-none rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition focus:border-brand/50"
        />
        {(replyError || sendError) && (
          <p className="mt-1 text-[11px] text-danger">{replyError ?? sendError}</p>
        )}
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => void onSend()}
            disabled={!canSend}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={15} /> Send
          </button>
        </div>
      </div>

      {confirmingRemove && (
        <ConfirmDialog
          title="Remove this chat?"
          body={`Remove your conversation with ${other.name} from your list. Nothing is lost — if either of you messages again, the chat comes back with its full history.`}
          confirmLabel="Remove"
          tone="danger"
          onConfirm={() => {
            void removeConversation(other.id);
            setConfirmingRemove(false);
            onBack();
          }}
          onCancel={() => setConfirmingRemove(false)}
        />
      )}

      {confirmingMsgDelete && (
        <ConfirmDialog
          title="Delete message?"
          body="This removes the message for both of you — it'll show as “This message was deleted.” You can't undo this."
          confirmLabel="Delete"
          tone="danger"
          onConfirm={() => {
            void deleteMessage(confirmingMsgDelete);
            setConfirmingMsgDelete(null);
          }}
          onCancel={() => setConfirmingMsgDelete(null)}
        />
      )}

      {/* Read-only preview of a shared game — the same card you'd see visiting the
          owner's Bazaar (spend hidden for someone else's game). */}
      {preview &&
        createPortal(
          <ViewingProvider value={{ readOnly: true, hideSpend: preview.hideSpend }}>
            <EditGameModal game={preview.game} onClose={() => setPreview(null)} />
          </ViewingProvider>,
          document.body,
        )}
    </div>
  );
}

/** A small action pill on an embedded game card, themed for its bubble side. */
function EmbedButton({
  outgoing,
  onClick,
  children,
}: {
  outgoing: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition " +
        (outgoing
          ? "bg-black/20 text-brand-fg hover:bg-black/30"
          : "bg-panel text-ink hover:brightness-95")
      }
    >
      {children}
    </button>
  );
}

function PickFriend({
  onPick,
  onCancel,
}: {
  onPick: (other: Other) => void;
  onCancel: () => void;
}) {
  const friends = useStore((s) => s.friends);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <button
          onClick={onCancel}
          aria-label="Back"
          className="rounded-lg p-1.5 text-subtle transition hover:bg-panel hover:text-ink"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-display text-base text-ink">New message</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {friends.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No friends yet"
            body="You can only message friends — add some from the Friends panel first."
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {friends.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => onPick({ id: f.id, name: f.displayName, avatar: f.avatarUrl })}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-panel/60"
                >
                  <Avatar url={f.avatarUrl} name={f.displayName} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
