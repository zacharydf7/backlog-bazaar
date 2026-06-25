// Pure logic for community-shared compilation templates: the shape of a shared
// template, normalization, validation, the games-list diff the admin queue
// renders, and the bridge that turns a picked template into editable add-form
// rows. A template shares STRUCTURE only (title + games) — never anyone's cost,
// platform, or ownership. Kept free of React/Supabase so it's directly unit-tested.

import type { CopyFormat, SubmissionStatus } from "../types";
import { normalizeList } from "./submissions";
import type { CompilationChildDraft } from "./compilations";

/** One game inside a shared compilation template. Carries the catalog metadata a
 *  submitter captured (so applying a template fills covers/genres too), but no
 *  cost — that's always personal. */
export interface TemplateGame {
  name: string;
  hours?: number;
  image?: string;
  rawgId?: number;
  catalogId?: string;
  genres?: string[];
  released?: string;
  metacritic?: number | null;
  platforms?: string[];
  developers?: string[];
  esrb?: string;
}

/** An approved, shared compilation template. Carries the platform/format the
 *  compilation released on (structure, not personal cost) so picking one can
 *  pre-fill them and same-title releases can be told apart. */
export interface CompilationTemplate {
  id: string;
  title: string;
  platform?: string;
  format?: CopyFormat;
  games: TemplateGame[];
  createdBy?: string | null;
  createdAt: number;
}

/** The title + platform/format + games a submission proposes (or a template's
 *  current values), used as the unit of comparison for the admin diff + dedup. */
export interface TemplateContent {
  title: string;
  platform?: string;
  format?: CopyFormat;
  games: TemplateGame[];
}

/** A pending/decided community compilation submission, as the admin queue and the
 *  submitter's contributions page see it. */
export interface CompilationTemplateSubmission {
  id: string;
  submitter: string;
  submitterName: string;
  kind: "new" | "edit";
  templateId: string | null;
  title: string;
  platform?: string;
  format?: CopyFormat;
  games: TemplateGame[];
  before: TemplateContent | null; // snapshot at submit time (edits)
  current: TemplateContent | null; // the live template now (edits), for the diff
  status: SubmissionStatus;
  reviewerName: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
  reward: number | null;
  createdAt: number;
  deletedAt: number | null; // admin soft-delete (removed from the active queue)
}

/** Trim names, normalize genres, and drop games with no name. */
export function normalizeTemplateGames(games: TemplateGame[]): TemplateGame[] {
  const out: TemplateGame[] = [];
  for (const g of games) {
    const name = (g.name ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      hours: g.hours != null && Number.isFinite(g.hours) && g.hours > 0 ? g.hours : undefined,
      image: g.image?.trim() || undefined,
      rawgId: g.rawgId,
      catalogId: g.catalogId,
      genres: g.genres && g.genres.length ? normalizeList(g.genres) : undefined,
      released: g.released?.trim() || undefined,
      metacritic: g.metacritic ?? undefined,
      platforms: g.platforms && g.platforms.length ? g.platforms : undefined,
      developers: g.developers && g.developers.length ? g.developers : undefined,
      esrb: g.esrb?.trim() || undefined,
    });
  }
  return out;
}

/** Canonicalize a template's content for storage / comparison. */
export function normalizeTemplate(title: string, games: TemplateGame[]): TemplateContent {
  return { title: title.trim(), games: normalizeTemplateGames(games) };
}

/** Validate a template submission. Returns an error message, or null when ok. */
export function validateTemplateSubmission(title: string, games: TemplateGame[]): string | null {
  if (!title.trim()) return "A title is required.";
  if (normalizeTemplateGames(games).length === 0) return "Add at least one game.";
  return null;
}

/** A games-list change between two template versions, for the admin edit diff. */
export interface TemplateDiff {
  titleChanged: { before: string; after: string } | null;
  added: TemplateGame[];
  removed: TemplateGame[];
  changed: { name: string; beforeHours?: number; afterHours?: number }[];
}

const nameKey = (g: TemplateGame) => g.name.trim().toLowerCase();

/** What changed between a template's current content and a proposed edit: the
 *  title, plus games added / removed / changed (matched by name, length diff). */
export function diffTemplate(before: TemplateContent, after: TemplateContent): TemplateDiff {
  const a = normalizeTemplate(before.title, before.games);
  const b = normalizeTemplate(after.title, after.games);
  const beforeByName = new Map(a.games.map((g) => [nameKey(g), g]));
  const afterByName = new Map(b.games.map((g) => [nameKey(g), g]));

  const added = b.games.filter((g) => !beforeByName.has(nameKey(g)));
  const removed = a.games.filter((g) => !afterByName.has(nameKey(g)));
  const changed: TemplateDiff["changed"] = [];
  for (const g of b.games) {
    const prev = beforeByName.get(nameKey(g));
    if (prev && prev.hours !== g.hours) {
      changed.push({ name: g.name, beforeHours: prev.hours, afterHours: g.hours });
    }
  }

  return {
    titleChanged: a.title !== b.title ? { before: a.title, after: b.title } : null,
    added,
    removed,
    changed,
  };
}

/** Whether a proposed edit actually changes anything (title or games). */
export function hasTemplateChanges(before: TemplateContent, after: TemplateContent): boolean {
  const d = diffTemplate(before, after);
  return (
    d.titleChanged != null || d.added.length > 0 || d.removed.length > 0 || d.changed.length > 0
  );
}

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

/** A deterministic, normalized signature of a compilation's content (title,
 *  platform, games) — order-insensitive over games. Two compilations with the same
 *  signature are exact duplicates. Format is excluded: it's a personal attribute,
 *  not part of the shared template. Used client-side for instant dedup and
 *  server-side (passed as a hash) to block a duplicate that's already pending. */
export function templateSignature(c: {
  title: string;
  platform?: string;
  games: TemplateGame[];
}): string {
  return JSON.stringify({
    title: norm(c.title),
    platform: norm(c.platform),
    games: normalizeTemplateGames(c.games)
      .map((g) => `${norm(g.name)}@${g.hours ?? ""}`)
      .sort(),
  });
}

/** A platform label, e.g. "Nintendo Switch", used to tell same-title community
 *  templates apart. Format is intentionally NOT shown: it's a personal attribute
 *  (like cost), not part of the shared template. */
export function templateLabel(t: { platform?: string }): string {
  return t.platform?.trim() ?? "";
}

/** Whether a proposed compilation is an exact duplicate of an existing template —
 *  same title, platform, and games (names + lengths). Format is not part of the
 *  shared template, so it doesn't affect duplicate detection. Used to block
 *  suggesting something already shared. */
export function isDuplicateTemplate(
  draft: TemplateContent,
  templates: { title: string; platform?: string; games: TemplateGame[] }[],
): boolean {
  const sig = templateSignature(draft);
  return templates.some((t) => templateSignature(t) === sig);
}

/** Turn a picked template's games into editable add-form child drafts (no cost or
 *  gameId — those are personal / assigned when the user saves). */
export function templateGamesToChildDrafts(games: TemplateGame[]): CompilationChildDraft[] {
  return normalizeTemplateGames(games).map((g) => ({
    name: g.name,
    hours: g.hours,
    image: g.image,
    rawgId: g.rawgId,
    catalogId: g.catalogId,
    genres: g.genres ?? [],
    released: g.released,
    metacritic: g.metacritic,
    platforms: g.platforms,
    developers: g.developers,
    esrb: g.esrb,
  }));
}
