import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { X } from "lucide-react";
import { useToasts } from "../lib/toast";

/** How far (px) or how fast (px/s) a horizontal fling must travel to count as
 *  a swipe-away rather than a stray touch. */
const SWIPE_DISMISS_OFFSET = 80;
const SWIPE_DISMISS_VELOCITY = 600;

/** Shared swipe-to-dismiss gesture: the toast can be dragged sideways and
 *  springs back unless flung past the threshold. Constraints pin the resting
 *  position so only a deliberate fling dismisses. */
function swipeProps(onDismiss: () => void) {
  return {
    drag: "x" as const,
    dragConstraints: { left: 0, right: 0 },
    dragElastic: 0.6,
    onDragEnd: (_e: unknown, info: PanInfo) => {
      if (
        Math.abs(info.offset.x) > SWIPE_DISMISS_OFFSET ||
        Math.abs(info.velocity.x) > SWIPE_DISMISS_VELOCITY
      ) {
        onDismiss();
      }
    },
  };
}

export function Toasts() {
  const { toasts, dismiss } = useToasts();

  return (
    // bottom-20 on phones keeps the stack clear of the fixed bottom tab bar
    // (same clearance as the Add FAB); the bar is md:hidden, so md+ returns to
    // the compact bottom-4.
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-4">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = t.icon;
          // A toast carrying an action (e.g. Undo) shows the message, the action
          // button, and an explicit ✕ so it's clear it can be waved off without
          // undoing, plus a thin countdown bar so the window is visible. A plain
          // toast stays a single tap-to-dismiss button. Both swipe away sideways.
          if (t.action) {
            const action = t.action;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
                {...swipeProps(() => dismiss(t.id))}
                className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
              >
                <div className="flex items-center gap-2 px-4 py-2 text-sm text-ink">
                  {Icon && <Icon size={16} className="shrink-0 text-accent" />}
                  <button onClick={() => dismiss(t.id)} className="flex-1 text-left">
                    {t.message}
                  </button>
                  <button
                    onClick={() => {
                      action.onAction();
                      dismiss(t.id);
                    }}
                    className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-brand-fg transition hover:brightness-105 active:brightness-95"
                  >
                    {action.label}
                  </button>
                  <button
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss"
                    className="shrink-0 rounded-lg p-1 text-subtle transition hover:text-ink"
                  >
                    <X size={14} />
                  </button>
                </div>
                {/* Countdown bar shrinking over the toast's lifetime. */}
                <motion.div
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: t.durationMs / 1000, ease: "linear" }}
                  className="h-0.5 origin-left bg-brand/50"
                />
              </motion.div>
            );
          }
          return (
            <motion.button
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              {...swipeProps(() => dismiss(t.id))}
              onClick={() => dismiss(t.id)}
              className="pointer-events-auto flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm text-ink shadow-lg"
            >
              {Icon && <Icon size={16} className="text-accent" />}
              <span>{t.message}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
