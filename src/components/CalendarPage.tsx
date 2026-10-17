import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import { useStore } from "../store";
import { useNow } from "../lib/useNow";
import {
  agenda,
  itemWhenLabel,
  monthGrid,
  personalItems,
  resetItems,
  type CalendarItem,
  type CalendarKind,
} from "../lib/calendar";

const DAY = 86_400_000;

// Theme-token colors per kind: the card on the agenda/day list, and the pill
// in a month-grid cell.
const KIND_META: Record<CalendarKind, { label: string; card: string; pill: string }> = {
  event: { label: "Coin event", card: "border-success/50 bg-success/10", pill: "bg-success/20 text-success" },
  holiday: { label: "Event", card: "border-accent/40 bg-accent/10", pill: "bg-accent/20 text-accent" },
  challenge: { label: "Challenge", card: "border-brand/40 bg-brand/10", pill: "bg-brand/20 text-ink" },
  reset: { label: "Goals", card: "border-line bg-panel", pill: "bg-line text-muted" },
  preorder: { label: "Your pre-order", card: "border-dashed border-line bg-surface", pill: "border border-dashed border-line text-muted" },
  renewal: { label: "Your renewal", card: "border-dashed border-line bg-surface", pill: "border border-dashed border-line text-muted" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** One calendar entry: what it is, when, the details and how to get ready. */
function ItemCard({ item }: { item: CalendarItem }) {
  const meta = KIND_META[item.kind];
  return (
    <div className={"rounded-xl border p-3 " + meta.card + (item.forYou ? "" : " opacity-70")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm font-semibold text-ink">{item.title}</p>
        <span className="text-xs text-subtle">{itemWhenLabel(item)}</span>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
        {meta.label}
        {!item.forYou && " · doesn't fit your games"}
      </p>
      {item.detail.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {item.detail.map((d) => (
            <li key={d} className="text-xs text-muted">
              {d}
            </li>
          ))}
        </ul>
      )}
      {item.prep && (
        <p className="mt-1.5 inline-flex items-start gap-1 text-xs font-medium text-ink">
          <Lightbulb size={13} className="mt-0.5 shrink-0 text-accent" /> Get ready: {item.prep}
        </p>
      )}
    </div>
  );
}

/** The calendar page: coin events (the monthly schedule, specials, holidays),
 *  seasonal challenges, goal resets and your own pre-orders and renewals. An
 *  agenda on phones, a month grid on bigger screens. */
export function CalendarPage() {
  const fetchCalendar = useStore((s) => s.fetchCalendar);
  const games = useStore((s) => s.games);
  const subscriptions = useStore((s) => s.subscriptions);
  const resetCfg = useStore((s) => s.rotationReset);
  const economyOn = useStore((s) => s.economyEnabled);
  const now = useNow(true, 60_000);

  const today = new Date(now);
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime());
  const [feed, setFeed] = useState<CalendarItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  // The window covers both the month grid on show and the agenda's next 60
  // days; it moves when the month changes or the day rolls over.
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const range = useMemo(() => {
    const gridStart = new Date(month.year, month.month, 1 - new Date(month.year, month.month, 1).getDay()).getTime();
    const gridEnd = gridStart + 42 * DAY;
    return { from: Math.min(gridStart, dayStart - DAY), to: Math.max(gridEnd, dayStart + 61 * DAY) };
  }, [month, dayStart]);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    void fetchCalendar(range.from, range.to).then((items) => {
      if (!alive) return;
      if (items == null) setFailed(true);
      else setFeed(items);
    });
    return () => {
      alive = false;
    };
  }, [fetchCalendar, range]);

  const items = useMemo(() => {
    const site = (feed ?? []).filter((i) => economyOn || i.kind !== "event");
    return [
      ...site,
      ...resetItems(range.from, range.to, resetCfg),
      ...personalItems(games, subscriptions, range.from, range.to),
    ];
  }, [feed, economyOn, range, resetCfg, games, subscriptions]);

  const weeks = monthGrid(month.year, month.month, items);
  const sections = agenda(items, now);
  const dayItems = weeks.flat().find((d) => d.date === selected)?.items ?? [];
  const monthLabel = new Date(month.year, month.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const step = (n: number) =>
    setMonth((m) => {
      const d = new Date(m.year, m.month + n, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <CalendarDays size={18} className="text-accent" /> Calendar
        </h2>
        <p className="text-sm text-muted">What&apos;s on and what&apos;s coming, so you can get ready.</p>
      </div>

      {failed && <p className="text-sm text-danger">The calendar couldn&apos;t load. Try again in a moment.</p>}

      {/* Phones: an agenda. */}
      <div className="flex flex-col gap-4 sm:hidden">
        {feed == null && !failed ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : sections.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
            Nothing on the calendar yet.
          </p>
        ) : (
          sections.map((s) => (
            <section key={s.label} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">{s.label}</h3>
              {s.items.map((i) => (
                <ItemCard key={i.key} item={i} />
              ))}
            </section>
          ))
        )}
      </div>

      {/* Bigger screens: the month, with the picked day's details below. */}
      <div className="hidden flex-col gap-3 sm:flex">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg text-ink">{monthLabel}</h3>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => step(-1)}
              className="rounded-lg border border-line p-1.5 text-ink transition hover:bg-panel"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setMonth({ year: today.getFullYear(), month: today.getMonth() });
                setSelected(new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime());
              }}
              className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-panel"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => step(1)}
              className="rounded-lg border border-line p-1.5 text-ink transition hover:bg-panel"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-line bg-surface" role="grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="border-b border-line px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-subtle">
              {w}
            </div>
          ))}
          {weeks.flat().map((d) => {
            const isToday = new Date(d.date).toDateString() === today.toDateString();
            const isSelected = d.date === selected;
            return (
              <button
                key={d.date}
                type="button"
                role="gridcell"
                aria-selected={isSelected}
                aria-label={new Date(d.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                onClick={() => setSelected(d.date)}
                className={
                  "flex min-h-24 flex-col gap-1 border-b border-r border-line p-1.5 text-left transition hover:bg-panel " +
                  (d.inMonth ? "" : "bg-canvas/40 ") +
                  (isSelected ? "ring-2 ring-inset ring-brand" : "")
                }
              >
                <span
                  className={
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs " +
                    (isToday ? "bg-brand font-semibold text-brand-fg" : d.inMonth ? "text-ink" : "text-subtle")
                  }
                >
                  {new Date(d.date).getDate()}
                </span>
                {d.items.slice(0, 3).map((i) => (
                  <span key={i.key} className={"truncate rounded px-1.5 py-0.5 text-[11px] " + KIND_META[i.kind].pill}>
                    {i.title}
                  </span>
                ))}
                {d.items.length > 3 && <span className="text-[11px] text-subtle">+{d.items.length - 3} more</span>}
              </button>
            );
          })}
        </div>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">
            {new Date(selected).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </h3>
          {dayItems.length === 0 ? (
            <p className="text-sm text-muted">Nothing on this day.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {dayItems.map((i) => (
                <ItemCard key={i.key} item={i} />
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="text-xs text-subtle">
        Times are in your timezone. Daily goals reset every day at {resetCfg.resetHour === 0 ? "midnight" : `${resetCfg.resetHour}:00`}{" "}
        {resetCfg.resetTz === "America/New_York" ? "Eastern" : resetCfg.resetTz}.
      </p>
    </div>
  );
}
