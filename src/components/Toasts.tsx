import { AnimatePresence, motion } from "motion/react";
import { useToasts } from "../lib/toast";

export function Toasts() {
  const { toasts, dismiss } = useToasts();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm text-ink shadow-lg"
          >
            {t.icon && <span className="text-base">{t.icon}</span>}
            <span>{t.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
