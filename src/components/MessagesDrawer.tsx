import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Mail,
  Send,
  Archive,
  ArchiveRestore,
  Trash2,
  ChevronLeft,
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
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { timeAgo } from "../lib/time";
import { MESSAGE_MAX, validateMessageBody } from "../lib/social";
import type { Conversation } from "../types";

/** The person on the other end of an open thread. */
type Other = { id: string; name: string; avatar: string | null };
type Pane = { kind: "list" } | { kind: "thread"; other: Other } | { kind: "pick" };

/** The messaging inbox: a right-side slide-out, chat-style. The list groups
 *  messages into per-friend conversations; opening one shows the full back-and-forth
 *  as bubbles with a reply box. Toggled from the top-bar envelope; gated behind
 *  `social.use` by the caller. */
export function MessagesDrawer({
  onClose,
  initialCompose = null,
}: {
  onClose: () => void;
  initialCompose?: { id: string; name: string } | null;
}) {
  const { fetchConversations, fetchUnreadMessageCount, fetchFriends } = useStore();
  const [pane, setPane] = useState<Pane>(
    initialCompose
      ? { kind: "thread", other: { id: initialCompose.id, name: initialCompose.name, avatar: null } }
      : { kind: "list" },
  );

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  useEffect(() => {
    void fetchConversations();
    void fetchUnreadMessageCount();
    void fetchFriends(); // for the new-message recipient picker
  }, [fetchConversations, fetchUnreadMessageCount, fetchFriends]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-label="Messages"
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <Mail size={18} className="text-accent" /> Messages
          </span>
          <div className="flex items-center gap-1">
            {pane.kind === "list" && (
              <button
                onClick={() => setPane({ kind: "pick" })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-brand-fg transition hover:brightness-105"
              >
                <PenSquare size={14} /> New
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-subtle transition hover:bg-panel hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {pane.kind === "list" && (
          <ConversationList onOpen={(other) => setPane({ kind: "thread", other })} />
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
    </div>,
    document.body,
  );
}

function ConversationList({ onOpen }: { onOpen: (other: Other) => void }) {
  const { conversations, conversationsLoading } = useStore();
  const [tab, setTab] = useState<"inbox" | "archived">("inbox");
  const shown = conversations.filter((c) => (tab === "archived" ? c.archived : !c.archived));

  return (
    <>
      <div className="flex border-b border-line px-2">
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
  } = useStore();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  // Which message is being edited inline (id), plus its draft text.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmingMsgDelete, setConfirmingMsgDelete] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
  async function onSend() {
    if (validateMessageBody(reply)) return;
    setSending(true);
    const ok = await sendMessage(other.id, reply);
    setSending(false);
    if (ok) {
      setReply("");
      await fetchThread(other.id);
      void fetchConversations();
    }
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
                              <span
                                className={
                                  "mt-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs " +
                                  (m.outgoing ? "bg-black/15" : "bg-surface")
                                }
                              >
                                <Gamepad2 size={12} /> {m.gameTitle}
                              </span>
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

      <div className="border-t border-line p-3">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void onSend();
            }
          }}
          rows={2}
          maxLength={MESSAGE_MAX}
          placeholder={`Message ${other.name}…`}
          className="w-full resize-none rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition focus:border-brand/50"
        />
        {replyError && <p className="mt-1 text-[11px] text-danger">{replyError}</p>}
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => void onSend()}
            disabled={sending || !reply.trim() || replyError != null}
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
    </div>
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
