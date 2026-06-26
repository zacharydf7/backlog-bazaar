import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminSlotSummary,
  AdminUser,
  AppNotification,
  Badge,
  IssueAttachment,
  IssueComment,
  IssueRelation,
  Issue,
  IssueStatus,
  RelationKind,
  Compilation,
  Game,
  GameCopy,
  GameSubmission,
  LedgerEntry,
  MySubmission,
  Role,
  SubmissionStatus,
  UserRole,
  UserStats,
  ViewProfile,
} from "../types";
import type { CatalogFields, CommunityCatalogEntry } from "./submissions";
import { isPermission } from "./permissions";
import type {
  CompilationTemplate,
  CompilationTemplateSubmission,
  TemplateContent,
  TemplateGame,
} from "./compilationTemplates";
import type { SlotDefinition, SlotKind, TargetedSlot } from "./slots";
import { coercePriority } from "./priority";
import { coerceEffort } from "./effort";

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
  stock_image: string | null;
  original_image: string | null;
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
  compilation_id: string | null;
  compilation_name: string | null;
  catalog_id: string | null;
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
    stockImage: r.stock_image ?? undefined,
    originalImage: r.original_image ?? undefined,
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
    compilationId: r.compilation_id ?? null,
    compilationName: r.compilation_name ?? undefined,
    catalogId: r.catalog_id ?? undefined,
  };
}

/** A raw row from the public.compilations table. */
export interface CompilationRow {
  id: string;
  user_id: string;
  title: string;
  total_cost: number | null;
  platform: string | null;
  format: string | null;
  created_at: string;
}

export function rowToCompilation(r: CompilationRow): Compilation {
  return {
    id: r.id,
    title: r.title,
    totalCost: r.total_cost ?? 0,
    platform: r.platform ?? undefined,
    format: (r.format as Compilation["format"]) ?? undefined,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}

/** Coerce a jsonb games blob into a TemplateGame[]. */
function jsonToTemplateGames(value: unknown): TemplateGame[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : "";
      if (!name.trim()) return null;
      return {
        name,
        hours: typeof o.hours === "number" ? o.hours : undefined,
        image: typeof o.image === "string" ? o.image : undefined,
        rawgId: typeof o.rawg_id === "number" ? o.rawg_id : undefined,
        catalogId: typeof o.catalog_id === "string" ? o.catalog_id : undefined,
        genres: Array.isArray(o.genres) ? (o.genres as string[]) : undefined,
        released: typeof o.released === "string" ? o.released : undefined,
        metacritic: typeof o.metacritic === "number" ? o.metacritic : undefined,
        platforms: Array.isArray(o.platforms) ? (o.platforms as string[]) : undefined,
        developers: Array.isArray(o.developers) ? (o.developers as string[]) : undefined,
        esrb: typeof o.esrb === "string" ? o.esrb : undefined,
      } as TemplateGame;
    })
    .filter((x): x is TemplateGame => x !== null);
}

/** Coerce a jsonb {title, platform, format, games} blob into TemplateContent. */
function jsonToTemplateContent(value: unknown): TemplateContent | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  return {
    title: typeof o.title === "string" ? o.title : "",
    platform: typeof o.platform === "string" ? o.platform : undefined,
    format: (o.format as TemplateContent["format"]) ?? undefined,
    games: jsonToTemplateGames(o.games),
  };
}

/** A raw row from public.compilation_templates. */
export interface CompilationTemplateRow {
  id: string;
  title: string;
  platform: string | null;
  format: string | null;
  games: unknown;
  created_by: string | null;
  created_at: string;
}

export function rowToCompilationTemplate(r: CompilationTemplateRow): CompilationTemplate {
  return {
    id: r.id,
    title: r.title,
    platform: r.platform ?? undefined,
    format: (r.format as CompilationTemplate["format"]) ?? undefined,
    games: jsonToTemplateGames(r.games),
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}

/** A raw row from list_compilation_submissions (admin) or a direct select of the
 *  caller's own compilation_submissions. `submitter_name`/`current`/`reviewer_name`
 *  are only present on the admin RPC shape. */
export interface CompilationSubmissionRow {
  id: string;
  submitter?: string;
  submitter_name?: string | null;
  kind: "new" | "edit";
  template_id: string | null;
  title: string | null;
  platform?: string | null;
  format?: string | null;
  games: unknown;
  before: unknown;
  current?: unknown;
  status: SubmissionStatus;
  reviewer?: string | null;
  reviewer_name?: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  reward: number | null;
  created_at: string;
  deleted_at?: string | null;
}

export function rowToCompilationSubmission(r: CompilationSubmissionRow): CompilationTemplateSubmission {
  return {
    id: r.id,
    submitter: r.submitter ?? "",
    submitterName: r.submitter_name ?? "",
    kind: r.kind,
    templateId: r.template_id ?? null,
    title: r.title ?? "",
    platform: r.platform ?? undefined,
    format: (r.format as CompilationTemplateSubmission["format"]) ?? undefined,
    games: jsonToTemplateGames(r.games),
    before: jsonToTemplateContent(r.before),
    current: jsonToTemplateContent(r.current),
    status: r.status,
    reviewerName: r.reviewer_name ?? null,
    reviewedAt: r.reviewed_at ? Date.parse(r.reviewed_at) : null,
    reviewNote: r.review_note ?? null,
    reward: r.reward ?? null,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    deletedAt: r.deleted_at ? Date.parse(r.deleted_at) : null,
  };
}

/** A raw row from the public.slot_definitions table. */
export interface SlotDefinitionRow {
  id: string;
  name: string;
  kind?: SlotKind | null;
  min_hours: number | null;
  max_hours: number | null;
  min_year?: number | null;
  max_year?: number | null;
  min_metacritic?: number | null;
  max_metacritic?: number | null;
  genres?: string[] | null;
  platforms?: string[] | null;
  default_grant_count?: number | null;
  active: boolean;
  created_at?: string;
}

export function rowToSlotDefinition(r: SlotDefinitionRow): SlotDefinition {
  return {
    id: r.id,
    name: r.name,
    // Pre-migration rows (or a stale select) default to the original behaviour.
    kind: r.kind ?? "standard",
    minHours: r.min_hours,
    maxHours: r.max_hours,
    minYear: r.min_year ?? null,
    maxYear: r.max_year ?? null,
    minMetacritic: r.min_metacritic ?? null,
    maxMetacritic: r.max_metacritic ?? null,
    genres: r.genres ?? [],
    platforms: r.platforms ?? [],
    defaultGrantCount: r.default_grant_count ?? 0,
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
  vouchers: number | null;
  general_slots: number;
  targeted_slots: unknown;
  is_admin: boolean;
  blocked: boolean;
  blocked_reason: string | null;
  hidden: boolean;
  created_at: string;
  onboarding_completed_at: string | null;
  games_count: number;
  last_seen_at: string | null;
  activity: string | null;
  badges: unknown;
  roles: unknown;
}

const SLOT_KINDS: SlotKind[] = ["standard", "endless", "replay"];

/** Parse the targeted-slot summaries (name + kind) the admin RPCs embed as jsonb.
 *  An unknown/absent kind defaults to 'standard'; a nameless entry is dropped. */
export function jsonToAdminSlots(arr: unknown): AdminSlotSummary[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : "";
      const kind = SLOT_KINDS.includes(o.kind as SlotKind) ? (o.kind as SlotKind) : "standard";
      return name ? { name, kind } : null;
    })
    .filter((x): x is AdminSlotSummary => x !== null);
}

export function rowToAdminUser(r: AdminUserRow): AdminUser {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    avatarUrl: r.avatar_url ?? null,
    coins: r.coins,
    vouchers: Number(r.vouchers ?? 0),
    generalSlots: r.general_slots,
    targetedSlots: jsonToAdminSlots(r.targeted_slots),
    isAdmin: Boolean(r.is_admin),
    blocked: Boolean(r.blocked),
    blockedReason: r.blocked_reason,
    hidden: Boolean(r.hidden),
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    onboardingCompletedAt: r.onboarding_completed_at ? Date.parse(r.onboarding_completed_at) : null,
    gamesCount: Number(r.games_count ?? 0),
    lastSeenAt: r.last_seen_at ? Date.parse(r.last_seen_at) : null,
    activity: r.activity ?? null,
    badges: jsonToBadges(r.badges),
    roles: jsonToUserRoles(r.roles),
  };
}

/** A role row from list_roles(). bigint member_count arrives as a string. */
export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[] | null;
  is_system: boolean;
  member_count?: number | string | null;
  created_at?: string | null;
}

export function rowToRole(r: RoleRow): Role {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description ?? null,
    // Drop any stale keys no longer in the catalog so the UI never renders them.
    permissions: (r.permissions ?? []).filter(isPermission),
    isSystem: Boolean(r.is_system),
    memberCount: r.member_count == null ? undefined : Number(r.member_count),
  };
}

/** Coerce the jsonb roles array on an admin user row into typed UserRoles. */
function jsonToUserRoles(value: unknown): UserRole[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is { id: string; key: string; name: string } => !!v && typeof v === "object")
    .map((v) => ({ id: String(v.id), key: String(v.key), name: String(v.name) }));
}

/** A row from the admin_user_stats() RPC. bigint columns arrive as strings from
 *  PostgREST, so they're coerced with Number() in the mapper. */
export interface UserStatsRow {
  coins_earned: number | string;
  coins_spent: number | string;
  sunk_cost: number | string;
  hours_played: number;
  games_added: number | string;
  games_finished: number | string;
  games_shelved: number | string;
  top_game: string | null;
  top_genre: string | null;
  top_platform: string | null;
}

export function rowToUserStats(r: UserStatsRow): UserStats {
  return {
    coinsEarned: Number(r.coins_earned) || 0,
    coinsSpent: Number(r.coins_spent) || 0,
    sunkCost: Number(r.sunk_cost) || 0,
    hoursPlayed: Number(r.hours_played) || 0,
    gamesAdded: Number(r.games_added) || 0,
    gamesFinished: Number(r.games_finished) || 0,
    gamesShelved: Number(r.games_shelved) || 0,
    topGame: r.top_game ?? null,
    topGenre: r.top_genre ?? null,
    topPlatform: r.top_platform ?? null,
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
export interface IssueRow {
  id: string;
  kind: Issue["kind"];
  title: string;
  description: string | null;
  status: IssueStatus;
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
  effort: string | null;
}

export function rowToIssue(r: IssueRow): Issue {
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
    effort: coerceEffort(r.effort),
  };
}

/** A row from the feature_attachments table. */
export interface IssueAttachmentRow {
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

export function rowToIssueAttachment(r: IssueAttachmentRow): IssueAttachment {
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
  attachments: unknown;
}

export function rowToComment(r: CommentRow): IssueComment {
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
    attachments: Array.isArray(r.attachments)
      ? (r.attachments as IssueAttachmentRow[]).map(rowToIssueAttachment)
      : [],
  };
}

/** A row from the issue_relations view. */
export interface IssueRelationRow {
  id: string;
  from_request: string;
  to_request: string;
  kind: string;
  created_at: string;
}

export function rowToIssueRelation(r: IssueRelationRow): IssueRelation {
  return {
    id: r.id,
    fromRequest: r.from_request,
    toRequest: r.to_request,
    kind: r.kind as RelationKind,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
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

/** A raw row from the public.coin_events ledger table. */
export interface LedgerRow {
  id: string;
  kind: string;
  coin_delta: number;
  charter_delta: number;
  voucher_delta: number | null;
  coin_balance_after: number | null;
  charter_balance_after: number | null;
  voucher_balance_after: number | null;
  game_title: string | null;
  label: string | null;
  created_at: string;
}

export function rowToLedgerEntry(r: LedgerRow): LedgerEntry {
  return {
    id: r.id,
    kind: r.kind,
    coinDelta: r.coin_delta ?? 0,
    charterDelta: r.charter_delta ?? 0,
    voucherDelta: r.voucher_delta ?? 0,
    coinBalanceAfter: r.coin_balance_after ?? null,
    charterBalanceAfter: r.charter_balance_after ?? null,
    voucherBalanceAfter: r.voucher_balance_after ?? null,
    gameTitle: r.game_title,
    label: r.label,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
  };
}

/** Coerce an embedded jsonb object (a catalog_games row, or a submission's
 *  `before` snapshot) into the CatalogFields shape. Both use the same field
 *  names, so one parser handles both. Returns null for a missing payload. */
export function jsonToCatalogFields(obj: unknown): CatalogFields | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const hours =
    typeof o.hours === "number"
      ? o.hours
      : o.hours == null
        ? null
        : Number.isFinite(Number(o.hours))
          ? Number(o.hours)
          : null;
  return {
    title: typeof o.title === "string" ? o.title : "",
    image: typeof o.image === "string" ? o.image : "",
    platforms: Array.isArray(o.platforms) ? (o.platforms as string[]) : [],
    genres: Array.isArray(o.genres) ? (o.genres as string[]) : [],
    developers: Array.isArray(o.developers) ? (o.developers as string[]) : [],
    released: typeof o.released === "string" ? o.released : "",
    hours,
    screenshots: Array.isArray(o.screenshots) ? (o.screenshots as string[]) : [],
  };
}

/** A row from the list_game_submissions() RPC. */
export interface GameSubmissionRow {
  id: string;
  submitter: string;
  submitter_name: string;
  kind: "edit" | "new";
  catalog_id: string | null;
  rawg_id: number | null;
  title: string | null;
  image: string | null;
  platforms: unknown;
  genres: unknown;
  developers: unknown;
  released: string | null;
  hours: number | null;
  screenshots: unknown;
  before: unknown;
  current: unknown;
  status: "pending" | "approved" | "rejected";
  reviewer: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  reward: number | null;
  approved_fields: string[] | null;
  created_at: string;
  deleted_at: string | null;
  reverted_at: string | null;
  reverted_by: string | null;
  reverted_by_name: string | null;
  reverted_fields: string[] | null;
}

export function rowToGameSubmission(r: GameSubmissionRow): GameSubmission {
  return {
    id: r.id,
    submitter: r.submitter,
    submitterName: r.submitter_name,
    kind: r.kind,
    catalogId: r.catalog_id ?? null,
    rawgId: r.rawg_id ?? null,
    proposed: {
      title: r.title ?? "",
      image: r.image ?? "",
      platforms: Array.isArray(r.platforms) ? (r.platforms as string[]) : [],
      genres: Array.isArray(r.genres) ? (r.genres as string[]) : [],
      developers: Array.isArray(r.developers) ? (r.developers as string[]) : [],
      released: r.released ?? "",
      hours: r.hours ?? null,
      screenshots: Array.isArray(r.screenshots) ? (r.screenshots as string[]) : [],
    },
    before: jsonToCatalogFields(r.before),
    current: jsonToCatalogFields(r.current),
    status: r.status,
    reviewer: r.reviewer ?? null,
    reviewerName: r.reviewer_name ?? null,
    reviewedAt: r.reviewed_at ? Date.parse(r.reviewed_at) : null,
    reviewNote: r.review_note ?? null,
    reward: typeof r.reward === "number" ? r.reward : null,
    approvedFields: Array.isArray(r.approved_fields) ? r.approved_fields : null,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    deletedAt: r.deleted_at ? Date.parse(r.deleted_at) : null,
    revertedAt: r.reverted_at ? Date.parse(r.reverted_at) : null,
    revertedByName: r.reverted_by_name ?? null,
    revertedFields: Array.isArray(r.reverted_fields) ? r.reverted_fields : null,
  };
}

/** A row from the list_community_catalog admin RPC: a community catalog entry plus
 *  how many libraries link to it. */
export interface CommunityCatalogRow {
  id: string;
  title: string | null;
  image: string | null;
  platforms: unknown;
  genres: unknown;
  developers: unknown;
  released: string | null;
  hours: number | null;
  screenshots: unknown;
  owner_count: number | null;
  created_at: string;
  updated_at: string;
}

export function rowToCommunityCatalog(r: CommunityCatalogRow): CommunityCatalogEntry {
  return {
    id: r.id,
    title: r.title ?? "",
    image: r.image ?? "",
    platforms: Array.isArray(r.platforms) ? (r.platforms as string[]) : [],
    genres: Array.isArray(r.genres) ? (r.genres as string[]) : [],
    developers: Array.isArray(r.developers) ? (r.developers as string[]) : [],
    released: r.released ?? "",
    hours: r.hours ?? null,
    screenshots: Array.isArray(r.screenshots) ? (r.screenshots as string[]) : [],
    ownerCount: typeof r.owner_count === "number" ? r.owner_count : Number(r.owner_count ?? 0),
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    updatedAt: r.updated_at ? Date.parse(r.updated_at) : Date.now(),
  };
}

/** A row from a direct select of the caller's own game_submissions. */
export interface MySubmissionRow {
  id: string;
  kind: "edit" | "new";
  title: string | null;
  image: string | null;
  platforms: unknown;
  genres: unknown;
  developers: unknown;
  released: string | null;
  hours: number | null;
  screenshots: unknown;
  before: unknown;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  reward: number | null;
  approved_fields: string[] | null;
  created_at: string;
  reviewed_at: string | null;
}

export function rowToMySubmission(r: MySubmissionRow): MySubmission {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title ?? "",
    image: r.image ?? null,
    status: r.status,
    reviewNote: r.review_note ?? null,
    reward: typeof r.reward === "number" ? r.reward : null,
    approvedFields: Array.isArray(r.approved_fields) ? r.approved_fields : null,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    reviewedAt: r.reviewed_at ? Date.parse(r.reviewed_at) : null,
    proposed: {
      title: r.title ?? "",
      image: r.image ?? "",
      platforms: Array.isArray(r.platforms) ? (r.platforms as string[]) : [],
      genres: Array.isArray(r.genres) ? (r.genres as string[]) : [],
      developers: Array.isArray(r.developers) ? (r.developers as string[]) : [],
      released: r.released ?? "",
      hours: r.hours ?? null,
      screenshots: Array.isArray(r.screenshots) ? (r.screenshots as string[]) : [],
    },
    before: jsonToCatalogFields(r.before),
  };
}
