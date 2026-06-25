import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ImagePlus, Lightbulb, Pencil, RotateCcw } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { fetchGameCover } from "../lib/gamedata";
import { parsePlaytime, formatLength } from "../lib/playtime";
import { mergePlatforms } from "../lib/platforms";
import {
  type CatalogFields,
  diffCatalog,
  parseDevelopers,
  validateSubmission,
  MAX_SCREENSHOTS,
} from "../lib/submissions";
import { toast } from "../lib/toast";

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

/** The shared/global catalog metadata of a game, as a submission baseline. Uses
 *  the stock (catalog) cover, not a user's personal custom cover. */
export function gameToCatalogFields(game: Game): CatalogFields {
  return {
    title: game.title,
    image: game.stockImage ?? game.image ?? "",
    platforms: game.platforms ?? [],
    genres: game.genres ?? [],
    developers: game.developers ?? [],
    released: game.released ?? "",
    hours: game.hours ?? null,
    // Screenshots aren't carried on a Game; the form loads the catalog's current
    // set on open (for edits) so the diff baseline is accurate.
    screenshots: [],
  };
}

/** A "Suggest edit" button that opens a pre-populated submission form for a game.
 *  Shown on every master game detail view (owner or visitor). */
export function SuggestEditButton({ game, className }: { game: Game; className?: string }) {
  const [open, setOpen] = useState(false);
  const current = gameToCatalogFields(game);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition hover:border-brand/50 hover:text-ink"
        }
      >
        <Pencil size={13} className="text-accent" /> Suggest edit
      </button>
      {open && (
        <GameSubmissionForm
          kind="edit"
          catalogId={game.catalogId ?? null}
          rawgId={game.rawgId ?? null}
          before={current}
          initial={current}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** A removable-chip list editor (platforms / genres). */
function ChipList({
  label,
  hint,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    if (!draft.trim()) return;
    // Accept a comma-delimited string so several can be added at once, e.g.
    // "PS5, Xbox Series X/S, PC". mergePlatforms trims, dedupes and drops blanks.
    onChange(mergePlatforms(values, draft.split(",")));
    setDraft("");
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted">
        {label} <span className="text-xs text-subtle">{hint}</span>
      </span>
      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 && <span className="text-xs text-subtle">None listed.</span>}
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-xs text-ink"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
              className="text-subtle transition hover:text-danger"
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

/** Propose a catalog edit or a brand-new game. Submissions go to the moderation
 *  queue — nothing reaches the global catalog until an admin approves. */
export function GameSubmissionForm({
  kind,
  catalogId,
  rawgId,
  before,
  initial,
  onClose,
}: {
  kind: "edit" | "new";
  catalogId: string | null;
  rawgId: number | null;
  before: CatalogFields | null;
  initial: CatalogFields;
  onClose: () => void;
}) {
  const { submitGameSubmission, uploadCatalogCover, fetchGameScreenshots, submissionReward } = useStore();
  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  const [title, setTitle] = useState(initial.title);
  const [image, setImage] = useState(initial.image);
  const [platforms, setPlatforms] = useState<string[]>(initial.platforms);
  const [genres, setGenres] = useState<string[]>(initial.genres);
  const [developersText, setDevelopersText] = useState(initial.developers.join(", "));
  const [released, setReleased] = useState(initial.released);
  const [hoursText, setHoursText] = useState(formatLength(initial.hours ?? undefined));
  const [screenshots, setScreenshots] = useState<string[]>(initial.screenshots);
  const [shotUploading, setShotUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [working, setWorking] = useState(false);

  // Screenshots aren't carried on a Game, so load the catalog's current set on
  // open (edit mode). It seeds both the editor and the diff baseline, so proposing
  // no screenshot change reads as no change. New-game submissions start empty.
  const [baseShots, setBaseShots] = useState<string[]>(before?.screenshots ?? initial.screenshots);
  useEffect(() => {
    if (kind !== "edit") return;
    let active = true;
    void fetchGameScreenshots({ rawgId, catalogId }).then((shots) => {
      if (!active) return;
      setBaseShots(shots);
      setScreenshots(shots);
    });
    return () => {
      active = false;
    };
  }, [kind, rawgId, catalogId, fetchGameScreenshots]);

  // The cover this game shipped with (from RAWG), so you can propose reverting to
  // it even after a community edit replaced it.
  const [rawgCover, setRawgCover] = useState<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    if (rawgId) void fetchGameCover(rawgId).then((url) => active && setRawgCover(url));
    return () => {
      active = false;
    };
  }, [rawgId]);

  const proposed: CatalogFields = {
    title,
    image,
    platforms,
    genres,
    developers: parseDevelopers(developersText),
    released,
    hours: parsePlaytime(hoursText) ?? null,
    screenshots,
  };

  // The diff/validation baseline carries the catalog's current screenshots (loaded
  // above), so editing only other fields doesn't read as a screenshot change.
  const baseline: CatalogFields = { ...(before ?? initial), screenshots: baseShots };
  const changes = kind === "edit" ? diffCatalog(baseline, proposed) : [];
  const error = validateSubmission(baseline, proposed, kind);

  async function onUpload(file: File) {
    setUploading(true);
    const url = await uploadCatalogCover(file);
    setUploading(false);
    if (url) setImage(url);
  }

  // Upload one or more screenshots (reuses the catalog-image uploader) and append
  // them, honoring the cap — only as many as there's room for are uploaded.
  async function onAddScreenshots(files: File[]) {
    const room = MAX_SCREENSHOTS - screenshots.length;
    const picked = room > 0 ? files.slice(0, room) : [];
    if (picked.length === 0) return;
    setShotUploading(true);
    const urls: string[] = [];
    for (const file of picked) {
      const url = await uploadCatalogCover(file);
      if (url) urls.push(url);
    }
    setShotUploading(false);
    if (urls.length === 0) return;
    setScreenshots((prev) => {
      const next = [...prev];
      for (const url of urls) if (!next.includes(url)) next.push(url);
      return next.slice(0, MAX_SCREENSHOTS);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // This form is portaled to <body>, but React still bubbles the synthetic
    // submit event up the component tree to any enclosing <form> (the Edit/Add
    // Game forms). Stop it so suggesting an edit never also triggers their save
    // (which fired a second, misleading "Saved …" toast).
    e.stopPropagation();
    if (error) {
      toast(error, Lightbulb);
      return;
    }
    setWorking(true);
    // Snapshot the real baseline (incl. the catalog's current screenshots) so the
    // admin diff and any later revert have accurate prior values.
    const submitBefore = before ? { ...before, screenshots: baseShots } : null;
    const ok = await submitGameSubmission({ kind, catalogId, rawgId, proposed, before: submitBefore });
    setWorking(false);
    if (ok) onClose();
  }

  // Portal to <body> so this form is never nested inside another <form> (the
  // Edit Game and Add Game screens are forms) — nested forms break submission.
  return createPortal(
    // No backdrop click-to-close: this form holds in-progress work — close via ✕.
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="min-w-0 truncate font-display text-xl text-ink">
            {kind === "new" ? "Suggest a new game" : "Suggest an edit"}
          </h2>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 p-4">
          <p className="rounded-lg border border-line bg-panel/50 p-2.5 text-xs text-muted">
            <Lightbulb size={13} className="mr-1 inline text-accent" />
            Your suggestion is reviewed by a moderator. Once approved it updates the game for everyone
            {submissionReward > 0 ? `, and you earn up to ${submissionReward} coins` : ""}.
          </p>

          <label className="text-sm text-muted">
            Title
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </label>

          <div className="flex items-center gap-3">
            <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-panel">
              {image ? (
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-2xl opacity-50">🎮</div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm text-muted">Cover art</span>
              <input
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="Image URL (https://…)"
                className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
              />
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink transition hover:border-brand/50">
                  <ImagePlus size={14} className="text-accent" /> {uploading ? "Uploading…" : "Upload image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUpload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {image !== initial.image && (
                  <button
                    type="button"
                    onClick={() => setImage(initial.image)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:text-accent"
                  >
                    <RotateCcw size={14} /> Restore default
                  </button>
                )}
                {rawgCover && image !== rawgCover && (
                  <button
                    type="button"
                    onClick={() => setImage(rawgCover)}
                    title="Use the cover this game originally shipped with (from RAWG)"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:text-accent"
                  >
                    <RotateCcw size={14} /> Restore original
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-muted">
              Release date
              <input type="date" value={released} onChange={(e) => setReleased(e.target.value)} className={inputClass} />
            </label>
            <label className="text-sm text-muted">
              Estimated playtime
              <input
                type="text"
                value={hoursText}
                onChange={(e) => setHoursText(e.target.value)}
                placeholder="e.g. 12h or 1h 30m"
                className={inputClass}
              />
            </label>
          </div>

          <ChipList
            label="Platforms"
            hint="— where this game released; add several with commas"
            placeholder="e.g. PlayStation 5, Xbox Series X/S, PC"
            values={platforms}
            onChange={setPlatforms}
          />
          <ChipList
            label="Genres"
            hint="— add several with commas, e.g. Horror, Survival"
            placeholder="e.g. Horror, Survival"
            values={genres}
            onChange={setGenres}
          />

          <label className="text-sm text-muted">
            Developer{" "}
            <span className="text-xs text-subtle">— separate multiple with commas</span>
            <input
              type="text"
              value={developersText}
              onChange={(e) => setDevelopersText(e.target.value)}
              placeholder="e.g. CD PROJEKT RED, CD PROJEKT"
              className={inputClass}
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">
              Screenshots{" "}
              <span className="text-xs text-subtle">
                — a few preview shots ({screenshots.length}/{MAX_SCREENSHOTS})
              </span>
            </span>
            <div className="flex flex-wrap gap-2">
              {screenshots.map((url, i) => (
                <div
                  key={url}
                  className="relative aspect-[16/9] w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-panel"
                >
                  <img src={url} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setScreenshots((prev) => prev.filter((u) => u !== url))}
                    aria-label={`Remove screenshot ${i + 1}`}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white transition hover:bg-danger"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {screenshots.length < MAX_SCREENSHOTS && (
                <label className="inline-flex aspect-[16/9] w-28 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-panel text-xs text-muted transition hover:border-brand/50 hover:text-ink">
                  <ImagePlus size={16} className="text-accent" />
                  {shotUploading ? "Uploading…" : "Add"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={shotUploading}
                    onChange={(e) => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      if (files.length) void onAddScreenshots(files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {kind === "edit" && (
            <div className="rounded-xl border border-line bg-panel/40 p-3 text-xs">
              <div className="mb-1 font-medium text-ink">Your proposed changes</div>
              {changes.length === 0 ? (
                <p className="text-subtle">No changes yet — edit a field above.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {changes.map((c) => (
                    <li key={c.key} className="text-muted">
                      <span className="text-ink">{c.label}:</span>{" "}
                      <span className="text-subtle line-through">{c.before}</span> →{" "}
                      <span className="text-accent">{c.after}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-1 flex gap-2">
            <button
              type="submit"
              disabled={working || error != null}
              title={error ?? undefined}
              className="flex-1 rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working ? "Submitting…" : "Submit for review"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-panel px-4 py-2.5 font-medium text-ink transition hover:brightness-95"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
