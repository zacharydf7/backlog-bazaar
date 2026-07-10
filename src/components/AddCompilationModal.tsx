import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Trash2, Package, Store, Heart, Trophy, Scale, Lightbulb, Check, AlertCircle, type LucideIcon } from "lucide-react";
import type { Compilation, GameMeta, GameStatus } from "../types";
import { useStore } from "../store";
import { sortTerms } from "../lib/taxonomy";
import { parsePlaytime, formatLength, formatPlaytime } from "../lib/playtime";
import { fetchHltbTimes, type HltbTimes } from "../lib/gamedata";
import { formatUsd, newCopyId, totalCost } from "../lib/copies";
import {
  toCents,
  fromCents,
  splitEvenly,
  splitByLength,
  sharesMatchTotal,
  isEvenSplit,
  compilationCopiesOf,
  type CompilationChildDraft,
  type CompilationCopyDraft,
} from "../lib/compilations";
import {
  CopyRowsEditor,
  copyToRow,
  emptyCopyRow,
  type CopyRowDraft,
} from "./CopyRowsEditor";
import {
  validateTemplateSubmission,
  hasTemplateChanges,
  isDuplicateTemplate,
  type CompilationTemplate,
  type TemplateGame,
  type TemplateContent,
} from "../lib/compilationTemplates";
import { orderCompilationChildren } from "../lib/compilationGrouping";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { toast } from "../lib/toast";
import { GameSearchBox } from "./GameSearchBox";
import { type AddDestination, destinationNoun } from "./AddGameModal";

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

const rowInputClass =
  "w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

const DESTINATIONS: { value: AddDestination; label: string; icon: LucideIcon }[] = [
  { value: "backlog", label: "Bazaar", icon: Store },
  { value: "wishlist", label: "Wishlist", icon: Heart },
  { value: "finished", label: "Finished", icon: Trophy },
];

// Per-game landing status (create mode): Bazaar (backlog) or Finished. Labels
// mirror the DESTINATIONS wording so "Bazaar" reads consistently.
const STATUS_TOGGLE: { value: NonNullable<CompilationChildDraft["status"]>; label: string }[] = [
  { value: "backlog", label: "Bazaar" },
  { value: "finished", label: "Finished" },
];

// Completion levels mapped to HowLongToBeat times — the same idea as Add Game's
// "How do you want to play?" selector, condensed to fit a batch row. Picking one
// sets the child's length to that estimate.
const LENGTH_STYLES: { key: keyof HltbTimes; label: string }[] = [
  { key: "main", label: "Main" },
  { key: "mainExtra", label: "+Extras" },
  { key: "completionist", label: "100%" },
];

/** The catalog metadata a picked search result carries onto a child's card. */
type PickedMeta = Partial<
  Pick<
    GameMeta,
    | "rawgId"
    | "image"
    | "released"
    | "genres"
    | "metacritic"
    | "platforms"
    | "developers"
    | "esrb"
    | "catalogId"
  >
>;

/** One row in the batch game list: name, optional length, manually-assigned cost
 *  (when editing the breakdown), and any metadata from a picked search result.
 *  `gameId` links the row to an existing child game when editing. */
interface ChildRow {
  id: string;
  gameId?: string;
  name: string;
  length: string;
  cost: string;
  meta: PickedMeta;
  // Explicit per-game status override (Bazaar/Finished). Undefined = follow the
  // container destination (create mode) or keep the game's current status (edit).
  status?: CompilationChildDraft["status"];
  // The game's current status when editing an existing compilation — used to seed
  // the toggle's highlight. Undefined for create-mode rows and newly added ones.
  currentStatus?: GameStatus;
}

function emptyRow(): ChildRow {
  return { id: newCopyId(), name: "", length: "", cost: "", meta: {} };
}

/** Turn the copy-editor rows into container copy drafts. Unlike the standalone
 *  games' rowsToCopies, platform-less rows are KEPT — a wishlisted bundle may
 *  record a format/cost before the platform is known. Rows with nothing at all
 *  are dropped. */
function rowsToContainerCopies(rows: CopyRowDraft[]): CompilationCopyDraft[] {
  return rows
    .filter((r) => r.platform.trim() || r.format || r.cost.trim() || r.note.trim())
    .map((r) => {
      const cost = Number(r.cost);
      return {
        platform: r.platform.trim() || undefined,
        format: r.format || undefined,
        cost: r.cost.trim() && Number.isFinite(cost) && cost >= 0 ? cost : undefined,
        note: r.note.trim() || undefined,
      };
    });
}

function pickedToMeta(m: GameMeta): PickedMeta {
  return {
    rawgId: m.rawgId,
    image: m.image,
    released: m.released,
    genres: m.genres,
    metacritic: m.metacritic,
    platforms: m.platforms,
    developers: m.developers,
    esrb: m.esrb,
    catalogId: m.catalogId,
  };
}

/** Create or edit a Game Compilation: a single purchase (e.g. a remaster
 *  collection) bundling several distinct games. The window is the financial
 *  container — title, total cost, platform, format — and each listed game becomes
 *  its own standalone card. The total cost is split across the children (evenly,
 *  by length, or a manual breakdown). Pass `compilation` to edit an existing one;
 *  it pre-fills from the live store and reconciles the games on save. */
export function AddCompilationModal({
  onClose,
  defaultDestination = "backlog",
  compilation,
}: {
  onClose: () => void;
  defaultDestination?: AddDestination;
  compilation?: Compilation;
}) {
  const {
    addCompilation,
    editCompilation,
    games,
    platformList,
    cloud,
    searchCompilationTemplates,
    submitCompilationTemplate,
  } = useStore();
  // Platforms come from the controlled master list; CopyRowsEditor keeps an
  // existing off-list platform selectable per row on its own.
  const platformOptions = sortTerms(platformList);
  const isEdit = compilation != null;

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  // Existing children (edit mode) — read once to seed the form, in the bundle's
  // display order so the editor's rows match the page/cards (issue 140ac868);
  // saving persists this row order back as the child order.
  const initialRows = useMemo<ChildRow[]>(() => {
    if (!compilation) return [emptyRow(), emptyRow()];
    const children = orderCompilationChildren(
      games.filter((g) => g.compilationId === compilation.id),
      compilation.childOrder,
    );
    if (children.length === 0) return [emptyRow()];
    return children.map((g) => ({
      id: newCopyId(),
      gameId: g.id,
      name: g.title,
      length: g.hours ? formatLength(g.hours) : "",
      cost: String(totalCost(g.copies)),
      currentStatus: g.status,
      // Carry each game's metadata so "Suggest" shares its cover/genres, not blanks.
      meta: {
        image: g.image,
        rawgId: g.rawgId,
        released: g.released,
        genres: g.genres,
        metacritic: g.metacritic,
        platforms: g.platforms,
        developers: g.developers,
        esrb: g.esrb,
        catalogId: g.catalogId,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [title, setTitle] = useState(compilation?.title ?? "");
  // Every copy of the bundle owned (platform + format + cost each). Edit mode
  // seeds from the container's copies (compilationCopiesOf synthesizes the
  // legacy single copy for pre-multi-copy rows).
  const [copyRows, setCopyRows] = useState<CopyRowDraft[]>(() => {
    if (!compilation) return [emptyCopyRow()];
    const seeded = compilationCopiesOf(compilation).map(copyToRow);
    return seeded.length > 0 ? seeded : [emptyCopyRow()];
  });
  // The bundle release-date field is retired (it neither displays nor prices
  // anything anymore); an existing bundle's stored date carries through saves.
  const [released] = useState(compilation?.released?.slice(0, 10) ?? "");
  const [destination, setDestination] = useState<AddDestination>(defaultDestination);
  const [rows, setRows] = useState<ChildRow[]>(initialRows);
  // When on, the per-game cost fields unlock and must sum exactly to the total.
  // Editing only starts with it on when the existing split is actually custom — an
  // even split opens collapsed, matching how it was created.
  const [customSplit, setCustomSplit] = useState(() => {
    if (!compilation) return false;
    const children = games.filter((g) => g.compilationId === compilation.id);
    const shares = children.map((c) => toCents(totalCost(c.copies)));
    return !isEvenSplit(shares, toCents(compilation.totalCost));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // Community templates: matches for the title field (create mode), and the
  // template this draft came from (so "Suggest" can propose an edit + diff).
  const [templateResults, setTemplateResults] = useState<CompilationTemplate[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [source, setSource] = useState<(TemplateContent & { id: string }) | null>(null);
  // "Suggest this compilation" progress: prevents double-submits and gives the
  // in-place confirmation (the toast can sit behind this modal).
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState(false);
  // Set when a suggest attempt is blocked (duplicate / no changes / error), so the
  // button reflects it in place — the toast alone is easy to miss.
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const submitLock = useRef(false);
  const templateReq = useRef(0);
  const skipTemplateSearch = useRef(false);

  // Search shared templates as the title is typed (create mode only).
  useEffect(() => {
    if (isEdit || !cloud) return;
    if (skipTemplateSearch.current) {
      skipTemplateSearch.current = false;
      return;
    }
    const q = title.trim();
    if (q.length < 2) {
      setTemplateResults([]);
      setTemplateOpen(false);
      return;
    }
    const id = ++templateReq.current;
    const handle = setTimeout(async () => {
      const res = await searchCompilationTemplates(q);
      if (id !== templateReq.current) return;
      setTemplateResults(res);
      setTemplateOpen(res.length > 0);
    }, 300);
    return () => clearTimeout(handle);
  }, [title, isEdit, cloud, searchCompilationTemplates]);

  function pickTemplate(t: CompilationTemplate) {
    skipTemplateSearch.current = true;
    setTitle(t.title);
    // Platform, cost and format are personal — left for you to enter — so the same
    // compilation appears once in search regardless of which platform you own it on.
    const newRows: ChildRow[] = t.games.map((g) => ({
      id: newCopyId(),
      name: g.name,
      length: g.hours ? formatLength(g.hours) : "",
      cost: "",
      meta: {
        image: g.image,
        rawgId: g.rawgId,
        catalogId: g.catalogId,
        genres: g.genres,
        released: g.released,
        metacritic: g.metacritic,
        platforms: g.platforms,
        developers: g.developers,
        esrb: g.esrb,
      },
    }));
    setRows(newRows);
    setSource({ id: t.id, title: t.title, games: t.games });
    setTemplateOpen(false);
    // Pre-fill the length chips for the template's games right away.
    loadChips(newRows.map((r) => ({ id: r.id, name: r.name })));
  }

  // The grand total is DERIVED — the sum of every copy's cost — and drives the
  // per-child breakdown exactly as the single total input used to.
  const totalCents = copyRows.reduce((sum, r) => sum + toCents(Number(r.cost) || 0), 0);
  const named = rows.filter((r) => r.name.trim());

  const evenShares = useMemo(
    () => splitEvenly(totalCents, named.length),
    [totalCents, named.length],
  );
  const evenByRowId = useMemo(() => {
    const map = new Map<string, number>();
    named.forEach((r, i) => map.set(r.id, evenShares[i] ?? 0));
    return map;
  }, [named, evenShares]);

  const assignedCents = customSplit
    ? named.reduce((sum, r) => sum + toCents(Number(r.cost) || 0), 0)
    : totalCents;
  const matches = sharesMatchTotal([assignedCents], totalCents);

  function update(id: string, patch: Partial<ChildRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }
  function removeRow(id: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  }

  // HowLongToBeat times per row id, powering each row's completion-level length
  // picker (Main / +Extras / 100%). Kept OUT of `rows` (the draft content) so
  // populating chips never reads as a draft edit — otherwise the "draft changed"
  // reset effect would wipe an in-progress suggest message. undefined = not yet
  // fetched, null = fetched but no times.
  const [hltbByRow, setHltbByRow] = useState<Record<string, HltbTimes | null>>({});

  // Fetch HLTB times for a set of rows and store them by id, so the chips appear
  // right away at the points a game name becomes known — a seeded edit or a picked
  // template. Cloud-only (HLTB is remote).
  function loadChips(items: { id: string; name: string }[]) {
    if (!cloud) return;
    for (const it of items) {
      const name = it.name.trim();
      if (!name) continue;
      void fetchHltbTimes(name)
        .then((times) => setHltbByRow((prev) => ({ ...prev, [it.id]: times ?? null })))
        .catch(() => {});
    }
  }

  function onPick(id: string, meta: GameMeta) {
    update(id, {
      name: meta.title,
      length: meta.hours ? formatLength(meta.hours) : "",
      meta: pickedToMeta(meta),
    });
    setHltbByRow((prev) => ({ ...prev, [id]: null }));
    // Best-effort: refine the length from HowLongToBeat, like Add Game does, and
    // keep the times so the row can offer a completion-level length picker.
    fetchHltbTimes(meta.title)
      .then((times) => {
        if (!times) return;
        const best = times.main ?? times.mainExtra ?? times.completionist;
        setHltbByRow((prev) => ({ ...prev, [id]: times }));
        if (best) update(id, { length: formatLength(best) });
      })
      .catch(() => {});
  }

  // Seed the chips for an existing compilation's games on open (edit mode), so the
  // length options show right away without re-searching each one. Runs once.
  useEffect(() => {
    loadChips(initialRows.map((r) => ({ id: r.id, name: r.name })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The current draft's games as a shareable template (structure only — no cost). */
  function draftTemplateGames(): TemplateGame[] {
    return named.map((r) => ({
      name: r.name.trim(),
      hours: parsePlaytime(r.length) ?? undefined,
      image: r.meta.image,
      rawgId: r.meta.rawgId,
      catalogId: r.meta.catalogId,
      genres: r.meta.genres,
      released: r.meta.released,
      metacritic: r.meta.metacritic,
      platforms: r.meta.platforms,
      developers: r.meta.developers,
      esrb: r.meta.esrb,
    }));
  }

  /** Submit the current title + games to the shared catalog for moderation. If the
   *  draft came from a template and changed it, that's an edit suggestion; else new. */
  async function suggest() {
    // Ref lock (not just state) so rapid clicks in the same tick can't double-submit
    // before the disabled state re-renders. Held across the whole call (including
    // the template lookup below) so the duplicate check can't be raced either.
    if (submitLock.current || suggested) return;
    submitLock.current = true;
    setBlockedMsg(null);
    try {
      const games = draftTemplateGames();
      const err = validateTemplateSubmission(title, games);
      if (err) {
        setBlockedMsg(err);
        toast(err, Lightbulb);
        return;
      }
      const after: TemplateContent = {
        title: title.trim(),
        games,
      };
      // Block submitting something already shared verbatim (same title + games —
      // platform and format are personal, not shared). The title autocomplete only
      // runs in create mode, so look
      // the shared templates up fresh here — otherwise an unchanged edit-mode draft
      // would slip past with no candidates to compare against.
      let shared = templateResults;
      if (cloud) {
        const found = await searchCompilationTemplates(after.title);
        if (found.length) shared = found;
      }
      if (isDuplicateTemplate(after, shared)) {
        const m = "An identical compilation is already shared.";
        setBlockedMsg(m);
        toast(m + " No need to suggest it.", Lightbulb);
        return;
      }
      if (source && !hasTemplateChanges(source, after)) {
        const m = "This already matches the shared compilation.";
        setBlockedMsg(m);
        toast(m, Lightbulb);
        return;
      }
      const isEditSuggestion = source != null && hasTemplateChanges(source, after);
      setSuggesting(true);
      const res = await submitCompilationTemplate({
        kind: isEditSuggestion ? "edit" : "new",
        templateId: isEditSuggestion ? source!.id : null,
        title: after.title,
        // Platform is personal now — shared templates are platform-agnostic.
        platform: undefined,
        games,
        before: isEditSuggestion ? source : null,
      });
      if (res.ok) setSuggested(true);
      else
        setBlockedMsg(
          res.duplicate
            ? "An identical compilation is already awaiting review."
            : "Couldn't submit — please try again.",
        );
    } finally {
      submitLock.current = false;
      setSuggesting(false);
    }
  }

  // Editing the draft clears the suggested/blocked state so the button can retry
  // the new version.
  useEffect(() => {
    setSuggested(false);
    setBlockedMsg(null);
  }, [title, rows, copyRows]);

  function balanceByLength() {
    const lengths = named.map((r) => parsePlaytime(r.length) ?? undefined);
    const shares = splitByLength(totalCents, lengths);
    const byId = new Map<string, number>();
    named.forEach((r, i) => byId.set(r.id, shares[i] ?? 0));
    setRows((rs) =>
      rs.map((r) => (byId.has(r.id) ? { ...r, cost: String(fromCents(byId.get(r.id)!)) } : r)),
    );
    if (!named.some((r) => parsePlaytime(r.length))) {
      toast("Add game lengths to weight the split — using an even split for now", Scale);
    }
  }

  // Format is required on every copy (personal, never shared via templates). A
  // compilation you own (anything but a wishlisted bundle) must record each
  // copy's platform — every copy's platform lands on every child game, so
  // ownership data is never null. Wishlist bundles may omit platforms.
  const ownsBundle = destination !== "wishlist";
  const canSubmit =
    title.trim() !== "" &&
    named.length > 0 &&
    copyRows.length > 0 &&
    copyRows.every((r) => r.format !== "") &&
    (!ownsBundle || copyRows.every((r) => r.platform.trim() !== "")) &&
    (!customSplit || matches);

  // Per-game Bazaar/Finished status is offered when editing (move each existing
  // game) and when creating a compilation that lands in the Bazaar or Finished (a
  // wishlisted bundle has no per-game status).
  const showPerGameStatus = isEdit || destination !== "wishlist";
  // Create-mode default for a row: its override, else the container destination.
  const rowStatus = (r: ChildRow): NonNullable<CompilationChildDraft["status"]> =>
    r.status ?? (destination === "finished" ? "finished" : "backlog");
  // What the per-game toggle highlights. Create mode follows rowStatus. Edit mode
  // reflects the game's current status — mapped to Bazaar/Finished, or null for a
  // status the toggle can't represent (playing/wishlist) until the user picks one;
  // a newly added edit-mode row (no current status) defaults to Bazaar.
  const rowToggleStatus = (r: ChildRow): NonNullable<CompilationChildDraft["status"]> | null => {
    if (r.status) return r.status;
    if (!isEdit) return rowStatus(r);
    if (r.currentStatus === "backlog" || r.currentStatus === "finished") return r.currentStatus;
    return r.currentStatus == null ? "backlog" : null;
  };

  // Two-way sync between the bottom "Add games to" buttons and the per-game
  // toggles. The bottom reflects the games' common status — or none, when they're
  // mixed — and clicking a bottom status re-applies it to every game.
  const effRowStatuses = named.map(rowStatus);
  const commonRowStatus: NonNullable<CompilationChildDraft["status"]> | null =
    destination === "wishlist"
      ? null
      : effRowStatuses.length === 0
        ? destination === "finished"
          ? "finished"
          : "backlog"
        : effRowStatuses.every((s) => s === effRowStatuses[0])
          ? effRowStatuses[0]
          : null;
  // The destination shown/submitted: Wishlist, the common Bazaar/Finished, or null
  // when the games are a mix (so the submit button omits a single destination).
  const effectiveDestination: AddDestination | null =
    destination === "wishlist" ? "wishlist" : commonRowStatus;

  function applyDestination(value: AddDestination) {
    setDestination(value);
    // Clear per-game overrides so Bazaar/Finished act as a master toggle that
    // moves every game (Wishlist hides per-game status entirely).
    if (value !== "wishlist") setRows((rs) => rs.map((r) => ({ ...r, status: undefined })));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const children: CompilationChildDraft[] = named.map((r, i) => ({
      gameId: r.gameId,
      name: r.name.trim(),
      hours: parsePlaytime(r.length) ?? undefined,
      cost: customSplit ? Number(r.cost) || 0 : fromCents(evenShares[i] ?? 0),
      ...r.meta,
      // Edit mode sends only the explicit override (undefined keeps an existing
      // game's status; a new child then defaults to Bazaar). Create mode applies
      // the row's status when landing in Bazaar/Finished (none for a wishlist).
      status: isEdit ? r.status : showPerGameStatus ? rowStatus(r) : undefined,
    }));
    const container = {
      title: title.trim(),
      totalCost: fromCents(totalCents),
      copies: rowsToContainerCopies(copyRows),
      released: released || undefined,
    };
    if (compilation) await editCompilation(compilation.id, container, children);
    // A bundle built from a shared template stays linked to it (source?.id), so
    // the collapsed rollup card can use the template's parent-game art later.
    else await addCompilation(container, children, destination, source?.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8">
      {/* Like the Add Game modal, no backdrop-click-to-close: it holds in-progress
          work, so it only closes via ✕ or Back. */}
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
            <Package size={20} className="text-accent" /> {isEdit ? "Edit compilation" : "Add a compilation"}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 p-4">
          {!isEdit && (
            <p className="text-xs text-muted">
              A compilation is one purchase that bundles several games (e.g. a remaster
              collection). Record what you paid once here; each game below gets its own card,
              with the cost split across them.
            </p>
          )}

          <label className="text-sm text-muted">
            Compilation title
            <div className="relative mt-1">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={() => templateResults.length > 0 && setTemplateOpen(true)}
                onBlur={() => setTimeout(() => setTemplateOpen(false), 150)}
                placeholder="e.g. Super Mario 3D All-Stars"
                className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
              />
              {/* Shared community templates matching the title (create mode). */}
              {!isEdit && templateOpen && templateResults.length > 0 && (
                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
                  <div className="border-b border-line px-3 py-1.5 text-[11px] text-subtle">
                    Community compilations
                  </div>
                  <ul className="max-h-56 overflow-y-auto">
                    {templateResults.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            pickTemplate(t);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-panel"
                        >
                          <Package size={14} className="shrink-0 text-accent" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-ink">{t.title}</div>
                            {/* Show the games (not platform) so same-title bundles are
                                distinguishable — templates are platform-agnostic now. */}
                            {t.games.length > 0 && (
                              <div className="truncate text-[11px] text-subtle">
                                {t.games.map((g) => g.name).join(", ")}
                              </div>
                            )}
                          </div>
                          {/* Tiny covers so otherwise-identical titles are distinguishable. */}
                          <div className="flex shrink-0 gap-0.5">
                            {t.games.slice(0, 3).map((g, i) => (
                              <div key={i} className="h-6 w-4 overflow-hidden rounded-sm border border-line bg-panel">
                                {g.image && <img src={g.image} alt="" className="h-full w-full object-cover" />}
                              </div>
                            ))}
                          </div>
                          <span className="shrink-0 text-[11px] text-subtle">
                            {t.games.length} game{t.games.length === 1 ? "" : "s"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </label>

          {/* Every copy of the bundle owned: platform + format + cost each. The
              grand total is derived from the copies and drives the per-child
              breakdown below; every copy's platform lands on every child game. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">
              Copies you own{" "}
              <span className="text-xs text-subtle">
                — platform{ownsBundle ? "*" : ""} & format* per copy; each copy&apos;s platform is
                added to every game in the bundle
              </span>
            </span>
            <CopyRowsEditor
              rows={copyRows}
              onChange={setCopyRows}
              platformOptions={platformOptions}
              addLabel="Add another copy"
            />
          </div>

          <div className="text-sm text-muted">
            Total spent
            <div className="mt-1 rounded-lg border border-line bg-panel/50 px-3 py-2 font-mono text-ink">
              {formatUsd(fromCents(totalCents))}
              <span className="text-xs text-subtle">
                {" "}
                across {copyRows.length} cop{copyRows.length === 1 ? "y" : "ies"}
              </span>
            </div>
          </div>

          {/* Batch game entry */}
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted">
                Games in this compilation{" "}
                <span className="text-xs text-subtle">— search or type a name</span>
              </span>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={customSplit}
                  onChange={(e) => setCustomSplit(e.target.checked)}
                  className="accent-brand"
                />
                Edit breakdown
              </label>
            </div>

            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl border border-line bg-panel/50 p-2">
                  <div className="flex items-center gap-2">
                    <GameSearchBox
                      value={r.name}
                      onChange={(v) => {
                        update(r.id, { name: v });
                        // Manual rename clears the chips until a game is picked again.
                        setHltbByRow((prev) => ({ ...prev, [r.id]: null }));
                      }}
                      onPick={(meta) => onPick(r.id, meta)}
                      placeholder="Search a game, or type a name"
                      ariaLabel="Game name"
                      className={rowInputClass}
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(r.id)}
                      aria-label="Remove game"
                      className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={r.length}
                      onChange={(e) => update(r.id, { length: e.target.value })}
                      placeholder="Length (e.g. 12h)"
                      aria-label="Length"
                      className="w-28 shrink-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                    />
                    {customSplit ? (
                      <div className="relative w-28 shrink-0">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-subtle">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.cost}
                          onChange={(e) => update(r.id, { cost: e.target.value })}
                          placeholder="Cost"
                          aria-label="Assigned cost"
                          disabled={!r.name.trim()}
                          className="w-full rounded-lg border border-line bg-surface py-1.5 pl-5 pr-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:opacity-50"
                        />
                      </div>
                    ) : (
                      r.name.trim() && (
                        <span className="text-xs text-accent">
                          {formatUsd(fromCents(evenByRowId.get(r.id) ?? 0))}
                          <span className="text-subtle"> (even split)</span>
                        </span>
                      )
                    )}
                    {showPerGameStatus && r.name.trim() && (
                      <div
                        className="ml-auto inline-flex shrink-0 overflow-hidden rounded-lg border border-line"
                        role="group"
                        aria-label="Game status"
                      >
                        {STATUS_TOGGLE.map((s) => {
                          const active = rowToggleStatus(r) === s.value;
                          return (
                            <button
                              key={s.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() => update(r.id, { status: s.value })}
                              className={
                                "px-2.5 py-1 text-xs font-medium transition " +
                                (active
                                  ? "bg-brand text-brand-fg"
                                  : "bg-panel text-muted hover:text-ink")
                              }
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {/* Completion-level length picker — appears once a game is known
                      (picked, or pre-filled from an edit/template) and HowLongToBeat
                      has times, mirroring Add Game. */}
                  {hltbByRow[r.id] && LENGTH_STYLES.some((s) => hltbByRow[r.id]?.[s.key]) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-subtle">Length for:</span>
                      {LENGTH_STYLES.map((s) => {
                        const v = hltbByRow[r.id]?.[s.key];
                        if (!v) return null;
                        const active = r.length === formatLength(v);
                        return (
                          <button
                            key={s.key}
                            type="button"
                            onClick={() => update(r.id, { length: formatLength(v) })}
                            aria-pressed={active}
                            className={
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition " +
                              (active
                                ? "border-brand bg-brand/10 text-accent"
                                : "border-line bg-surface text-muted hover:border-brand/50 hover:text-ink")
                            }
                          >
                            {s.label} <span className="tabular-nums text-subtle">{formatPlaytime(v)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-ink transition hover:border-brand/50"
              >
                <Plus size={15} className="text-accent" /> Add a game
              </button>
              {customSplit && (
                <button
                  type="button"
                  onClick={balanceByLength}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-ink transition hover:border-brand/50"
                >
                  <Scale size={15} className="text-accent" /> Balance by length
                </button>
              )}
            </div>

            {customSplit && (
              <p className={"text-xs " + (matches ? "text-success" : "text-danger")}>
                Assigned {formatUsd(fromCents(assignedCents))} of {formatUsd(fromCents(totalCents))}
                {matches ? " — balanced ✓" : ` — ${formatUsd(fromCents(Math.abs(totalCents - assignedCents)))} ${assignedCents > totalCents ? "over" : "left"}`}
              </p>
            )}
            {isEdit && (
              <p className="text-xs text-subtle">
                Removing a game here deletes its card when you save.
              </p>
            )}
          </div>

          {/* Where the child cards land — creation only (edit keeps each game's status). */}
          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">Add games to</span>
              <div className="grid grid-cols-3 gap-2">
                {DESTINATIONS.map((d) => {
                  const Icon = d.icon;
                  const active = effectiveDestination === d.value;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => applyDestination(d.value)}
                      aria-pressed={active}
                      className={
                        "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition " +
                        (active
                          ? "border-brand bg-brand/10 text-ink"
                          : "border-line bg-panel text-muted hover:border-brand/50")
                      }
                    >
                      <Icon size={15} className={active ? "text-accent" : ""} /> {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEdit
              ? "Save changes"
              : `Add ${named.length || ""} game${named.length === 1 ? "" : "s"}${
                  effectiveDestination ? ` to ${destinationNoun(effectiveDestination)}` : ""
                }`}
          </button>

          {/* Share this compilation's structure with everyone (moderated). Title +
              games only — your cost/platform/format are never shared. The button
              confirms in place + locks after submitting (the toast can be hidden
              behind this modal). */}
          {cloud && (
            <button
              type="button"
              onClick={suggest}
              disabled={suggesting || suggested || blockedMsg != null || title.trim() === "" || named.length === 0}
              className={
                "inline-flex items-center justify-center gap-1.5 self-center text-center text-xs font-medium transition disabled:cursor-not-allowed " +
                (suggested
                  ? "text-success disabled:opacity-100"
                  : blockedMsg
                    ? "text-danger disabled:opacity-100"
                    : "text-muted hover:text-accent disabled:opacity-50")
              }
            >
              {suggesting ? (
                <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" />
              ) : suggested ? (
                <Check size={13} className="shrink-0 text-success" />
              ) : blockedMsg ? (
                <AlertCircle size={13} className="shrink-0 text-danger" />
              ) : (
                <Lightbulb size={13} className="shrink-0 text-accent" />
              )}
              {suggesting
                ? "Submitting…"
                : suggested
                  ? "Suggested — awaiting review"
                  : blockedMsg
                    ? blockedMsg
                    : source
                      ? "Suggest changes to this shared compilation"
                      : "Suggest this compilation for everyone"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
