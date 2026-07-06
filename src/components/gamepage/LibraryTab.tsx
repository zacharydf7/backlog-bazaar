import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crown, Link2, Plus, Trash2, Users } from "lucide-react";
import type { Game, GameCopy } from "../../types";
import { useStore } from "../../store";
import { gameHash } from "../../lib/route";
import { catalogKey } from "../../lib/ownershipMerge";
import { familyName, familyPrimary } from "../../lib/families";
import { hubRepresentative } from "../../lib/gameHub";
import { gameToAddMeta } from "../../lib/addRouting";
import { isInRotation } from "../../lib/status";
import { copyPlatformOptions, canonicalizeTerms, newlyMissingPlatforms } from "../../lib/taxonomy";
import {
  copyCountSummary,
  formatLabel,
  formatUsd,
  isModifierAcquisition,
  ownedPlatformSummary,
  ownershipLabel,
} from "../../lib/copies";
import { AcquisitionBadge } from "../AcquisitionBadge";
import { AddGameModal } from "../AddGameModal";
import { CopyRowsEditor, copyToRow, rowsToCopies, type CopyRowDraft } from "../CopyRowsEditor";
import { gameToCatalogFields } from "../GameSubmissionForm";
import { FamilyHub } from "../FamilyHub";
import { PlatformBadge } from "../PlatformBadge";
import { StatusBadge } from "../StatusBadge";

/** The hub's instance control center: every connected record the player owns
 *  of this title, each as its own sub-card — platform tags, its underlying
 *  status, and its copies editor (platform, format, cost, note) — plus the
 *  Game Family tools for binding listed copies into one card or severing the
 *  link, without leaving the page. A single-instance hub renders the editor
 *  bare, exactly like the old per-card Library pane. */
export function LibraryTab({
  hub,
  screenshots,
  screenshotsKey,
}: {
  /** Every instance in the game hub, collection order. */
  hub: Game[];
  /** The catalog's current screenshots fetched by the page (the hub
   *  representative's identity) — kept on the missing-platform suggestion's
   *  baseline so approving the platform change can never wipe them. */
  screenshots: string[];
  /** The catalog identity `screenshots` belongs to; an instance with a
   *  different identity (a family-linked remaster) fetches its own baseline. */
  screenshotsKey: string | null;
}) {
  const multi = hub.length > 1;
  return (
    <div className="flex flex-col gap-4">
      {multi ? (
        <div className="flex flex-col gap-3">
          {hub.map((m) => (
            <InstanceSection
              key={m.id}
              game={m}
              hub={hub}
              pageScreenshots={screenshots}
              pageScreenshotsKey={screenshotsKey}
            />
          ))}
        </div>
      ) : (
        <InstanceCopies game={hub[0]} screenshots={screenshots} />
      )}
      <AddPlatformBlock hub={hub} />
      <FamilyLinkBlock hub={hub} />
    </div>
  );
}

/** "Own it on another platform?" — records a new-platform copy right from the
 *  hub instead of routing through the sidebar's Add Game: the button opens the
 *  Add Game form with this game pre-picked (title, catalog identity, cover,
 *  verified platforms), so only the platform/format/cost are left to fill. All
 *  the usual routing applies — a new platform becomes its own card, a
 *  duplicate version blocks, a fulfilled wishlist entry warns. */
function AddPlatformBlock({ hub }: { hub: Game[] }) {
  const [open, setOpen] = useState(false);
  const rep = hubRepresentative(hub);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel/30 px-3 py-2">
      <div className="min-w-0">
        <div className="mb-0.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent">
          <Plus size={13} /> Another platform
        </div>
        <p className="text-xs text-muted">
          Own or want it on another platform? Record that copy here — it becomes its own card.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink transition hover:border-brand/40 hover:text-accent"
      >
        <Plus size={14} className="text-accent" /> Add a platform
      </button>
      {open &&
        createPortal(
          <AddGameModal initialPick={gameToAddMeta(rep)} onClose={() => setOpen(false)} />,
          document.body,
        )}
    </div>
  );
}

/** One instance's sub-card in a multi-instance hub: what distinguishes it
 *  (platforms + formats, its own status, the family primary crown, its own
 *  title when it differs) above its copies editor. */
function InstanceSection({
  game,
  hub,
  pageScreenshots,
  pageScreenshotsKey,
}: {
  game: Game;
  hub: Game[];
  pageScreenshots: string[];
  pageScreenshotsKey: string | null;
}) {
  const removeGame = useStore((s) => s.removeGame);
  const screenshots = useInstanceScreenshots(game, pageScreenshots, pageScreenshotsKey);
  const owned = ownedPlatformSummary(game.copies ?? []);
  const famMembers = game.familyId != null ? hub.filter((g) => g.familyId === game.familyId) : [];
  const isPrimary = famMembers.length > 1 && familyPrimary(famMembers).id === game.id;
  const [confirming, setConfirming] = useState(false);
  // A bundle child can't be removed on its own (the compilation owns it).
  const canRemove = game.compilationId == null;
  const platformsLabel = owned.map((o) => o.platform).join(", ");

  return (
    <section className="rounded-2xl border border-line bg-surface p-3">
      <header className="mb-3 flex flex-wrap items-center gap-1.5">
        {owned.length > 0 ? (
          owned.map((o) => (
            <PlatformBadge key={o.platform} label={ownershipLabel(o)} />
          ))
        ) : (
          <span className="text-xs text-subtle">No platform recorded</span>
        )}
        <StatusBadge status={game.status} rotation={isInRotation(game)} />
        {isPrimary && (
          <span
            title="The family's primary edition — the family card renders this record and new playtime/milestones save to it"
            className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
          >
            <Crown size={10} /> Primary
          </span>
        )}
        {famMembers.length > 1 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-panel px-1.5 py-0.5 text-[10px] text-muted">
            <Users size={10} /> {familyName(famMembers)}
          </span>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            title="Remove this version"
            aria-label={`Remove this ${platformsLabel || "platform-less"} version`}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-line px-1.5 py-1 text-[11px] text-subtle transition hover:border-danger/40 hover:text-danger"
          >
            <Trash2 size={12} /> Remove
          </button>
        )}
        <span className="min-w-0 basis-full truncate text-xs text-subtle" title={game.title}>
          {game.title}
        </span>
      </header>
      {confirming && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/5 p-2.5">
          <p className="text-xs text-muted">
            Remove your{" "}
            <span className="font-medium text-ink">{platformsLabel || "platform-less"}</span> version
            of <span className="font-medium text-ink">{game.title}</span>? This deletes this instance
            and its own status, playtime and progress. Other versions stay.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                void removeGame(game.id);
                setConfirming(false);
              }}
              className="rounded-lg bg-danger/15 px-2.5 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/25"
            >
              Remove version
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg bg-panel px-2.5 py-1.5 text-xs text-ink transition hover:brightness-95"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <InstanceCopies
        game={game}
        screenshots={screenshots}
        onRequestRemove={canRemove ? () => setConfirming(true) : undefined}
      />
    </section>
  );
}

/** An instance's screenshot baseline: the page-level fetch when it shares the
 *  hub representative's catalog identity; its own fetch otherwise (a linked
 *  remaster is a different catalog game with its own gallery). */
function useInstanceScreenshots(
  game: Game,
  pageScreenshots: string[],
  pageScreenshotsKey: string | null,
): string[] {
  const { cloud, fetchGameScreenshots } = useStore();
  const key = catalogKey(game);
  const samePage = key != null && key === pageScreenshotsKey;
  const [own, setOwn] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    if (!samePage && cloud && (game.rawgId || game.catalogId)) {
      void fetchGameScreenshots({ rawgId: game.rawgId, catalogId: game.catalogId }).then(
        (s) => active && setOwn(s),
      );
    }
    return () => {
      active = false;
    };
  }, [samePage, cloud, game.rawgId, game.catalogId, fetchGameScreenshots]);
  return samePage ? pageScreenshots : own;
}

/** The Game Family tools, right inside the tab: bind the listed copies into
 *  ONE family card, manage an existing link, or sever it — via the Family
 *  Breakdown modal (the same manager the board card opens). */
function FamilyLinkBlock({ hub }: { hub: Game[] }) {
  const [open, setOpen] = useState(false);
  const linkedMember = hub.find((g) => g.familyId != null);
  const famMembers = linkedMember
    ? hub.filter((g) => g.familyId === linkedMember.familyId)
    : [];
  const linked = famMembers.length > 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel/30 px-3 py-2">
      <div className="min-w-0">
        <div className="mb-0.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent">
          <Users size={13} /> Game Family
        </div>
        <p className="text-xs text-muted">
          {linked ? (
            <>
              <span className="font-medium text-ink">{familyName(famMembers)}</span> ·{" "}
              {famMembers.length} linked editions play as one card.
            </>
          ) : (
            "Link editions — remasters, ports, re-releases — into ONE card and one playthrough."
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink transition hover:border-brand/40 hover:text-accent"
      >
        <Link2 size={14} className="text-accent" /> {linked ? "Manage family" : "Link editions"}
      </button>
      {open &&
        createPortal(
          <FamilyHub
            game={linkedMember ?? hub[0]}
            onClose={() => setOpen(false)}
            onJump={(m) => {
              setOpen(false);
              window.location.hash = gameHash(m.id);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

/** One instance's copies editor: platform, format, cost & note, immediate-
 *  write — a platform/format pick or a row add/remove persists right away;
 *  cost and note save when you leave the field. Incomplete rows (no platform
 *  picked yet) simply wait. A compilation child's copies are owned by the
 *  bundle and shown locked, exactly as before. Each record is one instance —
 *  a bundle copy of the same game manages its own copies on its own row. */
function InstanceCopies({
  game,
  screenshots,
  onRequestRemove,
}: {
  game: Game;
  /** The catalog's current screenshots for THIS instance's identity — kept on
   *  the missing-platform suggestion's baseline so approving the platform
   *  change can never wipe them (the diff must start from what's stored). */
  screenshots: string[];
  /** In a multi-instance hub, removing an instance's LAST copy means removing
   *  the whole version — rather than strand a copy-less "No platform recorded"
   *  duplicate, ask the section to confirm removing the instance (issue
   *  2c6760ad). Omitted for a sole instance, where a copy-less (custom/ongoing)
   *  state is legitimate. */
  onRequestRemove?: () => void;
}) {
  const { setGameCopies, submitGameSubmission, platformList, cloud } = useStore();

  const isWishlist = game.status === "wishlist";
  const inCompilation = game.compilationId != null;

  const [rows, setRows] = useState<CopyRowDraft[]>((game.copies ?? []).map(copyToRow));
  // "Missing platform?" escape hatch: widen the choices from this game's
  // verified release list to the full master list.
  const [allPlatforms, setAllPlatforms] = useState(false);

  const existing = (game.copies ?? []).map((c) => c.platform).filter(Boolean);
  // Per-platform instances: once this card has a platform, new copies stay on
  // it (physical/digital/DLC of the SAME platform live together) — a different
  // platform is its own card, added through Add Game. A card with no platform
  // yet (custom/ongoing) still offers the game's verified list to set one.
  const instancePlatforms = [...new Set(existing)];
  const lockedToInstance = instancePlatforms.length > 0;
  const platformOptions = copyPlatformOptions(
    lockedToInstance ? instancePlatforms : allPlatforms ? undefined : game.platforms,
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
    // Removing the last copy of a per-platform instance that has siblings would
    // strand a copy-less "No platform recorded" duplicate — that IS removing the
    // version, so route it through the section's confirm instead of saving a
    // zombie (issue 2c6760ad). Keep the copy on screen until it's confirmed.
    if (next.length === 0 && prev.length > 0 && onRequestRemove) {
      setRows(prev.map(copyToRow));
      onRequestRemove();
      return;
    }
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
      {lockedToInstance && (
        <p className="text-xs text-subtle">
          This card tracks your{" "}
          <span className="text-ink">{instancePlatforms.join(", ")}</span> copy — new copies here
          stay on that platform. Own it on another platform? Use{" "}
          <span className="text-ink">Add a platform</span> below and it becomes its own card.
        </p>
      )}
      {!lockedToInstance && canRequestPlatform && !allPlatforms && (
        <button
          type="button"
          onClick={() => setAllPlatforms(true)}
          className="self-start text-xs font-medium text-accent underline-offset-2 transition hover:underline"
        >
          Missing platform? Choose from all platforms
        </button>
      )}
      {!lockedToInstance && canRequestPlatform && allPlatforms && (
        <p className="text-xs text-subtle">
          Showing every platform. Pick one this game isn&apos;t listed on and we&apos;ll send a
          request to add it to the game&apos;s release list — your copy is saved right away.
        </p>
      )}
    </div>
  );
}
