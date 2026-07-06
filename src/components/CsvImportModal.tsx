import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  CopyX,
  FileUp,
  Loader2,
  X,
} from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { buildImportPlan, type CsvImportPlan, type CsvRowPlan } from "../lib/csvImport";
import { newCopyId } from "../lib/copies";
import { formatUsd } from "../lib/copies";
import { STATUS_LABEL } from "../lib/status";

/** Read a File as text. Prefers the modern Blob.text(); falls back to a
 *  FileReader where it's missing (jsdom, older WebViews). */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** Bulk-add from a CSV file (issue 00efda53): pick a spreadsheet export, review
 *  the parsed plan (what imports, what's skipped and why), then add every
 *  addable row through the normal addGame path. Rows are plain custom games —
 *  no per-row catalog lookups — so a big file imports in seconds and works
 *  offline; covers and catalog identity can be added later via the edit flows. */
export function CsvImportModal({ onClose }: { onClose: () => void }) {
  useScrollLock(true);
  const games = useStore((s) => s.games);
  const platformList = useStore((s) => s.platformList);
  const addGame = useStore((s) => s.addGame);

  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<CsvImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = not started; otherwise "imported so far" (done when === addable).
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPickFile(file: File | undefined) {
    setError(null);
    setPlan(null);
    setProgress(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const built = buildImportPlan(await readFileText(file), { platformList, library: games });
      if ("error" in built) setError(built.error);
      else setPlan(built);
    } catch {
      setError("Couldn't read that file.");
    }
  }

  async function runImport() {
    if (!plan || progress != null) return;
    setProgress(0);
    let done = 0;
    for (const row of plan.rows) {
      if (row.action !== "add" || !row.draft) continue;
      const d = row.draft;
      await addGame(
        {
          title: d.title,
          genres: [],
          hours: d.hours,
          playedHours: d.playedHours,
          copies: d.platform
            ? [
                {
                  id: newCopyId(),
                  platform: d.platform,
                  format: d.format,
                  cost: d.cost,
                  note: d.note,
                },
              ]
            : [],
        },
        d.status,
        d.status === "finished" ? d.finishTag : null,
      );
      done++;
      setProgress(done);
    }
  }

  const importing = progress != null && plan != null && progress < plan.addable;
  const finished = progress != null && plan != null && progress >= plan.addable;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-4 shadow-xl sm:p-6"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-ink">Import games from CSV</h2>
            <p className="mt-0.5 text-xs text-muted">
              First row must be a header — a <span className="font-medium text-ink">Title</span>{" "}
              column is required; Platform, Format, Cost, Length, Played and Status are optional.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-panel hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {/* File pick */}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => void onPickFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={importing}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-panel/40 px-3 py-4 text-sm text-muted transition hover:border-brand/50 hover:text-ink disabled:opacity-50"
        >
          <FileUp size={16} className="text-accent" />
          {fileName ? `${fileName} — choose a different file` : "Choose a .csv file"}
        </button>

        {error && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        {plan && (
          <div className="mt-4 flex flex-col gap-3">
            {/* Plan summary */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 font-medium text-accent">
                <CheckCircle2 size={12} /> {plan.addable} to import
              </span>
              {plan.duplicates > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-panel px-2.5 py-1 text-muted">
                  <CopyX size={12} /> {plan.duplicates} skipped as duplicates
                </span>
              )}
              {plan.invalid > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-danger">
                  <CircleSlash size={12} /> {plan.invalid} unreadable
                </span>
              )}
              {plan.unmapped.length > 0 && (
                <span className="text-subtle">
                  Ignored columns: {plan.unmapped.join(", ")}
                </span>
              )}
            </div>

            {/* Row preview — every row, scrollable, with its fate + warnings. */}
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl border border-line bg-panel/30 p-2">
              {plan.rows.map((row) => (
                <PlanRow key={row.line} row={row} />
              ))}
            </ul>

            {finished ? (
              <p className="flex items-center gap-1.5 rounded-xl border border-line bg-panel/40 px-3 py-2.5 text-sm text-ink">
                <CheckCircle2 size={15} className="text-success" /> Imported {progress} game
                {progress === 1 ? "" : "s"}. You can close this window.
              </p>
            ) : (
              <button
                type="button"
                disabled={plan.addable === 0 || importing}
                onClick={() => void runImport()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Importing… {progress}/{plan.addable}
                  </>
                ) : (
                  `Import ${plan.addable} game${plan.addable === 1 ? "" : "s"}`
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** One row of the plan preview: title + destination (or the skip reason) and
 *  any per-row warnings. */
function PlanRow({ row }: { row: CsvRowPlan }) {
  const skipped = row.action !== "add";
  return (
    <li
      className={
        "rounded-lg border px-2.5 py-1.5 text-xs " +
        (skipped ? "border-line/60 bg-panel/40 opacity-70" : "border-line bg-panel/60")
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <span className="min-w-0 truncate font-medium text-ink">
          {row.draft?.title ?? `Line ${row.line}`}
          {row.draft?.platform && <span className="font-normal text-muted"> · {row.draft.platform}</span>}
          {row.draft?.cost != null && <span className="font-normal text-subtle"> · {formatUsd(row.draft.cost)}</span>}
        </span>
        <span className={skipped ? "text-subtle" : "text-accent"}>
          {row.action === "add"
            ? STATUS_LABEL[row.draft!.status]
            : row.action === "skip-duplicate"
              ? "Skipped — duplicate"
              : "Skipped — unreadable"}
        </span>
      </div>
      {row.issues.length > 0 && (
        <p className="mt-0.5 flex items-start gap-1 text-[11px] text-subtle">
          <AlertTriangle size={11} className="mt-0.5 shrink-0 text-accent/70" />
          {row.issues.join(" · ")}
        </p>
      )}
    </li>
  );
}
