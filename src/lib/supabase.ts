import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FeatureRequest, FeatureStatus, Game } from "../types";

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
  title: string;
  description: string | null;
  status: FeatureStatus;
  user_id: string;
  requester_name: string | null;
  is_admin_item: boolean;
  created_at: string;
  vote_count: number;
  voted_by_me: boolean;
}

export function rowToFeatureRequest(r: FeatureRequestRow): FeatureRequest {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    userId: r.user_id,
    requesterName: r.requester_name,
    isAdminItem: r.is_admin_item,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    voteCount: Number(r.vote_count),
    votedByMe: Boolean(r.voted_by_me),
  };
}
