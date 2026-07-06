// CSV bulk-add (issue 00efda53): turn a spreadsheet export into addGame-ready
// drafts, entirely offline — parse the file, auto-map its headers, validate and
// canonicalize each row, and flag duplicates — so the import modal only has to
// render the plan and feed the addable rows to the store. Rows become plain
// custom games (no catalog matching): exactly the data given, importable
// instantly; covers/identity can be added later through the usual edit flows.

import type { CopyFormat, Game, GameStatus } from "../types";
import type { FinishTag } from "./finishTags";
import { canonicalizeTerms } from "./taxonomy";
import { parsePlaytime } from "./playtime";

// ── CSV parsing (RFC 4180-ish) ───────────────────────────────────────────────

/** Parse CSV text into rows of fields: quoted fields, "" escapes, embedded
 *  commas/newlines inside quotes, CRLF or LF, and a UTF-8 BOM. Fully empty
 *  rows are dropped. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((f) => f.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\n") {
      endRow();
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  endRow();
  return rows;
}

// ── Header mapping ───────────────────────────────────────────────────────────

export type CsvField =
  | "title"
  | "platform"
  | "format"
  | "cost"
  | "hours"
  | "played"
  | "status"
  | "note";

/** Recognized header spellings per field (normalized: lowercased, non-alphanumerics
 *  collapsed to single spaces). First alias match wins; first COLUMN wins a tie. */
const HEADER_ALIASES: Record<CsvField, string[]> = {
  title: ["title", "game", "name", "game title", "game name"],
  platform: ["platform", "system", "console"],
  format: ["format", "copy format", "media"],
  cost: ["cost", "price", "paid", "price paid", "cost usd", "price usd", "amount"],
  hours: ["length", "hours", "game length", "how long", "hours to beat", "hltb"],
  played: ["played", "hours played", "playtime", "play time", "time played", "played hours"],
  status: ["status", "board", "shelf", "state"],
  note: ["note", "notes", "comment", "comments"],
};

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Map a header row to fields. Returns the per-column field (null = ignored)
 *  and, for the preview, which original header each field matched. */
export function mapHeaders(headerRow: string[]): {
  columns: (CsvField | null)[];
  mapped: Partial<Record<CsvField, string>>;
  unmapped: string[];
} {
  const columns: (CsvField | null)[] = [];
  const mapped: Partial<Record<CsvField, string>> = {};
  const unmapped: string[] = [];
  for (const raw of headerRow) {
    const norm = normalizeHeader(raw);
    const field = (Object.keys(HEADER_ALIASES) as CsvField[]).find(
      (f) => !(f in mapped) && HEADER_ALIASES[f].includes(norm),
    );
    columns.push(field ?? null);
    if (field) mapped[field] = raw.trim();
    else if (raw.trim()) unmapped.push(raw.trim());
  }
  return { columns, mapped, unmapped };
}

// ── Row values ───────────────────────────────────────────────────────────────

function parseCost(raw: string): number | undefined {
  const cleaned = raw.replace(/[$€£,\s]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

function parseFormat(raw: string): CopyFormat | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (/^(physical|phys|disc|disk|cart|cartridge|box|boxed)$/.test(s)) return "physical";
  if (/^(digital|download|downloaded|dl)$/.test(s)) return "digital";
  if (/^(dlc|expansion|addon|add on)$/.test(s)) return "dlc";
  return undefined;
}

/** Destination board for a status cell. "Playing" is deliberately NOT honored —
 *  Now Playing is entered through the buy/start flow (slots + economy), never a
 *  raw import — those rows land in the Bazaar with a warning. */
function parseStatus(raw: string): { status: Extract<GameStatus, "backlog" | "wishlist" | "finished">; finishTag: FinishTag | null; warning?: string } {
  const s = raw.trim().toLowerCase();
  if (!s || /^(backlog|bazaar|owned|own|library|todo)$/.test(s)) {
    return { status: "backlog", finishTag: null };
  }
  if (/^(wishlist|wish|want|wanted)$/.test(s)) return { status: "wishlist", finishTag: null };
  if (/^(completed|complete|100|100%|mastered)$/.test(s)) {
    return { status: "finished", finishTag: "completed" };
  }
  if (/^(finished|finish|beat|beaten|done|cleared)$/.test(s)) {
    return { status: "finished", finishTag: "beaten" };
  }
  if (/^(playing|in progress|started|now playing)$/.test(s)) {
    return {
      status: "backlog",
      finishTag: null,
      warning: `Status "${raw.trim()}" isn't importable — Now Playing is entered by buying/starting a game, so this row lands in the Bazaar`,
    };
  }
  return {
    status: "backlog",
    finishTag: null,
    warning: `Unrecognized status "${raw.trim()}" — added to the Bazaar`,
  };
}

// ── The import plan ──────────────────────────────────────────────────────────

/** One addGame-ready draft built from a CSV row. */
export interface CsvDraft {
  title: string;
  platform?: string; // canonicalized against the master list
  format?: CopyFormat;
  cost?: number;
  hours?: number; // game length
  playedHours?: number;
  status: Extract<GameStatus, "backlog" | "wishlist" | "finished">;
  finishTag: FinishTag | null;
  note?: string;
}

export interface CsvRowPlan {
  /** 1-based line in the file (header = line 1). */
  line: number;
  /** The parseable draft; null when the row can't be imported at all. */
  draft: CsvDraft | null;
  action: "add" | "skip-duplicate" | "skip-invalid";
  /** Human warnings (dropped platform, coerced status, …); never blockers. */
  issues: string[];
}

export interface CsvImportPlan {
  rows: CsvRowPlan[];
  mapped: Partial<Record<CsvField, string>>;
  unmapped: string[];
  addable: number;
  duplicates: number;
  invalid: number;
}

const dupKey = (title: string, platform: string | undefined) =>
  `${title.trim().toLowerCase()}|${(platform ?? "").toLowerCase()}`;

/** Build the full import plan from raw CSV text. Returns an error string for a
 *  file that can't be understood at all (no rows / no title column). */
export function buildImportPlan(
  text: string,
  ctx: { platformList: string[]; library: Pick<Game, "title" | "copies" | "status">[] },
): CsvImportPlan | { error: string } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { error: "That file is empty." };
  const { columns, mapped, unmapped } = mapHeaders(rows[0]);
  if (!("title" in mapped)) {
    return {
      error:
        'No game-title column found. The first row must be a header that includes a "Title" (or "Game"/"Name") column.',
    };
  }
  if (rows.length === 1) return { error: "Only a header row — there are no games to import." };

  // Everything you already have, keyed title|platform AND title alone, so a
  // platform-less CSV row still flags against an owned copy of that title.
  const owned = new Set<string>();
  for (const g of ctx.library) {
    owned.add(dupKey(g.title, undefined));
    for (const c of g.copies ?? []) owned.add(dupKey(g.title, c.platform));
  }

  const seen = new Set<string>();
  const plans: CsvRowPlan[] = [];
  let addable = 0;
  let duplicates = 0;
  let invalid = 0;

  for (let r = 1; r < rows.length; r++) {
    const line = r + 1;
    const cells = rows[r];
    const cell = (f: CsvField) => {
      const i = columns.indexOf(f);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const issues: string[] = [];

    const title = cell("title");
    if (!title) {
      plans.push({ line, draft: null, action: "skip-invalid", issues: ["No game title"] });
      invalid++;
      continue;
    }

    // Platform: canonicalized against the controlled master list; unknown terms
    // are dropped (the server would reject them) but the game still imports.
    const rawPlatform = cell("platform");
    let platform: string | undefined;
    if (rawPlatform) {
      [platform] = canonicalizeTerms([rawPlatform], ctx.platformList);
      if (!platform) {
        issues.push(`Unknown platform "${rawPlatform}" — imported without one`);
      }
    }

    const rawCost = cell("cost");
    const cost = parseCost(rawCost);
    if (rawCost && cost === undefined) issues.push(`Couldn't read the cost "${rawCost}"`);

    const rawHours = cell("hours");
    const hours = rawHours ? (parsePlaytime(rawHours) ?? undefined) : undefined;
    if (rawHours && hours === undefined) issues.push(`Couldn't read the length "${rawHours}"`);

    const rawPlayed = cell("played");
    const playedHours = rawPlayed ? (parsePlaytime(rawPlayed) ?? undefined) : undefined;
    if (rawPlayed && playedHours === undefined) {
      issues.push(`Couldn't read the hours played "${rawPlayed}"`);
    }

    const { status, finishTag, warning } = parseStatus(cell("status"));
    if (warning) issues.push(warning);

    const draft: CsvDraft = {
      title,
      platform,
      format: parseFormat(cell("format")),
      cost,
      hours,
      playedHours,
      status,
      finishTag,
      note: cell("note") || undefined,
    };

    // Duplicates: a same title+platform already in the library, an owned copy of
    // a platform-less row's title, or an earlier row in this same file.
    const key = dupKey(title, platform);
    const inLibrary = owned.has(key) || (!platform && owned.has(dupKey(title, undefined)));
    const inFile = seen.has(key);
    seen.add(key);
    if (inLibrary || inFile) {
      plans.push({
        line,
        draft,
        action: "skip-duplicate",
        issues: [inFile ? "Duplicated earlier in this file" : "Already in your library", ...issues],
      });
      duplicates++;
      continue;
    }

    plans.push({ line, draft, action: "add", issues });
    addable++;
  }

  return { rows: plans, mapped, unmapped, addable, duplicates, invalid };
}
