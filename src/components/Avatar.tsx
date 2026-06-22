import { initials } from "../lib/avatar";

/** A round user avatar: the uploaded picture, or initials on a brand-tinted disc. */
export function Avatar({
  url,
  name,
  size = 32,
  className = "",
}: {
  url?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        style={style}
        className={"shrink-0 rounded-full bg-panel object-cover " + className}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.round(size * 0.4) }}
      className={
        "inline-grid shrink-0 place-items-center rounded-full bg-brand/15 font-semibold leading-none text-accent " +
        className
      }
    >
      {initials(name)}
    </span>
  );
}
