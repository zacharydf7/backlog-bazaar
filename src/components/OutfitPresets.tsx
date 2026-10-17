import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import {
  outfitPresetApi,
  missingPresetSlots,
  presetNameProblem,
  type OutfitPreset,
} from "../lib/outfitPresets";
import {
  COSMETIC_SLOTS,
  SLOT_LABELS,
  lookIsOwned,
  type CosmeticLook,
  type CosmeticsSession,
} from "../lib/cosmeticsPreview";
import { pieceName, wearOutfit } from "../lib/dressingRoom";
import { sameLook } from "../lib/wardrobe";
import {
  previewButton,
  previewInput,
  previewPrimary,
} from "./CosmeticsDraftEditor";
import { ConfirmDialog } from "./ConfirmDialog";

type PresetPanelProps = {
  session: CosmeticsSession;
  /** The outfit being worn right now. */
  look: CosmeticLook;
  disabled: boolean;
  /** Put a saved look on (saved at once, like any piece). */
  onWear: (look: CosmeticLook, name: string) => void;
  onEditingChange?: (editing: boolean) => void;
};
export function OutfitPresets(props: PresetPanelProps) {
  const allowed = useStore(
    (s) =>
      s.cloud && !!s.userId,
  );
  const userId = useStore((s) => s.userId);
  return allowed ? <PresetPanel key={userId} {...props} /> : null;
}
function PresetPanel({
  session,
  look,
  disabled,
  onWear,
  onEditingChange,
}: PresetPanelProps) {
  const [presets, setPresets] = useState<OutfitPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    version: number;
    name: string;
    look: CosmeticLook;
  } | null>(null);
  const [replacing, setReplacing] = useState<{
    preset: OutfitPreset;
    look: CosmeticLook;
  } | null>(null);
  const pending = useRef(false);
  const locked = disabled || busy || loading;
  useEffect(() => {
    onEditingChange?.(!!editing);
    return () => onEditingChange?.(false);
  }, [!!editing, onEditingChange]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void outfitPresetApi
      .list()
      .then((rows) => {
        if (!cancelled) setPresets(rows);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load saved looks.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  async function run(work: () => Promise<OutfitPreset>, message: string) {
    if (pending.current || locked) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await work();
      setPresets((rows) => [
        saved,
        ...rows.filter((row) => row.id !== saved.id),
      ]);
      setEditing(null);
      setNotice(message);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save your changes.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const shown = presets.filter((preset) => !!preset.archived_at === archived);
  return (
    <section
      aria-label="Saved looks"
      className="min-w-0 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-ink">Saved looks</h2>
        <button
          className={previewButton}
          disabled={locked || !!editing || !lookIsOwned(session, look)}
          onClick={() => {
            setEditing({
              id: crypto.randomUUID(),
              version: 0,
              name: "",
              look: { ...look },
            });
            setError("");
            setNotice("");
          }}
        >
          Save this outfit
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-success">
          {notice}
        </p>
      )}
      {error && (
        <button
          className={`${previewButton} mt-2`}
          disabled={locked || !!editing}
          onClick={() => setAttempt(attempt + 1)}
        >
          Try again
        </button>
      )}
      {editing && (
        <form
          aria-label="Save named look"
          className="mt-3 rounded-xl border border-line bg-panel p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!presetNameProblem(editing.name))
              void run(
                () =>
                  outfitPresetApi.save(
                    editing.id,
                    editing.version,
                    editing.name,
                    editing.look,
                  ),
                "Look saved.",
              );
          }}
        >
          <label className="text-sm text-ink">
            Look name
            <input
              autoFocus
              required
              maxLength={60}
              className={`${previewInput} mt-2`}
              value={editing.name}
              disabled={busy}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <p className="my-2 text-xs text-muted">
            {editing.version === 0
              ? "Saves the outfit you're wearing."
              : "Renames this saved look without changing its pieces."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className={previewPrimary}
              disabled={locked || !!presetNameProblem(editing.name)}
              type="submit"
            >
              Save named look
            </button>
            <button
              type="button"
              disabled={busy}
              className={previewButton}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {loading && (
        <p role="status" className="mt-2 text-sm text-muted">
          Loading saved looks…
        </p>
      )}
      {!loading && shown.length === 0 && !error && (
        <p className="mt-2 text-sm text-muted">
          {archived
            ? "No archived looks."
            : "Save outfits you like to switch between them in one tap."}
        </p>
      )}
      <div className="mt-3 flex min-w-0 flex-col gap-2">
        {shown.map((preset) => {
          const missing = missingPresetSlots(session, preset.look);
          // Wearing it = it would change nothing (pieces you no longer own
          // leave their slots empty when it goes on).
          const wearing = sameLook(look, wearOutfit(session, look, preset.look).next);
          return (
            <article
              aria-label={preset.name}
              key={preset.id}
              className="min-w-0 rounded-xl border border-line p-3"
            >
              <h3 className="break-words text-sm font-semibold text-ink">
                {preset.name}
                {wearing && (
                  <span className="ml-2 text-xs font-normal text-success">Wearing</span>
                )}
              </h3>
              <p className="mt-0.5 break-words text-xs text-muted">
                {COSMETIC_SLOTS.map((slot) => `${SLOT_LABELS[slot]}: ${pieceName(session, slot, preset.look[slot])}`).join(" · ")}
              </p>
              {missing.length > 0 && (
                <p className="mt-1 text-xs text-danger">
                  No longer yours:{" "}
                  {missing.map((slot) => SLOT_LABELS[slot]).join(", ")}. Wearing
                  this look leaves those slots empty.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {!archived && (
                  <>
                    <button
                      className={previewPrimary}
                      disabled={locked || !!editing || wearing}
                      onClick={() => onWear({ ...preset.look }, preset.name)}
                    >
                      Wear
                    </button>
                    <button
                      className={previewButton}
                      disabled={locked || !!editing}
                      onClick={() =>
                        setEditing({
                          id: preset.id,
                          version: preset.version,
                          name: preset.name,
                          look: { ...preset.look },
                        })
                      }
                    >
                      Rename
                    </button>
                    <button
                      className={previewButton}
                      disabled={
                        locked ||
                        !!editing ||
                        !lookIsOwned(session, look) ||
                        sameLook(preset.look, look)
                      }
                      onClick={() =>
                        setReplacing({ preset, look: { ...look } })
                      }
                    >
                      Update to this outfit
                    </button>
                  </>
                )}
                <button
                  className={previewButton}
                  disabled={locked || !!editing}
                  onClick={() =>
                    void run(
                      () => outfitPresetApi.archive(preset, !archived),
                      archived
                        ? "Saved look restored."
                        : "Saved look archived. You can restore it from archived looks.",
                    )
                  }
                >
                  {archived ? "Restore" : "Archive"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!loading && (archived || presets.some((preset) => !!preset.archived_at)) && (
        <button
          className="mt-2 text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-40"
          disabled={locked || !!editing}
          aria-pressed={archived}
          onClick={() => setArchived(!archived)}
        >
          {archived ? "Show saved looks" : "Show archived looks"}
        </button>
      )}
      {replacing && (
        <ConfirmDialog
          title="Replace this saved look?"
          body={`Replace the pieces in ${replacing.preset.name} with the outfit you're wearing now?`}
          confirmLabel="Replace saved look"
          onCancel={() => setReplacing(null)}
          onConfirm={() => {
            const selection = replacing;
            setReplacing(null);
            void run(
              () =>
                outfitPresetApi.save(
                  selection.preset.id,
                  selection.preset.version,
                  selection.preset.name,
                  selection.look,
                ),
              "Saved look updated.",
            );
          }}
        />
      )}
    </section>
  );
}
