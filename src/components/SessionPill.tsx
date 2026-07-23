import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Timer, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { useNow } from "../lib/useNow";
import { parsePlaytime, formatPlaytime } from "../lib/playtime";
import {
  SESSION_CAP_HOURS,
  clampTrim,
  formatElapsed,
  isLongRunning,
  loggableHours,
  logsAnything,
} from "../lib/playSessions";

/**
 * The app-wide face of the play-session stopwatch (soft launch): a floating
 * pill with the live elapsed time while a session runs — visible on every
 * screen, since the point of the stopwatch is that you left the app — plus the
 * stop dialog it opens. The dialog previews exactly what a stop will log
 * (mirroring the server's trim/cap rules) and lets you trim AFK time down
 * before committing, or discard the session outright.
 *
 * Deliberately NOT gated on the soft-launch permission: starting is, but a
 * session already running must always be stoppable, even if the key was
 * revoked mid-session.
 */
export function SessionPill() {
  const { activeSession, sessionStopOpen, openSessionStop } = useStore();
  const now = useNow(activeSession != null);
  if (!activeSession) return null;

  const longRunning = isLongRunning(activeSession.startedAt, now);
  return (
    <>
      {/* bottom-20 on phones clears the fixed bottom tab bar (and sits opposite
          the bottom-right FAB); md+ tucks into the bottom-right corner. */}
      <button
        onClick={() => openSessionStop()}
        title={`Stopwatch running on ${activeSession.gameTitle} — tap to stop`}
        className="fixed bottom-20 left-4 z-40 inline-flex max-w-[70vw] items-center gap-2 rounded-full border border-line bg-surface/95 py-2 pl-3 pr-4 text-sm shadow-xl backdrop-blur transition hover:border-brand md:bottom-4 md:left-auto md:right-4"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
        </span>
        <Timer size={15} className="shrink-0 text-accent" />
        <span className="truncate text-muted">{activeSession.gameTitle}</span>
        <span className="font-semibold tabular-nums text-ink">
          {formatElapsed(activeSession.startedAt, now)}
        </span>
        {longRunning && <span className="shrink-0 text-xs text-danger">still playing?</span>}
      </button>
      {sessionStopOpen && <StopDialog />}
    </>
  );
}

/** The stop confirm: live elapsed readout, a trim box (down only — the server
 *  refuses to inflate), and Log / Discard. Rendered only while a session is
 *  active and the store's sessionStopOpen flag is set. */
function StopDialog() {
  const { activeSession, closeSessionStop, endPlaySession, discardPlaySession } = useStore();
  useScrollLock(true);
  const now = useNow(true);
  // "" = untrimmed: log the full elapsed time (the server recomputes it at
  // commit, so the seconds that pass while this dialog is open still count).
  const [trim, setTrim] = useState("");
  const [busy, setBusy] = useState(false);

  // The session can vanish underneath the dialog (stopped from another device).
  const startedAt = activeSession?.startedAt ?? 0;
  useEffect(() => {
    if (!activeSession) closeSessionStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession == null]);
  if (!activeSession) return null;

  const full = loggableHours(startedAt, now);
  const trimmed = trim.trim() === "" ? null : parsePlaytime(trim);
  const invalidTrim = trim.trim() !== "" && trimmed == null;
  const willLog = trimmed == null ? full : clampTrim(trimmed, startedAt, now);
  const capped = loggableHours(startedAt, now) >= SESSION_CAP_HOURS;

  const submit = async (discard: boolean) => {
    if (busy) return;
    setBusy(true);
    if (discard) await discardPlaySession();
    else await endPlaySession(trimmed == null ? null : willLog);
    setBusy(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={closeSessionStop}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-subtle">
          <Timer size={15} className="text-accent" /> Stop session
        </div>
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{activeSession.gameTitle}</span> has been running
          for{" "}
          <span className="font-semibold tabular-nums text-ink">
            {formatElapsed(startedAt, now)}
          </span>
          .
        </p>
        <label className="mt-3 block text-[11px] text-muted">
          Time to log — trim it down if you stepped away (it can only go down)
          <input
            type="text"
            value={trim}
            onChange={(e) => setTrim(e.target.value)}
            placeholder={formatPlaytime(full)}
            aria-label="Time to log"
            className="mt-1 w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
          />
        </label>
        {invalidTrim && (
          <p className="mt-1 text-[11px] text-danger">
            Try formats like “1h 30m”, “90m”, or “2.75”.
          </p>
        )}
        {capped && (
          <p className="mt-1 text-[11px] text-danger">
            A single session logs at most {SESSION_CAP_HOURS}h — trim this one to what you really
            played.
          </p>
        )}
        {!logsAnything(willLog) && !invalidTrim && (
          <p className="mt-1 text-[11px] text-subtle">
            Under a minute — stopping now logs nothing.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void submit(false)}
            disabled={busy || invalidTrim}
            className="flex-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {logsAnything(willLog) ? `Log ${formatPlaytime(willLog)}` : "Stop"}
          </button>
          <button
            onClick={closeSessionStop}
            className="flex-1 rounded-xl border border-line px-3 py-2 text-sm text-muted transition hover:bg-panel hover:text-ink"
          >
            Keep playing
          </button>
        </div>
        <button
          onClick={() => void submit(true)}
          disabled={busy}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 text-xs text-subtle transition hover:text-danger disabled:opacity-50"
        >
          <Trash2 size={13} /> Discard session — log nothing
        </button>
      </div>
    </div>,
    document.body,
  );
}
