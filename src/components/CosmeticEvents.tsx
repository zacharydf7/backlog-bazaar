import { useEffect, useState } from "react";
import { useStore } from "../store";
import { supabase } from "../lib/supabase";
import {
  eventPhase,
  eventWindowLabel,
  type CosmeticEvent,
} from "../lib/cosmeticEvents";
import { ConfirmDialog } from "./ConfirmDialog";

export function CosmeticEvents({ admin = false }: { admin?: boolean }) {
  const userId = useStore((s) => s.userId);
  const cloud = useStore((s) => s.cloud);
  const allowed = useStore(
    (s) => s.can("shop.manage") && s.can("cosmetics.events.manage"),
  );
  return cloud && userId && (!admin || allowed) ? (
    <EventList key={`${userId}:${admin}`} admin={admin} />
  ) : null;
}
function EventList({ admin }: { admin: boolean }) {
  const [events, setEvents] = useState<CosmeticEvent[]>([]);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [confirm, setConfirm] = useState<CosmeticEvent | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;
    setBusy(true);
    void Promise.all([
      client.from("cosmetic_events").select("*").order("starts_at"),
      client.from("shop_items").select("*"),
    ])
      .then(([eventRows, itemRows]) => {
        if (cancelled) return;
        if (eventRows.error || itemRows.error)
          setError(
            eventRows.error?.message ??
              itemRows.error?.message ??
              "Could not load events",
          );
        else {
          setEvents(
            (eventRows.data as CosmeticEvent[]).filter(
              (event) => admin || event.enabled,
            ),
          );
          setItems(itemRows.data ?? []);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load cosmetic events.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision, admin]);
  const toggle = async (event: CosmeticEvent) => {
    if (!supabase) return;
    const userId = useStore.getState().userId;
    setConfirm(null);
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_cosmetic_event_enabled", {
        p_key: event.key,
        p_enabled: !event.enabled,
        p_expected_item:
          items.find((item) => item.id === event.item_id) ?? null,
      });
      if (useStore.getState().userId !== userId) return;
      if (error) setError(error.message);
      else setRevision((value) => value + 1);
    } catch {
      setError("Event update failed. Reload to check its current state.");
    } finally {
      setBusy(false);
    }
  };
  if (!admin && !events.length) return null;
  return (
    <section
      aria-label={admin ? "Cosmetic event management" : "Cosmetic events"}
      className="flex min-w-0 flex-col gap-3"
    >
      {admin && (
        <h2 className="font-display text-xl text-ink">Seasonal rewards</h2>
      )}
      {admin && error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {events.map((event) => {
        const item = items.find((item) => item.id === event.item_id);
        return (
          <article
            key={event.key}
            className="rounded-2xl border border-line bg-surface p-4 text-ink"
          >
            <h3 className="font-display text-lg">{event.name}</h3>
            <p className="mt-2 text-sm text-muted">{eventWindowLabel(event)}</p>
            <p className="mt-2 text-sm">
              {eventPhase(event) === "ended"
                ? "The earning window has ended."
                : `Visit while signed in during this window to automatically earn ${String(item?.name ?? "the event cosmetic")}. Existing signed-in sessions count.`}
            </p>
            <p className="mt-2 text-sm text-muted">
              After the window, players who missed it can buy the cosmetic for{" "}
              {event.afterward_price.toLocaleString()} coins when the shop is
              open. Earned items stay yours.
            </p>
            {admin && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span>
                  {event.enabled
                    ? "Enabled"
                    : event.activated_at
                      ? "Paused"
                      : "Draft · inactive"}
                </span>
                <button
                  disabled={busy}
                  className="min-h-11 rounded-xl bg-brand px-4 py-2 text-brand-fg disabled:opacity-40"
                  onClick={() => setConfirm(event)}
                >
                  {event.enabled
                    ? "Pause event"
                    : event.activated_at
                      ? "Resume event"
                      : "Activate event"}
                </button>
              </div>
            )}
          </article>
        );
      })}
      {admin && (
        <button
          disabled={busy}
          className="min-h-11 self-start rounded-xl border border-line px-4 py-2 text-ink"
          onClick={() => setRevision((value) => value + 1)}
        >
          Reload events
        </button>
      )}
      {confirm && (
        <ConfirmDialog
          title={
            confirm.enabled
              ? "Pause seasonal rewards?"
              : "Activate seasonal rewards?"
          }
          body={
            confirm.enabled
              ? "New participation grants will pause. Existing ownership and the later shop listing remain intact."
              : `This enables automatic visit rewards during the displayed window. First activation also schedules the cosmetic for sale after the window at ${confirm.afterward_price.toLocaleString()} coins. It does not open the shop.`
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            void toggle(confirm);
          }}
        />
      )}
    </section>
  );
}
