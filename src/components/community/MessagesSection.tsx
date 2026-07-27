import { MessagesPanel } from "../MessagesPanel";

/** The Messages section: the chat inbox mounted as a page. The panel manages
 *  its own list → thread panes and scrolls internally, so it gets a viewport-
 *  bounded card here — a long thread must scroll inside the card, not grow the
 *  page (the reply box stays in reach). `--chrome-h` tracks the live header
 *  height on both breakpoints; the remaining offset covers the page heading,
 *  tab bar, and paddings. */
export function MessagesSection({
  compose,
}: {
  compose: { id: string; name: string } | null;
}) {
  return (
    <div
      className="flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface"
      style={{ height: "calc(100dvh - var(--chrome-h) - 15rem)" }}
    >
      <MessagesPanel key={compose ? compose.id : "list"} initialCompose={compose} />
    </div>
  );
}
