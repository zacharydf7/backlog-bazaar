import { initials } from "../lib/avatar";
import { resolveFrameStyle } from "../lib/shopCosmetics";

/** A round user avatar: the uploaded picture, or initials on a brand-tinted disc.
 *  `frame` is a Curio Shop frame style key — when it resolves, the avatar is
 *  wrapped in that decorative ring; unknown/null keys render exactly as before. */
export function Avatar({
  url,
  name,
  size = 32,
  className = "",
  frame = null,
}: {
  url?: string | null;
  name: string;
  size?: number;
  className?: string;
  frame?: string | null;
}) {
  const frameStyle = resolveFrameStyle(frame);
  const style = { width: size, height: size };
  const core = url ? (
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      style={style}
      className={"shrink-0 rounded-full bg-panel object-cover " + (frameStyle ? "" : className)}
    />
  ) : (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.round(size * 0.4) }}
      className={
        "inline-grid shrink-0 place-items-center rounded-full bg-brand/15 font-semibold leading-none text-accent " +
        (frameStyle ? "" : className)
      }
    >
      {initials(name)}
    </span>
  );
  if (!frameStyle) return core;
  // The ring scales with the avatar so a big profile header gets a proportionate
  // frame while tiny list avatars stay subtle.
  const ring = Math.max(2, Math.round(size / 16));
  return (
    <span
      data-frame={frame}
      style={{ padding: ring }}
      className={"inline-flex shrink-0 rounded-full " + frameStyle.className + " " + className}
    >
      {core}
    </span>
  );
}
