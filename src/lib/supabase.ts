import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminUser,
  AppNotification,
  Badge,
  FeatureAttachment,
  FeatureComment,
  FeatureRequest,
  FeatureStatus,
  Game,
  GameCopy,
  ViewProfile,
} from "../types";
import type { SlotDefinition, TargetedSlot } from "./slots";
import { coercePriority } from "./priority";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when both Supabase env vars are present. Drives cloud vs. local mode. */
export const isCloudConfigured = Boolean(url && anon);

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url!, anon!)
  : null;

/** A raw row from the public.games table. */
export interface GameRow {
  id: string;
  user_id: string;
  rawg_id: number | null;
  title: string;
  released: string | null;
  hours: number | null;
  rating: number | null;
  metacritic: number | null;
  genres: unknown;
  image: string | null;
  platforms: unknown;
  developers: unknown;
  esrb: string | null;
  status: Game["status"];
  price_paid: number | null;
  reward: number | null;
  played_hours: number | null;
  copies: unknown;
  progress_note: string | null;
  slot_id: string | null;
  family_id: string | null;
  family_name: string | null;
  added_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export function rowToGame(r: GameRow): Game {
  return {
    id: r.id,
    rawgId: r.rawg_id ?? undefined,
    title: r.title,
    released: r.released ?? undefined,
    hours: r.hours ?? undefined,
    rating: r.rating ?? undefined,
    metacritic: r.metacritic ?? null,
    genres: Array.isArray(r.genres) ? (r.genres as string[]) : [],
    image: r.image ?? undefined,
    platforms: Array.isArray(r.platforms) ? (r.platforms as string[]) : [],
    developers: Array.isArray(r.developers) ? (r.developers as string[]) : [],
    esrb: r.esrb ?? undefined,
    status: r.status,
    addedAt: r.added_at ? Date.parse(r.added_at) : Date.now(),
    startedAt: r.started_at ? Date.parse(r.started_at) : undefined,
    finishedAt: r.finished_at ? Date.parse(r.finished_at) : undefined,
    reward: r.reward ?? undefined,
    pricePaid: r.price_paid ?? undefined,
    playedHours: r.played_hours ?? 0,
    copies: Array.isArray(r.copies) ? (r.copies as GameCopy[]) : [],
    progressNote: r.progress_note ?? undefined,
    slotId: r.slot_id ?? null,
    familyId: r.family_id ?? null,
    familyName: r.family_name ?? undefined,
  };
}

/** A raw row from the public.slot_definitions table. */
export interface SlotDefinitionRow {
  id: string;
  name: string;
  min_hours: number | null;
  max_hours: number | null;
  active: boolean;
  created_at?: string;
}

export function rowToSlotDefinition(r: SlotDefinitionRow): SlotDefinition {
  return {
    id: r.id,
    name: r.name,
    minHours: r.min_hours,
    maxHours: r.max_hours,
    active: Boolean(r.active),
  };
}

/** A row from the user_slots table joined to its definition. */
export interface UserSlotRow {
  id: string;
  definition: SlotDefinitionRow | SlotDefinitionRow[] | null;
}

export function rowToTargetedSlot(r: UserSlotRow): TargetedSlot | null {
  // Supabase returns an embedded relation as an object (or array for some shapes).
  const d = Array.isArray(r.definition) ? r.definition[0] : r.definition;
  if (!d) return null;
  return { id: r.id, definition: rowToSlotDefinition(d) };
}

/** A badge as embedded (DB jsonb) in profile/leaderboard/admin payloads. */
export interface BadgeJson {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  prestige: number;
}

export function jsonToBadge(j: BadgeJson): Badge {
  return {
    id: j.id,
    slug: j.slug,
    name: j.name,
    description: j.description ?? null,
    icon: j.icon,
    prestige: Number(j.prestige ?? 0),
  };
}

/** Parse the jsonb badge array the RPCs return (defensive against null). */
export function jsonToBadges(arr: unknown): Badge[] {
  return Array.isArray(arr) ? (arr as BadgeJson[]).map(jsonToBadge) : [];
}

/** Parse a single jsonb badge object (a chosen title), or null. */
export function jsonToTitle(obj: unknown): Badge | null {
  return obj && typeof obj === "object" ? jsonToBadge(obj as BadgeJson) : null;
}

/** A row from the admin_list_users() RPC. */
export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  coins: number;
  general_slots: number;
  is_admin: boolean;
  blocked: boolean;
  blocked_reason: string | null;
  created_at: string;
  games_count: number;
  last_seen_at: string | null;
  activity: string | null;
  badges: unknown;
}

export function rowToAdminUser(r: AdminUserRow): AdminUser {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    avatarUrl: r.avatar_url ?? null,
    coins: r.coins,
    generalSlots: r.general_slots,
    isAdmin: Boolean(r.is_admin),
    blocked: Boolean(r.blocked),
    blockedReason: r.blocked_reason,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    gamesCount: Number(r.games_count ?? 0),
    lastSeenAt: r.last_seen_at ? Date.parse(r.last_seen_at) : null,
    activity: r.activity ?? null,
    badges: jsonToBadges(r.badges),
  };
}

export interface LeaderboardRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
  gamesFinished: number;
  hoursFinished: number;
  lastSeenAt: number | null;
  activity: string | null;
  title: Badge | null;
}

/** A row from the list_feature_requests() RPC. */
export interface FeatureRequestRow {
  id: string;
  kind: FeatureRequest["kind"];
  title: string;
  description: string | null;
  status: FeatureStatus;
  user_id: string;
  requester_name: string | null;
  is_admin_item: boolean;
  created_at: string;
  edited_at: string | null;
  vote_count: number;
  voted_by_me: boolean;
  comment_count: number;
  attachment_count: number;
  tags: string[] | null;
  priority: string | null;
}

export function rowToFeatureRequest(r: FeatureRequestRow): FeatureRequest {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    status: r.status,
    userId: r.user_id,
    requesterName: r.requester_name,
    isAdminItem: r.is_admin_item,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    editedAt: r.edited_at ? Date.parse(r.edited_at) : null,
    voteCount: Number(r.vote_count),
    votedByMe: Boolean(r.voted_by_me),
    commentCount: Number(r.comment_count ?? 0),
    attachmentCount: Number(r.attachment_count ?? 0),
    tags: Array.isArray(r.tags) ? r.tags : [],
    priority: coercePriority(r.priority),
  };
}

/** A row from the feature_attachments table. */
export interface FeatureAttachmentRow {
  id: string;
  request_id: string;
  user_id: string;
  url: string;
  path: string;
  name: string;
  content_type: string;
  size: number;
  created_at: string;
}

export function rowToFeatureAttachment(r: FeatureAttachmentRow): FeatureAttachment {
  return {
    id: r.id,
    requestId: r.request_id,
    userId: r.user_id,
    url: r.url,
    path: r.path,
    name: r.name,
    contentType: r.content_type,
    size: Number(r.size ?? 0),
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}

/** A row from the list_request_comments() RPC. */
export interface CommentRow {
  id: string;
  request_id: string;
  user_id: string;
  parent_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  reactions: Record<string, number> | null;
  my_reactions: string[] | null;
}

export function rowToComment(r: CommentRow): FeatureComment {
  return {
    id: r.id,
    requestId: r.request_id,
    userId: r.user_id,
    parentId: r.parent_id,
    authorName: r.author_name,
    body: r.body,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    updatedAt: r.updated_at ? Date.parse(r.updated_at) : r.created_at ? Date.parse(r.created_at) : Date.now(),
    reactions: r.reactions ?? {},
    myReactions: r.my_reactions ?? [],
  };
}

/** A row from the view_profile() RPC. */
export interface ViewProfileRow {
  display_name: string;
  avatar_url: string | null;
  coins: number;
  theme: string | null;
  games_finished: number;
  hours_finished: number;
  hide_spend: boolean;
  last_seen_at: string | null;
  activity: string | null;
  badges: unknown;
  title: unknown;
}

export function rowToViewProfile(r: ViewProfileRow): ViewProfile {
  return {
    displayName: r.display_name,
    avatarUrl: r.avatar_url ?? null,
    coins: Number(r.coins ?? 0),
    theme: r.theme ?? null,
    gamesFinished: Number(r.games_finished ?? 0),
    hoursFinished: Number(r.hours_finished ?? 0),
    hideSpend: Boolean(r.hide_spend),
    lastSeenAt: r.last_seen_at ? Date.parse(r.last_seen_at) : null,
    activity: r.activity ?? null,
    badges: jsonToBadges(r.badges),
    title: jsonToTitle(r.title),
  };
}

/** A raw row from the public.notifications table. */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function rowToNotification(r: NotificationRow): AppNotification {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    readAt: r.read_at ? Date.parse(r.read_at) : null,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}
