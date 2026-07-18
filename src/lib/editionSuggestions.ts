// "Link another edition" suggestions (issue 9f420872): with no search typed,
// the Family Breakdown used to offer just the first few games in collection
// order — useless in a big library. Instead, rank the collection by TITLE
// similarity to the game being linked, so "Shin Megami Tensei V: Vengeance"
// surfaces "Shin Megami Tensei V" and "Shin Megami Tensei III: Nocturne HD
// Remaster" first. Pure and unit-tested; the modal just consumes the list.

import type { Game } from "../types";

// Words that appear in almost every title/edition name and would otherwise
// create false kinship ("...of the...", "Definitive Edition" vs "Gold
// Edition"). Numerals and subtitles are deliberately KEPT — sharing "V" or
// "Tensei" is exactly the signal we want.
const NOISE_WORDS = new Set([
  "the", "a", "an", "of", "and", "for",
  "edition", "remaster", "remastered", "remake", "definitive", "deluxe",
  "complete", "collection", "hd", "goty", "game", "year",
]);

/** A title reduced to its distinctive lowercase words: punctuation stripped,
 *  noise words dropped. Falls back to ALL words when everything was noise
 *  ("The Collection" still needs something to match on). */
export function titleTokens(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
  const distinctive = words.filter((w) => !NOISE_WORDS.has(w));
  return distinctive.length > 0 ? distinctive : words;
}

/** How alike two titles read, 0..1 — Jaccard overlap of their distinctive
 *  words. "SMT V: Vengeance" vs "SMT V" shares almost everything; unrelated
 *  titles share nothing and score 0. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(titleTokens(a));
  const tb = new Set(titleTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** The default candidates for linking an edition to `game`: its own family
 *  excluded, kindred titles first (similarity desc, collection order as the
 *  tie-break), then — when fewer than `limit` titles are related at all — the
 *  rest of the collection in order, so a small library still shows options. */
export function suggestedEditionCandidates(games: Game[], game: Game, limit = 6): Game[] {
  const eligible = games.filter(
    (g) => g.id !== game.id && !(game.familyId != null && g.familyId === game.familyId),
  );
  const scored = eligible.map((g, i) => ({ g, i, score: titleSimilarity(game.title, g.title) }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, limit).map((s) => s.g);
}
