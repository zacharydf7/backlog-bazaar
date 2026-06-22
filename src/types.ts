export type GameStatus = "backlog" | "playing" | "finished" | "wishlist";

/** A single copy of a game you own: which platform you have it on, and (later)
 *  what it cost you. Owning a game on three platforms = three copies. */
export type CopyFormat = "physical" | "digital";

export interface GameCopy {
  id: string;
  platform: string; // the platform label you own it on, e.g. "PlayStation 5"
  format?: CopyFormat; // physical or digital (optional — unspecified for e.g. PC)
  cost?: number; // acquisition cost in USD (optional — e.g. free / Game Pass)
  note?: string; // optional context, e.g. "launch", "sale", "gift"
  acquiredAt?: string; // optional ISO date the copy was acquired
}

/** Core fields fetched from RAWG (or entered manually). */
export interface GameMeta {
  rawgId?: number;
  title: string;
  released?: string; // ISO date, e.g. "2017-03-03"
  hours?: number; // estimated length in hours (RAWG "playtime")
  rating?: number; // 0–5
  metacritic?: number | null;
  genres: string[];
  image?: string;
  platforms?: string[];
  developers?: string[];
  esrb?: string; // e.g. "Mature", "Everyone 10+"
  playedHours?: number; // hours I've personally played (distinct from `hours`, the length)
  copies?: GameCopy[]; // platforms I own it on + what each cost (see GameCopy)
}

export interface Game extends GameMeta {
  id: string;
  status: GameStatus;
  addedAt: number;
  startedAt?: number;
  finishedAt?: number;
  reward?: number; // coins earned at finish (snapshot)
  pricePaid?: number; // coins spent at purchase (snapshot)
  progressNote?: string; // a single editable "where I left off" note (one per game)
  slotId?: string | null; // which Now Playing slot a playing game occupies (null = a general slot)
  familyId?: string | null; // groups linked editions/versions of the same core title (null = unlinked)
}

/** A user's visitor-privacy flags, e.g. { hide_spend: true }. Extensible — add
 *  new keys as more hideable data points come up. */
export type Privacy = Record<string, boolean>;

/** The public header shown when visiting another player's Bazaar. */
export interface ViewProfile {
  displayName: string;
  avatarUrl: string | null;
  coins: number;
  theme: string | null; // their chosen theme id (null = default)
  gamesFinished: number;
  hoursFinished: number;
  hideSpend: boolean; // they've hidden real-world spend from visitors
  lastSeenAt: number | null; // last presence heartbeat (null = offline/hidden)
  activity: string | null; // what they're doing (null = unknown/hidden)
}

export interface Transaction {
  id: string;
  type: "earn" | "spend";
  amount: number;
  label: string;
  at: number;
}

export type FeatureStatus =
  | "submitted"
  | "planned"
  | "in_progress"
  | "awaiting_feedback"
  | "done"
  | "declined";

/** A per-user alert. Named AppNotification to avoid clashing with the DOM type. */
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: number | null;
  createdAt: number;
}

/** A user row as seen by an admin in User Management. */
export interface AdminUser {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
  generalSlots: number;
  isAdmin: boolean;
  blocked: boolean;
  blockedReason: string | null;
  createdAt: number;
  gamesCount: number;
  lastSeenAt: number | null;
  activity: string | null;
}

export type FeatureKind = "feature" | "bug";

/** A board item (feature request or bug report) with its vote tally and the
 *  caller's vote state. */
export interface FeatureRequest {
  id: string;
  kind: FeatureKind;
  title: string;
  description: string | null;
  status: FeatureStatus;
  userId: string;
  requesterName: string | null;
  isAdminItem: boolean;
  createdAt: number;
  editedAt: number | null; // set when the author edits it; null = never edited
  voteCount: number;
  votedByMe: boolean;
  commentCount: number;
}

/** A comment on a board item. parentId set => it's a reply to another comment. */
export interface FeatureComment {
  id: string;
  requestId: string;
  userId: string;
  parentId: string | null;
  authorName: string | null;
  body: string;
  createdAt: number;
  updatedAt: number; // bumped on edit; > createdAt means it was edited
  reactions: Record<string, number>; // emoji -> count
  myReactions: string[]; // emojis the current user reacted with
}
