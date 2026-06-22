import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminUser,
  AppNotification,
  FeatureComment,
  FeatureRequest,
  FeatureStatus,
  Game,
  GameCopy,
} from "../types";

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
  };
}

/** A row from the admin_list_users() RPC. */
export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string;
  coins: number;
  general_slots: number;
  is_admin: boolean;
  blocked: boolean;
  blocked_reason: string | null;
  created_at: string;
  games_count: number;
}

export function rowToAdminUser(r: AdminUserRow): AdminUser {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    coins: r.coins,
    generalSlots: r.general_slots,
    isAdmin: Boolean(r.is_admin),
    blocked: Boolean(r.blocked),
    blockedReason: r.blocked_reason,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    gamesCount: Number(r.games_count ?? 0),
  };
}

export interface LeaderboardRow {
  id: string;
  displayName: string;
  coins: number;
  gamesFinished: number;
  hoursFinished: number;
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
  vote_count: number;
  voted_by_me: boolean;
  comment_count: number;
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
    voteCount: Number(r.vote_count),
    votedByMe: Boolean(r.voted_by_me),
    commentCount: Number(r.comment_count ?? 0),
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
    reactions: r.reactions ?? {},
    myReactions: r.my_reactions ?? [],
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
