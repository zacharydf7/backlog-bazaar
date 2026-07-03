import { useMemo, useState } from "react";
import {
  Trophy,
  Gamepad2,
  Store,
  ImagePlus,
  Trash2,
  Pencil,
  Check,
  X,
  Library,
  Palette,
  Medal,
  Flag,
} from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { TitleBadge } from "./TitleBadge";
import { CoinIcon } from "./CoinIcon";
import { StatusBadge } from "./StatusBadge";
import { isOnline, lastSeenLabel } from "../lib/presence";
import { formatPlaytime } from "../lib/playtime";
import { profileSummary } from "../lib/profileSummary";
import { platformSummary, PLATFORM_SEGMENTS, type PlatformStatusRow } from "../lib/platformSummary";
import { recentClears, RECENT_CLEARS_SHOWN, type RecentClear } from "../lib/recentActivity";
import { finishTagLabel } from "../lib/finishTags";
import { gameHash } from "../lib/route";
import { ACCENTS, resolveAccent, accentVars, BIO_MAX } from "../lib/accent";
import { ownedPlatforms } from "../lib/copies";
import { validateBannerFile } from "../lib/banner";
import { toast } from "../lib/toast";
import { BannerCropModal } from "./BannerCropModal";
import { PlatformBadge } from "./PlatformBadge";
import type { Badge, Game, GameStatus } from "../types";

// The data the hub renders, sourced from either the visited snapshot or your own
// live profile — so one component serves both the public page and your editable one.
interface HubProfile {
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  aboutMe: string | null;
  accent: string | null;
  coins: number;
  badges: Badge[];
  title: Badge | null;
  gamesFinished: number;
  hoursFinished: number;
  lastSeenAt: number | null;
  activity: string | null;
}

/** The player's public identity page: a banner + avatar + bio header (themed by a
 *  per-profile accent) over modular summaries of their Now Playing, Bazaar backlog
 *  and Finished games. Renders your own (editable) profile when not visiting, and a
 *  visited player's (read-only) one otherwise. Cover privacy is inherited: visitor
 *  game rows come from `player_library`, which already swaps non-friends' custom
 *  covers for the safe default and omits private games. */
export function ProfileHub({ onOpenTab }: { onOpenTab: (tab: GameStatus) => void }) {
  const viewing = useStore((s) => s.viewing);
  const cloud = useStore((s) => s.cloud);
  const games = useStore((s) => s.games);
  // Own-profile fields (used when not visiting).
  const displayName = useStore((s) => s.displayName);
  const avatarUrl = useStore((s) => s.avatarUrl);
  const bannerUrl = useStore((s) => s.bannerUrl);
  const aboutMe = useStore((s) => s.aboutMe);
  const accent = useStore((s) => s.accent);
  const coins = useStore((s) => s.coins);
  const myBadges = useStore((s) => s.myBadges);
  const selectedTitleId = useStore((s) => s.selectedTitleId);

  const visiting = viewing != null;
  const editable = !visiting && cloud;
  const library = visiting ? viewing.games : games;

  const profile: HubProfile = useMemo(() => {
    if (viewing) {
      return {
        displayName: viewing.displayName,
        avatarUrl: viewing.avatarUrl,
        bannerUrl: viewing.bannerUrl,
        aboutMe: viewing.aboutMe,
        accent: viewing.accent,
        coins: viewing.coins,
        badges: viewing.badges,
        title: viewing.title,
        gamesFinished: viewing.gamesFinished,
        hoursFinished: viewing.hoursFinished,
        lastSeenAt: viewing.lastSeenAt,
        activity: viewing.activity,
      };
    }
    const finished = games.filter((g) => g.status === "finished");
    return {
      displayName: displayName ?? "You",
      avatarUrl,
      bannerUrl,
      aboutMe,
      accent,
      coins,
      badges: myBadges,
      title: myBadges.find((b) => b.id === selectedTitleId) ?? null,
      gamesFinished: finished.length,
      hoursFinished: finished.reduce((sum, g) => sum + (g.hours ?? 0), 0),
      lastSeenAt: null,
      activity: null,
    };
  }, [viewing, games, displayName, avatarUrl, bannerUrl, aboutMe, accent, coins, myBadges, selectedTitleId]);

  const accentHex = resolveAccent(profile.accent);
  const nowPlaying = library.filter((g) => g.status === "playing");
  const finishedGames = library.filter((g) => g.status === "finished");
  const owned = useMemo(() => library.filter((g) => g.status !== "wishlist"), [library]);
  const summary = useMemo(() => profileSummary(owned), [owned]);
  const platforms = useMemo(() => platformSummary(library), [library]);
  const clears = useMemo(() => recentClears(library), [library]);
  const online = isOnline(profile.lastSeenAt);

  return (
    <div style={accentVars(accentHex)} className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {/* ── Header: banner, avatar, identity, bio ───────────────────────────── */}
      <section className="overflow-hidden rounded-3xl border border-line bg-surface">
        <BannerArea url={profile.bannerUrl} accentHex={accentHex} editable={editable} />
        <div className="flex flex-col gap-3 px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-3 sm:-mt-12">
            <div className="relative">
              <span className="inline-block rounded-full border-4 border-surface bg-surface">
                <Avatar url={profile.avatarUrl} name={profile.displayName} size={84} />
              </span>
              {editable && <AvatarEditButton />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-sm font-medium text-ink">
                <CoinIcon size={14} /> {profile.coins}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-sm text-muted">
                <Trophy size={14} className="text-accent" /> {profile.gamesFinished} finished
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl leading-tight text-ink sm:text-3xl">
              {profile.displayName}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {profile.title && <TitleBadge badge={profile.title} />}
              {visiting &&
                (online ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-success">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    {profile.activity ?? "Online"}
                  </span>
                ) : (
                  lastSeenLabel(profile.lastSeenAt) && (
                    <span className="text-xs text-subtle">{lastSeenLabel(profile.lastSeenAt)}</span>
                  )
                ))}
              {profile.hoursFinished > 0 && (
                <span className="text-xs text-subtle">
                  {formatPlaytime(profile.hoursFinished)} cleared
                </span>
              )}
            </div>
            {profile.badges.length > 1 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {profile.badges
                  .filter((b) => b.id !== profile.title?.id)
                  .map((b) => (
                    <TitleBadge key={b.id} badge={b} size="xs" />
                  ))}
              </div>
            )}
          </div>

          {/* About Me — read view, or an inline editor on your own profile. */}
          {editable ? (
            <BioEditor value={profile.aboutMe} />
          ) : profile.aboutMe ? (
            <p className="whitespace-pre-wrap break-words text-sm text-muted">{profile.aboutMe}</p>
          ) : null}

          {editable && <AccentPicker value={profile.accent} />}
        </div>
      </section>

      {/* ── Modules ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Module
          icon={Gamepad2}
          title="Now Playing"
          count={nowPlaying.length}
          onViewAll={() => onOpenTab("playing")}
        >
          {nowPlaying.length === 0 ? (
            <EmptyNote text={visiting ? "Nothing in play right now." : "You're not playing anything yet."} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {nowPlaying.slice(0, 6).map((g) => (
                <GameTile key={g.id} game={g} onClick={() => onOpenTab("playing")} />
              ))}
            </div>
          )}
        </Module>

        <Module icon={Medal} title="Recent Activity" count={clears.length} countLabel={clears.length === 1 ? "clear" : "clears"}>
          {clears.length === 0 ? (
            <EmptyNote
              text={visiting ? "No clears yet." : "Beat a game to start your trophy timeline."}
            />
          ) : (
            <RecentActivityFeed
              clears={clears}
              onOpen={(id) => {
                window.location.hash = gameHash(id, viewing?.userId);
              }}
            />
          )}
        </Module>

        <Module icon={Trophy} title="Finished" count={finishedGames.length} onViewAll={() => onOpenTab("finished")}>
          {finishedGames.length === 0 ? (
            <EmptyNote text={visiting ? "No finished games yet." : "Finish a game to fill your trophy room."} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {finishedGames.slice(0, 6).map((g) => (
                <GameTile key={g.id} game={g} onClick={() => onOpenTab("finished")} />
              ))}
            </div>
          )}
        </Module>

        <Module
          icon={Store}
          title="Bazaar"
          count={summary.byStatus.backlog}
          countLabel="in backlog"
          onViewAll={() => onOpenTab("backlog")}
          className="lg:col-span-2"
        >
          <div className="flex flex-wrap gap-2 text-sm">
            <Stat label="Owned" value={summary.total} icon={Library} />
            <Stat label="Backlog" value={summary.byStatus.backlog} icon={Store} />
            <Stat label="Playing" value={summary.byStatus.playing} icon={Gamepad2} />
            <Stat label="Finished" value={summary.byStatus.finished} icon={Trophy} />
          </div>
        </Module>

        <Module
          icon={Gamepad2}
          title="Platforms"
          count={platforms.length}
          className="lg:col-span-2"
        >
          {platforms.length === 0 ? (
            <EmptyNote
              text={visiting ? "No owned games yet." : "Add a game to see your shelves by platform."}
            />
          ) : (
            <PlatformBreakdown rows={platforms} />
          )}
        </Module>
      </div>
    </div>
  );
}

// ── Header pieces ───────────────────────────────────────────────────────────

function BannerArea({
  url,
  accentHex,
  editable,
}: {
  url: string | null;
  accentHex: string | null;
  editable: boolean;
}) {
  const { setBanner, removeBanner } = useStore();
  // A picked file waiting in the crop modal (drag/zoom before anything uploads).
  const [cropping, setCropping] = useState<File | null>(null);
  // A gentle accent→brand gradient when no banner is set, so the header never looks empty.
  const fallback = {
    backgroundImage: `linear-gradient(120deg, ${accentHex ?? "var(--brand)"}, var(--surface))`,
  };
  return (
    <div className="relative h-36 w-full bg-panel sm:h-52">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full opacity-40" style={fallback} />
      )}
      {editable && (
        <div className="absolute right-2 top-2 flex gap-1.5">
          <label
            title="Upload banner"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-black/70"
          >
            <ImagePlus size={14} /> <span className="hidden sm:inline">Banner</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  // Reject unusable files before the crop step; the store
                  // re-validates on save.
                  try {
                    validateBannerFile(f);
                    setCropping(f);
                  } catch (err) {
                    toast(err instanceof Error ? err.message : "Couldn't read that image.");
                  }
                }
                e.target.value = "";
              }}
            />
          </label>
          {url && (
            <button
              onClick={() => void removeBanner()}
              title="Remove banner"
              className="inline-flex items-center justify-center rounded-lg bg-black/50 px-2 py-1.5 text-white transition hover:bg-black/70 hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
      {cropping && (
        <BannerCropModal
          file={cropping}
          onCancel={() => setCropping(null)}
          onSave={(rect) => {
            setCropping(null);
            void setBanner(cropping, rect);
          }}
        />
      )}
    </div>
  );
}

function AvatarEditButton() {
  const { setAvatar } = useStore();
  return (
    <label
      title="Change profile picture"
      className="absolute -bottom-1 -right-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full border-2 border-surface bg-brand text-brand-fg transition hover:brightness-105"
    >
      <ImagePlus size={13} />
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void setAvatar(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function BioEditor({ value }: { value: string | null }) {
  const { setAboutMe } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <p className="flex-1 whitespace-pre-wrap break-words text-sm text-muted">
          {value || <span className="text-subtle">Add an “About Me” to introduce yourself.</span>}
        </p>
        <button
          onClick={() => {
            setDraft(value ?? "");
            setEditing(true);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-muted transition hover:text-accent"
        >
          <Pencil size={12} /> Edit
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        maxLength={BIO_MAX}
        placeholder="Gamer since '98. Grinding RPGs and clearing the backlog…"
        className="w-full resize-none rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-subtle">
          {draft.length}/{BIO_MAX}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(false)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition hover:text-ink"
          >
            <X size={12} /> Cancel
          </button>
          <button
            onClick={() => {
              void setAboutMe(draft);
              setEditing(false);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-brand-fg transition hover:brightness-105"
          >
            <Check size={12} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function AccentPicker({ value }: { value: string | null }) {
  const { setAccent } = useStore();
  const current = resolveAccent(value);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-subtle">
        <Palette size={13} className="text-accent" /> Accent
      </span>
      {ACCENTS.map((a) => (
        <button
          key={a.id}
          onClick={() => void setAccent(a.id)}
          title={a.name}
          aria-label={a.name}
          className={
            "h-6 w-6 rounded-full border-2 transition " +
            (current === a.hex ? "border-ink" : "border-transparent hover:border-line")
          }
          style={{ backgroundColor: a.hex }}
        />
      ))}
      <label
        title="Custom color"
        className="inline-flex h-6 cursor-pointer items-center rounded-full border border-line px-2 text-[11px] text-muted transition hover:text-accent"
      >
        Custom
        <input
          type="color"
          value={current ?? "#f59e0b"}
          onChange={(e) => void setAccent(e.target.value)}
          className="ml-1 h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
        />
      </label>
      {value && (
        <button
          onClick={() => void setAccent(null)}
          className="text-[11px] text-subtle underline-offset-2 transition hover:text-ink hover:underline"
        >
          Reset
        </button>
      )}
    </div>
  );
}

// ── Module + tiles ──────────────────────────────────────────────────────────

function Module({
  icon: Icon,
  title,
  count,
  countLabel,
  onViewAll,
  className = "",
  children,
}: {
  icon: typeof Trophy;
  title: string;
  count: number;
  countLabel?: string;
  /** Omit for modules whose whole content already lives on this page. */
  onViewAll?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={"flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 " + className}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
          <Icon size={17} className="text-accent" /> {title}
          <span className="text-sm font-normal text-subtle">
            {count}
            {countLabel ? ` ${countLabel}` : ""}
          </span>
        </h2>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="shrink-0 text-xs font-medium text-accent underline-offset-2 transition hover:underline"
          >
            View all
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

// ── Recent activity ─────────────────────────────────────────────────────────

/** The latest Beaten/Completed clears, newest first: five by default with a
 *  show-all expander. A Completed run gets the premium gold (brand) card; a
 *  standard Beaten clear stays on the quiet silver panel. */
function RecentActivityFeed({
  clears,
  onOpen,
}: {
  clears: RecentClear[];
  onOpen: (gameId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? clears : clears.slice(0, RECENT_CLEARS_SHOWN);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {visible.map((c) => (
          <li key={c.game.id}>
            <ClearRow clear={c} onOpen={() => onOpen(c.game.id)} />
          </li>
        ))}
      </ul>
      {clears.length > RECENT_CLEARS_SHOWN && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="self-start text-xs font-medium text-accent underline-offset-2 transition hover:underline"
        >
          {showAll ? `Show recent ${RECENT_CLEARS_SHOWN}` : `Show all ${clears.length}`}
        </button>
      )}
    </div>
  );
}

function ClearRow({ clear, onOpen }: { clear: RecentClear; onOpen: () => void }) {
  const g = clear.game;
  const completed = clear.tag === "completed";
  const platform = ownedPlatforms(g.copies)[0];
  const date = new Date(clear.finishedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <button
      onClick={onOpen}
      title={g.title}
      className={
        "flex w-full items-center gap-3 rounded-xl border p-2 text-left transition hover:-translate-y-0.5 hover:shadow-md " +
        (completed ? "border-brand/50 bg-brand/10" : "border-line bg-panel")
      }
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface">
        {g.image ? (
          <img src={g.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-lg opacity-50">🎮</div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium text-ink">{g.title}</span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={
              "inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] " +
              (completed
                ? "border-brand/50 bg-brand/15 text-brand"
                : "border-line bg-surface text-muted")
            }
          >
            {completed ? <Trophy size={11} className="shrink-0" /> : <Flag size={11} className="shrink-0" />}
            {finishTagLabel(clear.tag)}
          </span>
          {platform && <PlatformBadge label={platform} />}
          <span className="text-[11px] text-subtle">
            {date}
            {(g.playedHours ?? 0) > 0 ? ` · ${formatPlaytime(g.playedHours ?? 0)}` : ""}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Platform breakdown ──────────────────────────────────────────────────────

/** Per-platform shelves: a color legend, then one segmented bar per platform
 *  showing how much of that shelf is still in the Bazaar vs. playing vs.
 *  cleared (and how). A fully-finished shelf gets the 100% treatment. */
function PlatformBreakdown({ rows }: { rows: PlatformStatusRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {PLATFORM_SEGMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-subtle">
            <span className={"h-2 w-2 rounded-full " + s.barClass} /> {s.label}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.platform} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="min-w-0 truncate text-sm font-medium text-ink">{row.platform}</span>
              {row.allFinished ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                  <Check size={13} /> 100% cleared
                </span>
              ) : (
                <span className="text-xs text-subtle">
                  {row.beaten + row.completed + row.endless}/{row.total} cleared
                </span>
              )}
            </div>
            <div
              className={
                "flex h-2.5 w-full overflow-hidden rounded-full bg-panel " +
                (row.allFinished ? "ring-1 ring-success/60" : "")
              }
            >
              {PLATFORM_SEGMENTS.map((s) =>
                row[s.key] > 0 ? (
                  <div
                    key={s.key}
                    className={s.barClass}
                    style={{ width: `${(row[s.key] / row.total) * 100}%` }}
                    title={`${row[s.key]} ${lowerLabel(s.label)}`}
                  />
                ) : null,
              )}
            </div>
            <span className="text-[11px] text-subtle">
              {PLATFORM_SEGMENTS.filter((s) => row[s.key] > 0)
                .map((s) => `${row[s.key]} ${lowerLabel(s.label)}`)
                .concat(`${row.total} total`)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function lowerLabel(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function GameTile({ game, onClick }: { game: Game; onClick: () => void }) {
  // Render whatever cover the server sent. player_library already swaps custom
  // covers to the catalog default for non-friends, so a custom URL reaching a
  // visitor means they're a friend who's allowed to see it — the boards and
  // ledger show it, and hiding it only here left friends' shelves blank.
  const showCover = Boolean(game.image);
  const platforms = ownedPlatforms(game.copies);
  return (
    <button
      onClick={onClick}
      title={game.title}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-panel text-left transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-[16/10] w-full bg-surface">
        {showCover ? (
          <img src={game.image} alt={game.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl opacity-50">🎮</div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-2">
        <span className="truncate text-xs font-medium text-ink">{game.title}</span>
        <div className="flex items-center justify-between gap-1">
          <StatusBadge status={game.status} />
          {platforms[0] && <PlatformBadge label={platforms[0]} className="min-w-0" />}
        </div>
      </div>
    </button>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Trophy }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-panel px-2.5 py-1.5 text-muted">
      <Icon size={13} className="text-accent/70" />
      <span className="font-semibold text-ink">{value}</span> {label}
    </span>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-line bg-panel/40 p-4 text-center text-sm text-subtle">{text}</p>;
}
