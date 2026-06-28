import type { CatalogFields } from "./lib/submissions";
import type { Permission } from "./lib/permissions";
import type { SlotKind } from "./lib/slots";
import type { FinishTag } from "./lib/finishTags";

/** A granted targeted slot in admin payloads: just the name + kind, enough for the
 *  admin user list to summarize the slot types a user holds. */
export interface AdminSlotSummary {
  name: string;
  kind: SlotKind;
}

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
  stockImage?: string; // current catalog/default cover, kept so a custom one can be reverted
  originalImage?: string; // the cover first added with (write-once); never overwritten by catalog edits
  catalogId?: string; // link to the shared catalog master (community-added games)
  ongoing?: boolean; // a live-service / ongoing game — exempt from the buy/finish economy
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
  slotId?: string | null; // legacy targeted-slot ref; null for all four Now Playing lanes (retired with the lane rework)
  inRotation?: boolean; // sits in the Rotation lane (live-service/ongoing); playing, slotId null, no focus slot used
  completionist?: boolean; // sits in the Completionist lane (going for 100%); playing, slotId null. See src/lib/slots.ts laneOf
  finishTag?: FinishTag | null; // how a finished game concluded (beaten/completed/endless); shown on the Finished board
  familyId?: string | null; // groups linked editions/versions of the same core title (null = unlinked)
  familyName?: string; // editable display name for the family card (denormalized across members)
  compilationId?: string | null; // the compilation purchase this game belongs to (null = standalone)
  compilationName?: string; // denormalized compilation title, for the board badge
  private?: boolean; // hidden from visitors to your Bazaar (owner-only; never affects the economy)
  resumed?: boolean; // a finished game pulled back into play for free (replay/endless) — re-finishing pays the Replay Bonus
}

/** A compilation purchase: one retail buy (a remaster collection, a multi-game
 *  bundle) bundling several distinct games. It's the primary financial record —
 *  it owns the total cost, platform and format — while each bundled game is its
 *  own standalone Game referencing it via `compilationId`. See
 *  src/lib/compilations.ts. */
export interface Compilation {
  id: string;
  title: string;
  totalCost: number; // total USD spent on the whole bundle
  platform?: string;
  format?: CopyFormat;
  createdAt: number;
}

/** A prestige marker shown on a player's profile (e.g. "Beta Tester"). The
 *  catalog lives in the DB `badges` table — adding one is data, not code. The
 *  `icon` is a lucide icon name resolved in src/lib/badges.ts; `prestige` drives
 *  sort order and colour. */
export interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  prestige: number;
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
  badges: Badge[]; // prestige badges they hold
  title: Badge | null; // the badge they've chosen to display as their title
}

// --- Social: friends, the activity feed, and cheers ------------------------

/** The caller's relationship to another user, from search_users. `pending_out` =
 *  we sent them a request; `pending_in` = they sent us one. */
export type FriendshipStatus = "none" | "pending_out" | "pending_in" | "friends";

/** A user surfaced in friend search, with our relationship to them. */
export interface UserSearchResult {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  status: FriendshipStatus;
}

/** An accepted friend, with privacy-respecting coins/presence and what they're
 *  currently playing. `coins`/presence are null when that friend hides them. */
export interface Friend {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  coins: number | null;
  lastSeenAt: number | null;
  activity: string | null;
  nowPlaying: string | null;
}

/** A pending friend request involving the caller. */
export interface FriendRequest {
  id: string;
  direction: "incoming" | "outgoing";
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  createdAt: number;
}

/** The kinds of milestone broadcast to the activity feed. */
export type ActivityKind = "game_imported" | "family_created" | "bounty_claimed";

/** One post in the activity feed: a friend's milestone, with cheer state. The
 *  coin amount in `detail` is omitted for friends who hide financial milestones. */
export interface ActivityEvent {
  id: string;
  actor: string;
  actorName: string;
  actorAvatar: string | null;
  kind: ActivityKind;
  gameTitle: string | null;
  detail: { coins?: number };
  createdAt: number;
  cheerCount: number;
  cheeredByMe: boolean;
}

/** A per-friend conversation summary for the inbox list: the latest message, the
 *  unread count, and whether the caller has archived the thread. */
export interface Conversation {
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  lastBody: string;
  lastOutgoing: boolean;
  lastCreatedAt: number;
  lastDeleted: boolean; // the latest message is a tombstone ("deleted")
  unreadCount: number;
  archived: boolean;
}

/** One direct message, from the caller's perspective (`outgoing` = the caller sent
 *  it; `other*` describe the person on the other end). `readAt` applies to the
 *  recipient's copy. */
export interface Message {
  id: string;
  sender: string;
  recipient: string;
  outgoing: boolean;
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  body: string;
  gameId: string | null;
  gameTitle: string | null;
  gameImage: string | null; // cover-art snapshot for an embedded game card
  readAt: number | null;
  createdAt: number;
  editedAt: number | null; // set when the sender edited it
  deleted: boolean; // a two-sided tombstone ("This message was deleted")
  reactions: Record<string, number>; // emoji → count
  myReactions: string[]; // emojis the current user added
  quoted: QuotedMessage | null; // an earlier message this one quotes (reply)
}

/** A snapshot of the message a reply quotes, resolved in the same thread. */
export interface QuotedMessage {
  id: string;
  body: string | null; // null if the quoted row is gone; "" when tombstoned
  outgoing: boolean; // whether the quoted message was sent by the current user
  deleted: boolean; // the quoted message was deleted
}

/** Lifetime gain/loss totals across a user's ledger: positive vs. negative
 *  movements summed separately, per currency. */
export interface LedgerTotals {
  coinsIn: number;
  coinsOut: number;
  chartersIn: number;
  chartersOut: number;
  vouchersIn: number;
  vouchersOut: number;
}

/** One immutable row in the Universal Transaction Ledger: a single coin and/or
 *  charter movement, with the running balances snapshotted right after it. The
 *  `kind` drives the human label (see src/lib/transactions.ts); `label` carries
 *  optional extra context (e.g. an admin adjustment reason). `gameTitle` is a
 *  denormalized snapshot so the row reads correctly even after the game is gone. */
export interface LedgerEntry {
  id: string;
  kind: string;
  coinDelta: number;
  charterDelta: number;
  voucherDelta: number;
  coinBalanceAfter: number | null;
  charterBalanceAfter: number | null;
  voucherBalanceAfter: number | null;
  gameTitle: string | null;
  label: string | null;
  createdAt: number;
}

export type IssueStatus =
  | "submitted"
  | "planned"
  | "in_progress"
  | "changes_requested"
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

/** A named bundle of permissions an admin can assign to users (RBAC). The
 *  effective permissions of a user are the union of their assigned roles'. */
export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  isSystem: boolean; // a seeded preset (Moderator/QA): editable, but not deletable
  memberCount?: number; // how many users hold it (from list_roles)
}

/** A lightweight role reference attached to a user (admin list role chips). */
export interface UserRole {
  id: string;
  key: string;
  name: string;
}

/** A user row as seen by an admin in User Management. */
export interface AdminUser {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
  vouchers: number; // onboarding Free Game Vouchers held (admin-grantable)
  generalSlots: number; // Focus-lane capacity
  rotationSlots: number; // Rotation-lane capacity (live-service/ongoing games)
  replaySlots: number; // Replay-lane capacity (finished games pulled back to replay)
  completionistSlots: number; // Completionist-lane capacity (games you're 100%-completing)
  // The targeted Now Playing slots granted to this user (name + kind), so the admin
  // list can reflect the different slot types they hold without opening the editor.
  targetedSlots: AdminSlotSummary[];
  isAdmin: boolean;
  blocked: boolean;
  blockedReason: string | null;
  hidden: boolean; // hidden from the leaderboard + cross-user stat aggregation

  createdAt: number;
  onboardingCompletedAt: number | null; // when they finished the onboarding tour (null = not yet)
  gamesCount: number;
  lastSeenAt: number | null;
  activity: string | null;
  badges: Badge[]; // prestige badges this user holds (for admin grant/revoke UI)
  roles: UserRole[]; // roles assigned to this user (for the role chips + assignment UI)
}

/** A user's analytics for a timeframe, as returned by the admin_user_stats RPC
 *  (a single rolled-up row). Powers the admin Stats dashboard. */
export interface UserStats {
  coinsEarned: number;
  coinsSpent: number;
  sunkCost: number; // coins forfeited to Shelve It
  hoursPlayed: number;
  gamesAdded: number;
  gamesFinished: number;
  gamesShelved: number;
  topGame: string | null;
  topGenre: string | null;
  topPlatform: string | null;
}

export type IssueKind = "feature" | "bug";

/** Triage priority for a feature/bug report. Defaults to "medium". */
export type IssuePriority = "low" | "medium" | "high";

/** Story-point-style effort estimate (how much work an item is). Defaults to
 *  "medium". Independent of priority (how important it is). */
export type IssueEffort = "low" | "medium" | "high";

/** A board item (feature request or bug report) with its vote tally and the
 *  caller's vote state. */
export interface Issue {
  id: string;
  kind: IssueKind;
  title: string;
  description: string | null;
  status: IssueStatus;
  userId: string;
  requesterName: string | null;
  isAdminItem: boolean;
  createdAt: number;
  editedAt: number | null; // set when the author edits it; null = never edited
  voteCount: number;
  votedByMe: boolean;
  commentCount: number;
  attachmentCount: number;
  tags: string[];
  priority: IssuePriority;
  effort: IssueEffort;
}

/** A file attached to a feature/bug report: a screenshot or a log/text file. */
export interface IssueAttachment {
  id: string;
  requestId: string;
  userId: string;
  url: string; // public URL (for <img> / download links)
  path: string; // storage path, used when deleting
  name: string; // original filename
  contentType: string;
  size: number;
  createdAt: number;
}

/** A comment on a board item. parentId set => it's a reply to another comment. */
export interface IssueComment {
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
  attachments: IssueAttachment[]; // files attached to this comment
}

/** A directed link kind between two issues. "blocks"/"duplicates" read inversely
 *  from the other side ("blocked by"/"duplicated by"); "relates" is symmetric. */
export type RelationKind = "blocks" | "duplicates" | "relates";

/** One stored link between two issues. The label a user sees depends on which
 *  side they're viewing from — see src/lib/issueRelations.ts. */
export interface IssueRelation {
  id: string;
  fromRequest: string;
  toRequest: string;
  kind: RelationKind;
  createdAt: number;
}

export type SubmissionStatus = "pending" | "approved" | "rejected";

/** One of the current user's own catalog contributions, with where it stands in
 *  review. Shown on the "My contributions" page. */
export interface MySubmission {
  id: string;
  kind: "edit" | "new";
  title: string;
  image: string | null;
  status: SubmissionStatus;
  reviewNote: string | null;
  reward: number | null; // coins paid out on approval (null until decided/if rejected)
  approvedFields: string[] | null; // which fields actually went live (null until approved)
  createdAt: number;
  reviewedAt: number | null;
  proposed: CatalogFields; // what the user suggested
  before: CatalogFields | null; // the values at submit time (null for a new game)
}

/** A pending community catalog contribution, as the admin moderation queue sees
 *  it. `proposed` is what the submitter wants; `current` is the live master
 *  record (null when none exists yet); `before` is the snapshot at submit time. */
export interface GameSubmission {
  id: string;
  submitter: string;
  submitterName: string;
  kind: "edit" | "new";
  catalogId: string | null;
  rawgId: number | null;
  proposed: CatalogFields;
  before: CatalogFields | null;
  current: CatalogFields | null;
  status: SubmissionStatus;
  reviewer: string | null; // admin who decided it (null while pending)
  reviewerName: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
  reward: number | null; // coins paid on approval
  approvedFields: string[] | null; // fields actually committed (null until approved)
  createdAt: number;
  deletedAt: number | null; // admin soft-delete (removed from the active queue)
  revertedAt: number | null; // admin rolled the approved edit back (null = never reverted)
  revertedByName: string | null; // who reverted it (display name; null until reverted)
  revertedFields: string[] | null; // which fields were rolled back (subset of approvedFields)
}
