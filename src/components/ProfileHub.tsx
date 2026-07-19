import { useEffect, useMemo, useState } from "react";
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
  Play,
  Archive,
  Undo2,
  ThumbsUp,
  ListOrdered,
  RotateCcw,
  Target,
  Infinity as InfinityIcon,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { TitleBadge } from "./TitleBadge";
import { CoinIcon } from "./CoinIcon";
import { isOnline, lastSeenLabel } from "../lib/presence";
import { visibleLibrary } from "../lib/families";
import { formatPlaytime } from "../lib/playtime";
import { profileSummary } from "../lib/profileSummary";
import { platformSummary, PLATFORM_SEGMENTS, type PlatformStatusRow } from "../lib/platformSummary";
import {
  localActivityFallback,
  activityTone,
  RECENT_ACTIVITY_SHOWN,
  type ProfileActivity,
} from "../lib/profileActivity";
import { milestoneLabel, type MilestoneKind } from "../lib/milestones";
import { laneOf, type Lane } from "../lib/slots";
import { isInRotation } from "../lib/status";
import { displayMedals, earnedSummary } from "../lib/achievements";
import { AchievementMedallion } from "./AchievementsPage";
import { gameHash, listHash } from "../lib/route";
import type { GameListSummary } from "../lib/gameLists";
import { VisibilityBadge } from "./lists/VisibilityBadge";
import { resolveAccent, BIO_MAX } from "../lib/accent";
import { resolveStallStyle } from "../lib/shopCosmetics";
import { StallOrnament } from "./CosmeticOrnaments";
import { isCoinVariant } from "../lib/coins";
import { matchPreset, profileColorVars } from "../lib/profileColors";
import { ProfileColorsModal } from "./ProfileColorsModal";
import { validateBannerFile } from "../lib/banner";
import { toast } from "../lib/toast";
import { BannerCropModal } from "./BannerCropModal";
import type { Achievement, Badge, Cosmetics, Game, GameStatus } from "../types";

// The data the hub renders, sourced from either the visited snapshot or your own
// live profile — so one component serves both the public page and your editable one.
interface HubProfile {
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  aboutMe: string | null;
  accent: string | null;
  bg: string | null;
  coins: number;
  badges: Badge[];
  title: Badge | null;
  gamesFinished: number;
  hoursFinished: number;
  lastSeenAt: number | null;
  activity: string | null;
  cosmetics: Cosmetics; // equipped Curio Shop frame/stall decoration
}

/** The player's public identity page: a banner + avatar + bio header (themed by a
 *  per-profile accent) over modular summaries of their Now Playing, Bazaar backlog
 *  and Finished games. Renders your own (editable) profile when not visiting, and a
 *  visited player's (read-only) one otherwise. Cover privacy is inherited: visitor
 *  game rows come from `player_library`, which already swaps non-friends' custom
 *  covers for the safe default and omits private games. */
export function ProfileHub({
  onOpenTab,
  onOpenAchievements,
  onOpenLists,
}: {
  onOpenTab: (tab: GameStatus) => void;
  /** Open the full trophy-room page (own profile only). */
  onOpenAchievements?: () => void;
  /** Open the My Lists workspace (own profile only). */
  onOpenLists?: () => void;
}) {
  const viewing = useStore((s) => s.viewing);
  const cloud = useStore((s) => s.cloud);
  const games = useStore((s) => s.games);
  // Own-profile fields (used when not visiting).
  const displayName = useStore((s) => s.displayName);
  const avatarUrl = useStore((s) => s.avatarUrl);
  const bannerUrl = useStore((s) => s.bannerUrl);
  const aboutMe = useStore((s) => s.aboutMe);
  const accent = useStore((s) => s.accent);
  const bg = useStore((s) => s.bg);
  const coins = useStore((s) => s.coins);
  const myBadges = useStore((s) => s.myBadges);
  const selectedTitleId = useStore((s) => s.selectedTitleId);
  const myUserId = useStore((s) => s.userId);
  const fetchProfileActivity = useStore((s) => s.fetchProfileActivity);

  const visiting = viewing != null;
  const editable = !visiting && cloud;
  // Shelves and feeds show the unified-family view: hidden siblings stay out
  // (the primary's card stands in for the family). The header totals above
  // keep counting every row, matching the DB-side view_profile/leaderboard.
  const library = useMemo(
    () => visibleLibrary(visiting ? viewing.games : games),
    [visiting, viewing, games],
  );

  // Trophy case: your own achievements live in the store (loaded at boot); a
  // visited player's earned set is fetched on demand (earned-only — the server
  // withholds progress for anyone but yourself).
  const myAchievements = useStore((s) => s.achievements);
  const fetchUserAchievements = useStore((s) => s.fetchUserAchievements);
  const [visitedAchievements, setVisitedAchievements] = useState<Achievement[]>([]);
  const visitedUserId = viewing?.userId ?? null;
  useEffect(() => {
    let alive = true;
    if (cloud && visitedUserId) {
      void fetchUserAchievements(visitedUserId).then((rows) => {
        if (alive) setVisitedAchievements(rows);
      });
    } else {
      setVisitedAchievements([]);
    }
    return () => {
      alive = false;
    };
  }, [cloud, visitedUserId, fetchUserAchievements]);
  const achievements = visiting ? visitedAchievements : myAchievements;
  const medals = useMemo(() => displayMedals(achievements), [achievements]);

  // Own equipped cosmetics resolve through the shop catalog (id → style key);
  // the catalog is lazily loaded here when something is actually equipped. A
  // visited profile's cosmetics arrive pre-resolved from view_profile.
  const shopItems = useStore((s) => s.shopItems);
  const equippedFrameId = useStore((s) => s.equippedFrameId);
  const equippedStallId = useStore((s) => s.equippedStallId);
  const fetchShop = useStore((s) => s.fetchShop);
  const myEconomyEnabled = useStore((s) => s.economyEnabled);
  // An economy-off balance is frozen and private — no coin chip on the header
  // (your own hub while off, or a visited player who turned coins off).
  const showCoins = viewing ? viewing.economyEnabled !== false : myEconomyEnabled;
  useEffect(() => {
    if (cloud && !visiting && (equippedFrameId || equippedStallId) && shopItems.length === 0) {
      void fetchShop();
    }
  }, [cloud, visiting, equippedFrameId, equippedStallId, shopItems.length, fetchShop]);

  const profile: HubProfile = useMemo(() => {
    if (viewing) {
      return {
        displayName: viewing.displayName,
        avatarUrl: viewing.avatarUrl,
        bannerUrl: viewing.bannerUrl,
        aboutMe: viewing.aboutMe,
        accent: viewing.accent,
        bg: viewing.bg,
        coins: viewing.coins,
        badges: viewing.badges,
        title: viewing.title,
        gamesFinished: viewing.gamesFinished,
        hoursFinished: viewing.hoursFinished,
        lastSeenAt: viewing.lastSeenAt,
        activity: viewing.activity,
        cosmetics: viewing.cosmetics,
      };
    }
    // A retired game is an admitted non-clear — kept off the finished stats
    // (mirrors view_profile / the leaderboard, which apply the same filter).
    const finished = games.filter((g) => g.status === "finished" && g.finishTag !== "retired");
    return {
      displayName: displayName ?? "You",
      avatarUrl,
      bannerUrl,
      aboutMe,
      accent,
      bg,
      coins,
      badges: myBadges,
      title: myBadges.find((b) => b.id === selectedTitleId) ?? null,
      gamesFinished: finished.length,
      hoursFinished: finished.reduce((sum, g) => sum + (g.hours ?? 0), 0),
      lastSeenAt: null,
      activity: null,
      cosmetics: {
        frame: shopItems.find((i) => i.id === equippedFrameId)?.style ?? null,
        stall: shopItems.find((i) => i.id === equippedStallId)?.style ?? null,
        coin: null, // own chip: CoinIcon already wears the equipped mint
      },
    };
  }, [viewing, games, displayName, avatarUrl, bannerUrl, aboutMe, accent, bg, coins, myBadges, selectedTitleId, shopItems, equippedFrameId, equippedStallId]);

  const accentHex = resolveAccent(profile.accent);
  // An equipped stall decoration dresses the header card (frame is on the avatar).
  const stallStyle = resolveStallStyle(profile.cosmetics.stall);
  // Live-service games in the Rotation lane get their own section + activity
  // wording — their rhythm isn't a focused "Now Playing" run (issue b4c6ac9d).
  const playingAll = library.filter((g) => g.status === "playing");
  const inRotation = playingAll.filter(isInRotation);
  const nowPlaying = playingAll.filter((g) => !isInRotation(g));
  const rotationIds = new Set(inRotation.map((g) => g.id));
  // Break the focused Now Playing games out by lane so a visitor can see what the
  // player is finishing (Focus), replaying, or 100%-completing — Rotation is its
  // own module below (issue e93468ef). Labels show for the "special" lanes always
  // and for Focus only when it shares the module, so a plain focused run stays
  // uncluttered.
  const playingLanes = NOW_PLAYING_LANES.map((l) => ({
    ...l,
    games: nowPlaying.filter((g) => laneOf(g) === l.lane),
  })).filter((l) => l.games.length > 0);
  const showLaneHeaders = playingLanes.length > 1 || playingLanes[0]?.lane !== "focus";
  const finishedGames = library.filter((g) => g.status === "finished");
  // Favorites: liked games, newest like first. A visited library only carries
  // what player_library shares, so privacy is inherited. Capped in the module
  // with an in-place "Show all" so a big collection can't swallow the page.
  const likedGames = useMemo(
    () =>
      library
        .filter((g) => g.likedAt != null)
        .sort((a, b) => (b.likedAt ?? 0) - (a.likedAt ?? 0)),
    [library],
  );
  const [showAllLiked, setShowAllLiked] = useState(false);
  const FAVORITES_SHOWN = 6;
  // Custom lists shelf: your own workspace lists (all visibilities, since only
  // you see your own hub with their badges), or the visited player's public
  // ones (the server returns nothing else to a visitor).
  const myLists = useStore((s) => s.myLists);
  const fetchMyLists = useStore((s) => s.fetchMyLists);
  const fetchUserLists = useStore((s) => s.fetchUserLists);
  const [visitedLists, setVisitedLists] = useState<GameListSummary[]>([]);
  useEffect(() => {
    let alive = true;
    if (cloud && visitedUserId) {
      void fetchUserLists(visitedUserId).then((rows) => {
        if (alive) setVisitedLists(rows);
      });
    } else {
      setVisitedLists([]);
      if (cloud && !visitedUserId) void fetchMyLists();
    }
    return () => {
      alive = false;
    };
  }, [cloud, visitedUserId, fetchUserLists, fetchMyLists]);
  const profileLists = visiting ? visitedLists : (myLists ?? []);
  const owned = useMemo(() => library.filter((g) => g.status !== "wishlist"), [library]);
  const summary = useMemo(() => profileSummary(owned), [owned]);
  const platforms = useMemo(() => platformSummary(library), [library]);
  // Recent Activity: the player's milestone feed from the server (own or
  // visited), with a local Added+Finished derivation as the fallback while
  // offline or before the fetch lands, so the section is never needlessly empty.
  const [activity, setActivity] = useState<ProfileActivity[] | null>(null);
  const targetUserId = viewing ? viewing.userId : myUserId;
  useEffect(() => {
    let alive = true;
    if (cloud && targetUserId) {
      void fetchProfileActivity(targetUserId).then((rows) => {
        if (alive) setActivity(rows);
      });
    } else {
      setActivity(null);
    }
    return () => {
      alive = false;
    };
  }, [cloud, targetUserId, fetchProfileActivity]);
  // The server feed when it has rows. Otherwise, your OWN profile falls back to
  // a local Added+Finished derivation (so offline / first paint isn't blank); a
  // visited profile is inherently online, so it just shows the RPC result.
  const feed = useMemo(
    () =>
      activity && activity.length > 0
        ? activity
        : visiting
          ? []
          : localActivityFallback(games),
    [activity, visiting, games],
  );
  const online = isOnline(profile.lastSeenAt);

  return (
    // max-w-7xl (not 5xl): the banner is the page's hero and renders at its
    // full 3:1 frame, so the profile column gets the room to let it fill the
    // available space instead of sitting in a narrow card.
    // The owner's colors, scoped here: a custom background swaps the page's whole
    // derived palette (panels, ink, lines) and the accent colors chrome + buttons,
    // while the app shell around it keeps the viewer's theme.
    <div style={profileColorVars(profile.bg, profile.accent)} className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      {/* ── Header: banner, avatar, identity, bio ───────────────────────────── */}
      <section
        className={
          "relative overflow-hidden rounded-3xl border bg-surface " +
          (stallStyle ? stallStyle.cardClassName : "border-line")
        }
      >
        <BannerArea url={profile.bannerUrl} accentHex={accentHex} editable={editable} />
        {stallStyle && <StallOrnament styleKey={profile.cosmetics.stall} />}
        <div className="flex flex-col gap-3 px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-3 sm:-mt-12">
            <div className="relative">
              <span className="inline-block rounded-full border-4 border-surface bg-surface">
                <Avatar
                  url={profile.avatarUrl}
                  name={profile.displayName}
                  size={84}
                  frame={profile.cosmetics.frame}
                />
              </span>
              {editable && <AvatarEditButton />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showCoins && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-sm font-medium text-ink">
                  {/* A visited player's balance wears THEIR equipped mint. */}
                  <CoinIcon
                    size={14}
                    variant={
                      isCoinVariant(profile.cosmetics.coin) ? profile.cosmetics.coin : undefined
                    }
                  />{" "}
                  {profile.coins}
                </span>
              )}
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

          {editable && <ColorsRow bg={profile.bg} accent={profile.accent} />}
        </div>
      </section>

      {/* ── Modules ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Focused Now Playing runs. Hidden when the only thing in play is
            live-service (that shows as In Rotation below), but always shown when
            nothing is playing so the section — and its prompt — never vanish. */}
        {(nowPlaying.length > 0 || inRotation.length === 0) && (
          <Module
            icon={Gamepad2}
            title="Now Playing"
            count={nowPlaying.length}
            onViewAll={() => onOpenTab("playing")}
          >
            {nowPlaying.length === 0 ? (
              <EmptyNote text={visiting ? "Nothing in play right now." : "You're not playing anything yet."} />
            ) : (
              <div className="flex flex-col gap-4">
                {playingLanes.map(({ lane, label, icon: LaneIcon, games }) => (
                  <div key={lane} className="flex flex-col gap-2">
                    {showLaneHeaders && (
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                        <LaneIcon size={12} className="text-accent" />
                        <span>{label}</span>
                        <span className="font-normal opacity-70">· {games.length}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {games.slice(0, 6).map((g) => (
                        <GameTile
                          key={g.id}
                          game={g}
                          onClick={() => {
                            window.location.hash = gameHash(g.id, viewing?.userId);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Module>
        )}

        {/* Live-service / ongoing games in the Rotation lane — their own section
            (∞), only when there are any. */}
        {inRotation.length > 0 && (
          <Module
            icon={InfinityIcon}
            title="In Rotation"
            count={inRotation.length}
            onViewAll={() => onOpenTab("playing")}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {inRotation.slice(0, 6).map((g) => (
                <GameTile
                  key={g.id}
                  game={g}
                  onClick={() => {
                    window.location.hash = gameHash(g.id, viewing?.userId);
                  }}
                />
              ))}
            </div>
          </Module>
        )}

        <Module
          icon={Medal}
          title="Recent Activity"
          count={feed.length}
          countLabel={feed.length === 1 ? "update" : "updates"}
        >
          {feed.length === 0 ? (
            <EmptyNote
              text={visiting ? "No activity yet." : "Add or finish a game to start your timeline."}
            />
          ) : (
            <RecentActivityFeed
              items={feed}
              rotationIds={rotationIds}
              onOpen={(id) => {
                window.location.hash = gameHash(id, viewing?.userId);
              }}
            />
          )}
        </Module>

        {cloud && (
          <Module
            icon={Medal}
            title="Achievements"
            count={achievements.filter((a) => a.earnedAt != null).length}
            countLabel="earned"
            onViewAll={!visiting && onOpenAchievements ? onOpenAchievements : undefined}
          >
            {medals.length === 0 ? (
              <EmptyNote
                text={
                  visiting
                    ? "No medals earned yet."
                    : "Finish games, log time, and grow your library to earn medals."
                }
              />
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-3">
                {/* One medal per family — an upgraded tier replaces the one below
                    it, so the case shows current standing, not a pile. */}
                {medals.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex w-16 flex-col items-center gap-1 text-center">
                    <AchievementMedallion achievement={a} size={44} />
                    <span className="w-full truncate text-[10px] font-medium text-muted" title={a.name}>
                      {a.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!visiting && achievements.length > 0 && (
              <p className="mt-3 text-[11px] text-subtle">{earnedSummary(achievements)}</p>
            )}
          </Module>
        )}

        {likedGames.length > 0 && (
          <Module
            icon={ThumbsUp}
            title="Favorites"
            count={likedGames.length}
            countLabel={likedGames.length === 1 ? "game" : "games"}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(showAllLiked ? likedGames : likedGames.slice(0, FAVORITES_SHOWN)).map((g) => (
                <GameTile
                  key={g.id}
                  game={g}
                  onClick={() => {
                    window.location.hash = gameHash(g.id, viewing?.userId);
                  }}
                />
              ))}
            </div>
            {likedGames.length > FAVORITES_SHOWN && (
              <button
                type="button"
                onClick={() => setShowAllLiked((v) => !v)}
                className="mt-3 text-xs font-medium text-accent transition hover:underline"
              >
                {showAllLiked ? "Show fewer" : `Show all ${likedGames.length}`}
              </button>
            )}
          </Module>
        )}

        {profileLists.length > 0 && (
          <Module
            icon={ListOrdered}
            title="Lists"
            count={profileLists.length}
            countLabel={profileLists.length === 1 ? "list" : "lists"}
            onViewAll={visiting ? undefined : onOpenLists}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {profileLists.slice(0, 4).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    window.location.hash = listHash(l.id);
                  }}
                  className="flex items-center gap-3 rounded-xl border border-line bg-panel/40 p-2.5 text-left transition hover:border-edge"
                >
                  <div className="grid h-14 w-[4.5rem] shrink-0 grid-cols-2 gap-px overflow-hidden rounded-lg bg-panel">
                    {Array.from({ length: 4 }, (_, i) =>
                      l.preview[i] ? (
                        <img
                          key={i}
                          src={l.preview[i]}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span key={i} className="h-full w-full bg-panel" />
                      ),
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{l.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
                      <span>
                        {l.itemCount} {l.itemCount === 1 ? "game" : "games"}
                      </span>
                      {!visiting && <VisibilityBadge visibility={l.visibility} />}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </Module>
        )}

        <Module icon={Trophy} title="Finished" count={finishedGames.length} onViewAll={() => onOpenTab("finished")}>
          {finishedGames.length === 0 ? (
            <EmptyNote text={visiting ? "No finished games yet." : "Finish a game to fill your trophy room."} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {finishedGames.slice(0, 6).map((g) => (
                <GameTile
                  key={g.id}
                  game={g}
                  onClick={() => {
                    window.location.hash = gameHash(g.id, viewing?.userId);
                  }}
                />
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
    // With a banner set, the frame is the SAME 3:1 the crop modal promised —
    // a fixed-height strip would re-crop the image vertically via object-cover
    // and break "the frame is what everyone sees". The empty gradient keeps a
    // shorter strip so a banner-less header doesn't loom.
    <div className={"relative w-full bg-panel " + (url ? "aspect-[3/1]" : "h-36 sm:h-52")}>
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

/** The owner's entry point to the Colors modal: shows the current pick (preset
 *  name, or "Custom" over the two swatches) and opens the full editor. */
function ColorsRow({ bg, accent }: { bg: string | null; accent: string | null }) {
  const [open, setOpen] = useState(false);
  const accentHex = resolveAccent(accent);
  const preset = matchPreset(bg, accent);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-subtle">
        <Palette size={13} className="text-accent" /> Colors
      </span>
      {(bg || accentHex) && (
        <span className="inline-flex items-center gap-1">
          {bg && (
            <span
              title="Background"
              className="h-5 w-5 rounded-full border border-line"
              style={{ backgroundColor: bg }}
            />
          )}
          {accentHex && (
            <span
              title="Accent"
              className="h-5 w-5 rounded-full border border-line"
              style={{ backgroundColor: accentHex }}
            />
          )}
        </span>
      )}
      <span className="text-[11px] text-subtle">{preset ? preset.name : "Custom"}</span>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-muted transition hover:text-accent"
      >
        <Pencil size={12} /> Edit colors
      </button>
      {open && <ProfileColorsModal onClose={() => setOpen(false)} />}
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

// The focused Now Playing lanes shown on a profile, in display order (Rotation
// is a separate module). Icons/labels mirror the Now Playing slot meter.
const NOW_PLAYING_LANES: { lane: Lane; label: string; icon: LucideIcon }[] = [
  { lane: "focus", label: "Focus", icon: Gamepad2 },
  { lane: "replay", label: "Replay", icon: RotateCcw },
  { lane: "completionist", label: "Completionist", icon: Target },
];

// ── Recent activity ─────────────────────────────────────────────────────────

/** The icon per milestone kind, matching the Journey tab's vocabulary. */
const KIND_ICON: Record<MilestoneKind, LucideIcon> = {
  added: Store,
  started: Play,
  beat: Flag,
  completed: Trophy,
  retired: Archive,
  unretired: Undo2,
};

/** The player's latest game milestones, newest first: six by default with a
 *  show-all expander. A Completed run gets the premium gold (brand) card, a
 *  Beat clear the quiet silver, and every other step a plain panel. */
function RecentActivityFeed({
  items,
  rotationIds,
  onOpen,
}: {
  items: ProfileActivity[];
  /** Game ids currently in the Rotation lane — their "started" step reads as
   *  "In Rotation" instead of a focused play start (issue b4c6ac9d). */
  rotationIds: ReadonlySet<string>;
  onOpen: (gameId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, RECENT_ACTIVITY_SHOWN);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {visible.map((a) => (
          <li key={a.id}>
            <ActivityRow
              item={a}
              inRotation={rotationIds.has(a.gameId)}
              onOpen={() => onOpen(a.gameId)}
            />
          </li>
        ))}
      </ul>
      {items.length > RECENT_ACTIVITY_SHOWN && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="self-start text-xs font-medium text-accent underline-offset-2 transition hover:underline"
        >
          {showAll ? `Show recent ${RECENT_ACTIVITY_SHOWN}` : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function ActivityRow({
  item,
  inRotation,
  onOpen,
}: {
  item: ProfileActivity;
  inRotation: boolean;
  onOpen: () => void;
}) {
  const tone = activityTone(item.kind);
  const gold = tone === "gold";
  const silver = tone === "silver";
  // A live-service game's "started" step is really it entering the Rotation
  // lane — label it so, with the lane's ∞ glyph.
  const asRotation = inRotation && item.kind === "started";
  const Icon = asRotation ? InfinityIcon : KIND_ICON[item.kind];
  // occurred_on is a plain calendar day — anchor it to local midnight so it
  // formats as that date regardless of timezone.
  const date = new Date(item.occurredOn + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <button
      onClick={onOpen}
      title={item.gameTitle}
      className={
        "flex w-full items-center gap-3 rounded-xl border p-2 text-left transition hover:-translate-y-0.5 hover:shadow-md " +
        (gold ? "border-brand/50 bg-brand/10" : "border-line bg-panel")
      }
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface">
        {item.gameImage ? (
          <img src={item.gameImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-lg opacity-50">🎮</div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium text-ink">{item.gameTitle}</span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={
              "inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] " +
              (gold
                ? "border-brand/50 bg-brand/15 text-brand"
                : silver
                  ? "border-line bg-surface text-muted"
                  : "border-line bg-surface text-subtle")
            }
          >
            <Icon size={11} className="shrink-0" />
            {asRotation ? "In Rotation" : milestoneLabel(item.kind)}
          </span>
          <span className="text-[11px] text-subtle">{date}</span>
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
                  {/* Retired games leave the completion math on both sides —
                      they're set aside, not part of the shelf's clear rate. */}
                  {row.beaten + row.completed + row.endless}/{row.total - row.retired} cleared
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
  //
  // Just the cover + title: the module this sits in ("Now Playing" / "Finished")
  // already states the status, and the platform lives on the game's own page —
  // so a status chip and platform pill here were redundant noise.
  const showCover = Boolean(game.image);
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
      <div className="p-2">
        <span className="block truncate text-xs font-medium text-ink">{game.title}</span>
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
