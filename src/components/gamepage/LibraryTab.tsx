import { useRef, useState } from "react";
import type { Game, GameCopy } from "../../types";
import { useStore } from "../../store";
import { copyPlatformOptions, canonicalizeTerms, newlyMissingPlatforms } from "../../lib/taxonomy";
import { copyCountSummary, formatLabel, formatUsd, isModifierAcquisition } from "../../lib/copies";
import { AcquisitionBadge } from "../AcquisitionBadge";
import { CopyRowsEditor, copyToRow, rowsToCopies, type CopyRowDraft } from "../CopyRowsEditor";
import { gameToCatalogFields } from "../GameSubmissionForm";

/** What you own: the copies editor (platform, format, cost, note) and the
 *  missing-platform escape hatch. Immediate-write — a platform/format pick or a
 *  row add/remove persists right away; cost and note save when you leave the
 *  field. Incomplete rows (no platform picked yet) simply wait. A compilation
 *  child's copies are owned by the bundle and shown locked, exactly as before.
 *  Each card is one instance — a bundle copy of the same game manages its own
 *  copies on its own card. */
export function LibraryTab({
  game,
  screenshots,
}: {
  game: Game;
  /** The catalog's current screenshots, fetched by the page — kept on the
   *  missing-platform suggestion's baseline so approving the platform change
   *  can never wipe them (the diff must start from what's really stored). */
  screenshots: string[];
}) {
  const { setGameCopies, submitGameSubmission, platformList, cloud } = useStore();

  const isWishlist = game.status === "wishlist";
  const inCompilation = game.compilationId != null;

  const [rows, setRows] = useState<CopyRowDraft[]>((game.copies ?? []).map(copyToRow));
  // "Missing platform?" escape hatch: widen the choices from this game's
  // verified release list to the full master list.
  const [allPlatforms, setAllPlatforms] = useState(false);

  const existing = (game.copies ?? []).map((c) => c.platform).filter(Boolean);
  const platformOptions = copyPlatformOptions(
    allPlatforms ? undefined : game.platforms,
    platformList,
    existing,
  );

  const verifiedPlatforms = canonicalizeTerms(game.platforms, platformList);
  const hasGlobalTarget = Boolean(game.rawgId || game.catalogId);
  const canRequestPlatform = verifiedPlatforms.length > 0 && hasGlobalTarget;

  // The last copies actually persisted — commits diff against this, so a blur
  // with nothing new is silent, and the missing-platform suggestion only ever
  // fires for platforms added since the previous commit (never re-filed).
  const committedRef = useRef<GameCopy[]>(rowsToCopies((game.copies ?? []).map(copyToRow)));

  const commit = (nextRows: CopyRowDraft[]) => {
    const next = rowsToCopies(nextRows);
    const prev = committedRef.current;
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    committedRef.current = next;
    void setGameCopies(game.id, next);

    // A copy on a platform this catalogued game isn't verified for quietly
    // files a platform edit-suggestion (the copy itself is already saved) —
    // the same flow Add-Game uses. Baseline advances regardless of the RPC's
    // fate so a failure can't re-file on the next blur.
    if (cloud && hasGlobalTarget) {
      const missing = newlyMissingPlatforms(
        next.map((c) => c.platform),
        prev.map((c) => c.platform),
        game.platforms,
        platformList,
      );
      if (missing.length > 0) {
        const baseline = { ...gameToCatalogFields(game), platforms: verifiedPlatforms, screenshots };
        void submitGameSubmission({
          kind: "edit",
          catalogId: game.catalogId ?? null,
          rawgId: game.rawgId ?? null,
          proposed: {
            ...baseline,
            platforms: canonicalizeTerms([...verifiedPlatforms, ...missing], platformList),
          },
          before: baseline,
        }).catch(() => {});
      }
    }
  };

  // Discrete edits (platform/format/acquisition picks, row add/remove) persist
  // immediately; text (cost, note, provider) waits for focus to leave the
  // section so half-typed values never land. The shape captures everything
  // non-textual about the rows.
  const shapeOf = (rs: CopyRowDraft[]) =>
    JSON.stringify(rs.map((r) => [r.id, r.platform, r.format, r.acquisition]));

  const onRowsChange = (nextRows: CopyRowDraft[]) => {
    const discrete = shapeOf(nextRows) !== shapeOf(rows);
    setRows(nextRows);
    if (discrete) commit(nextRows);
  };

  const onSectionBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Only when focus actually leaves the section (row-to-row tabbing commits
    // too — harmless, the diff no-ops unless something changed).
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    commit(rows);
  };

  if (inCompilation) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">Copies you own</span>
        <div className="rounded-xl border border-line bg-panel/50 p-2.5 text-[11px] text-muted">
          {(game.copies ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="truncate">
                  {c.platform || "—"}
                  {c.format ? ` (${formatLabel(c.format)})` : ""}
                </span>
                {isModifierAcquisition(c.acquisition) && (
                  <AcquisitionBadge acquisition={c.acquisition} provider={c.provider} />
                )}
              </span>
              <span className="shrink-0 text-accent">
                {c.cost != null ? formatUsd(c.cost) : "—"}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-subtle">
          Cost, platform &amp; format are managed by the{" "}
          <span className="text-ink">{game.compilationName ?? "compilation"}</span> compilation —
          open it from the card to change them.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2" onBlur={onSectionBlur}>
        <span className="text-sm text-muted">
          {isWishlist ? "Version you want" : "Copies you own"}
          {rows.length > 0 && (
            <span className="text-subtle">
              {" "}
              ({isWishlist
                ? rows.length
                : copyCountSummary(rows.map((r) => ({ format: r.format || undefined })))})
            </span>
          )}
        </span>
        <span className="text-xs text-subtle">
          {isWishlist
            ? "The platform/edition you plan to get"
            : "Platform, format, cost & an optional note — saved as you go"}
        </span>
        {rows.length === 0 && (
          <p className="text-xs text-subtle">
            {isWishlist ? "No version chosen yet." : "No copies recorded yet."}
          </p>
        )}
        <CopyRowsEditor
          rows={rows}
          onChange={onRowsChange}
          platformOptions={platformOptions}
          showCost={!isWishlist}
          addLabel={isWishlist ? "Add a version" : "Add a copy"}
        />
        {canRequestPlatform && !allPlatforms && (
          <button
            type="button"
            onClick={() => setAllPlatforms(true)}
            className="self-start text-xs font-medium text-accent underline-offset-2 transition hover:underline"
          >
            Missing platform? Choose from all platforms
          </button>
        )}
        {canRequestPlatform && allPlatforms && (
          <p className="text-xs text-subtle">
            Showing every platform. Pick one this game isn&apos;t listed on and we&apos;ll send a
            request to add it to the game&apos;s release list — your copy is saved right away.
          </p>
        )}
      </div>
    </div>
  );
}
