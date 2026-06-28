import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Mail,
  Send,
  Archive,
  Trash2,
  ChevronLeft,
  PenSquare,
  Gamepad2,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { timeAgo } from "../lib/time";
import { MESSAGE_FOLDERS, MESSAGE_MAX, validateMessageBody } from "../lib/social";
import type { Message, MessageFolder } from "../types";

type Pane = { kind: "list" } | { kind: "read"; id: string } | { kind: "compose"; toId?: string };

/** The messaging inbox: a right-side slide-out with Inbox / Sent / Archived
 *  folders, a reading pane (reply + quick actions), and a composer. Toggled from
 *  the top-bar envelope; gated behind `social.use` by the caller. */
export function MessagesDrawer({
  onClose,
  initialCompose = null,
}: {
  onClose: () => void;
  initialCompose?: { id: string; name: string } | null;
}) {
  const { fetchMessages, fetchUnreadMessageCount, fetchFriends } = useStore();
  const [pane, setPane] = useState<Pane>(
    initialCompose ? { kind: "compose", toId: initialCompose.id } : { kind: "list" },
  );

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  useEffect(() => {
    void fetchMessages("received");
    void fetchUnreadMessageCount();
    void fetchFriends(); // for the composer's recipient picker
  }, [fetchMessages, fetchUnreadMessageCount, fetchFriends]);

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
                onClick={() => setPane({ kind: "compose" })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-brand-fg transition hover:brightness-105"
              >
                <PenSquare size={14} /> Compose
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

        {pane.kind === "list" && <FolderList onOpen={(id) => setPane({ kind: "read", id })} />}
        {pane.kind === "read" && (
          <ReadingPane id={pane.id} onBack={() => setPane({ kind: "list" })} />
        )}
        {pane.kind === "compose" && (
          <Composer
            toId={pane.toId}
            onDone={() => {
              void fetchMessages("sent");
              setPane({ kind: "list" });
            }}
            onCancel={() => setPane({ kind: "list" })}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

function FolderList({ onOpen }: { onOpen: (id: string) => void }) {
  const { messages, messageFolder, messagesLoading, fetchMessages } = useStore();

  return (
    <>
      <div className="flex border-b border-line px-2">
        {MESSAGE_FOLDERS.map((f) => (
          <button
            key={f.value}
            onClick={() => void fetchMessages(f.value)}
            aria-current={messageFolder === f.value ? "true" : undefined}
            className={
              "flex-1 border-b-2 px-3 py-2.5 text-sm font-medium transition " +
              (messageFolder === f.value
                ? "border-brand text-accent"
                : "border-transparent text-muted hover:text-ink")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {messagesLoading ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-subtle">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </p>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="Nothing here"
            body={
              messageFolder === "received"
                ? "Messages from your friends will show up here."
                : messageFolder === "sent"
                  ? "Messages you send will show up here."
                  : "Messages you archive will show up here."
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {messages.map((m) => (
              <MessageRowItem key={m.id} message={m} onOpen={() => onOpen(m.id)} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function MessageRowItem({ message: m, onOpen }: { message: Message; onOpen: () => void }) {
  const unread = !m.outgoing && m.readAt == null;
  return (
    <li>
      <button
        onClick={onOpen}
        className={
          "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-panel/60 " +
          (unread ? "bg-brand/5" : "")
        }
      >
        <Avatar url={m.otherAvatar} name={m.otherName} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
            <span className="truncate text-sm font-medium text-ink">{m.otherName}</span>
            {m.outgoing && <span className="text-[10px] uppercase text-subtle">You →</span>}
          </div>
          <p className="truncate text-xs text-muted">{m.body}</p>
          <span className="mt-0.5 block text-[11px] text-subtle">{timeAgo(m.createdAt)}</span>
        </div>
      </button>
    </li>
  );
}

function ReadingPane({ id, onBack }: { id: string; onBack: () => void }) {
  const { messages, markMessageRead, archiveMessage, deleteMessage, sendMessage } = useStore();
  const message = useMemo(() => messages.find((m) => m.id === id), [messages, id]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  // Mark a received message read on open.
  useEffect(() => {
    if (message && !message.outgoing && message.readAt == null) void markMessageRead(message.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // If the message left the list (archived/deleted), fall back to the list.
  useEffect(() => {
    if (!message) onBack();
  }, [message, onBack]);
  if (!message) return null;

  const replyError = reply.trim() ? validateMessageBody(reply) : null;
  async function onReply() {
    if (!message || validateMessageBody(reply)) return;
    setSending(true);
    const ok = await sendMessage(message.otherId, reply);
    setSending(false);
    if (ok) setReply("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <button
          onClick={onBack}
          aria-label="Back"
          className="rounded-lg p-1.5 text-subtle transition hover:bg-panel hover:text-ink"
        >
          <ChevronLeft size={18} />
        </button>
        <Avatar url={message.otherAvatar} name={message.otherName} size={28} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {message.outgoing ? `To ${message.otherName}` : message.otherName}
        </span>
        <button
          onClick={() => void archiveMessage(message.id, true)}
          aria-label="Archive"
          title="Archive"
          className="rounded-lg p-1.5 text-subtle transition hover:bg-panel hover:text-ink"
        >
          <Archive size={16} />
        </button>
        <button
          onClick={() => void deleteMessage(message.id)}
          aria-label="Delete"
          title="Delete"
          className="rounded-lg p-1.5 text-subtle transition hover:text-danger"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
          {message.body}
        </p>
        {message.gameTitle && (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink">
            <Gamepad2 size={13} className="text-accent" /> {message.gameTitle}
          </span>
        )}
        <p className="mt-2 text-[11px] text-subtle">{timeAgo(message.createdAt)}</p>
      </div>

      {/* Reply box (a reply goes to the other party in this conversation). */}
      <div className="border-t border-line p-3">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          maxLength={MESSAGE_MAX}
          placeholder={`Reply to ${message.otherName}…`}
          className="w-full resize-none rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition focus:border-brand/50"
        />
        {replyError && <p className="mt-1 text-[11px] text-danger">{replyError}</p>}
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => void onReply()}
            disabled={sending || !reply.trim() || replyError != null}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={15} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}

function Composer({
  toId,
  onDone,
  onCancel,
}: {
  toId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { friends, sendMessage } = useStore();
  const [recipient, setRecipient] = useState(toId ?? "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const bodyError = body.trim() ? validateMessageBody(body) : null;
  const canSend = recipient && body.trim() && !bodyError && !sending;

  async function onSend() {
    if (!recipient || validateMessageBody(body)) return;
    setSending(true);
    const ok = await sendMessage(recipient, body);
    setSending(false);
    if (ok) onDone();
  }

  return (
    <div className="flex h-full flex-col">
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

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          To
          <select
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-brand/50"
          >
            <option value="">Choose a friend…</option>
            {friends.map((f) => (
              <option key={f.id} value={f.id}>
                {f.displayName}
              </option>
            ))}
          </select>
        </label>
        {friends.length === 0 && (
          <p className="text-[11px] text-subtle">
            You can only message friends — add some from the Friends panel first.
          </p>
        )}

        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          Message
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MESSAGE_MAX}
            placeholder="Write a message…"
            className="min-h-32 flex-1 resize-none rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition focus:border-brand/50"
          />
        </label>
        {bodyError && <p className="text-[11px] text-danger">{bodyError}</p>}
      </div>

      <div className="flex justify-end border-t border-line p-3">
        <button
          onClick={() => void onSend()}
          disabled={!canSend}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={15} /> Send
        </button>
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
