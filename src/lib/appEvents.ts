// The app usage log's client side (see app_events in supabase/schema.sql):
// how people use the app — screens, features, searches, notifications,
// onboarding steps, errors. Events queue in memory and go to the server in
// small batches (log_app_events) every few seconds and when the tab is hidden.
// Nothing is sent until the signed-in app starts it, so offline/guest mode and
// the test suite log nothing. Logging must never get in the player's way: a
// failed send is dropped silently.

export type AppEventKind =
  | "visit"
  | "screen"
  | "feature"
  | "search"
  | "notification"
  | "onboarding"
  | "error";

export interface AppEvent {
  kind: AppEventKind;
  name: string;
  detail?: Record<string, unknown>;
  session: string;
}

type Sender = (events: AppEvent[]) => Promise<unknown>;

const MAX_BATCH = 50;
const FLUSH_MS = 10_000;

let send: Sender | null = null;
let queue: AppEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let session = "";
let lastScreen = "";
const cleanups: (() => void)[] = [];

/** Phone, tablet or desktop, from the viewport width. */
export function deviceClass(width: number): "phone" | "tablet" | "desktop" {
  return width < 640 ? "phone" : width < 1024 ? "tablet" : "desktop";
}

/** Record one event (a no-op until logging has started). */
export function trackEvent(kind: AppEventKind, name: string, detail?: Record<string, unknown>): void {
  if (!send) return;
  queue.push({ kind, name, detail, session });
  if (queue.length >= MAX_BATCH) void flushAppEvents();
}

/** Record a screen view, skipping a repeat of the screen already showing. */
export function trackScreen(name: string, detail?: Record<string, unknown>): void {
  if (name === lastScreen) return;
  lastScreen = name;
  trackEvent("screen", name, detail);
}

/** Send whatever is queued. */
export async function flushAppEvents(): Promise<void> {
  if (!send || queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    await send(batch);
  } catch {
    // Usage logging is best-effort; a lost batch never surfaces to the player.
  }
}

/** Start logging for a signed-in session: a visit event now, a flush every few
 *  seconds and whenever the tab is hidden, and uncaught errors as error
 *  events. Returns the stop function. */
export function startAppEvents(sender: Sender, opts: { version?: string } = {}): () => void {
  stopAppEvents();
  send = sender;
  session = Math.random().toString(36).slice(2, 12);
  lastScreen = "";
  const w = typeof window !== "undefined" ? window.innerWidth : 0;
  const h = typeof window !== "undefined" ? window.innerHeight : 0;
  trackEvent("visit", deviceClass(w), { width: w, height: h, version: opts.version ?? null });
  timer = setInterval(() => void flushAppEvents(), FLUSH_MS);
  if (typeof window !== "undefined") {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushAppEvents();
    };
    const onError = (e: ErrorEvent) =>
      trackEvent("error", String(e.message || "Script error").slice(0, 200), {
        source: e.filename ? String(e.filename).split("/").pop() : null,
        line: e.lineno ?? null,
      });
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
      trackEvent("error", reason.slice(0, 200), { source: "promise" });
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    cleanups.push(
      () => document.removeEventListener("visibilitychange", onHide),
      () => window.removeEventListener("error", onError),
      () => window.removeEventListener("unhandledrejection", onRejection),
    );
  }
  return stopAppEvents;
}

/** Stop logging (sign-out), sending what's left first. */
export function stopAppEvents(): void {
  if (send && queue.length) void flushAppEvents();
  if (timer) clearInterval(timer);
  timer = null;
  while (cleanups.length) cleanups.pop()!();
  send = null;
  queue = [];
}
