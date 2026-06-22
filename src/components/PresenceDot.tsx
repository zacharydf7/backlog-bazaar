import { Avatar } from "./Avatar";

/** A green "online" dot. Rendered as a ring-bordered circle so it reads on any
 *  avatar. Nothing shows when `online` is false. */
export function PresenceDot({ online, className = "" }: { online: boolean; className?: string }) {
  if (!online) return null;
  return (
    <span
      title="Online now"
      aria-label="Online now"
      className={
        "h-3 w-3 rounded-full border-2 border-surface bg-success " + className
      }
    />
  );
}

/** An avatar with an online dot tucked into its bottom-right corner. */
export function AvatarWithPresence({
  url,
  name,
  size,
  online,
}: {
  url: string | null;
  name: string;
  size: number;
  online: boolean;
}) {
  return (
    <span className="relative inline-block shrink-0">
      <Avatar url={url} name={name} size={size} />
      {online && (
        <PresenceDot online className="absolute bottom-0 right-0 ring-2 ring-surface" />
      )}
    </span>
  );
}
