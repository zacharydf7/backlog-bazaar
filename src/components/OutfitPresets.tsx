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
import { sameLook } from "../lib/wardrobe";
import {
  previewButton,
  previewInput,
  previewPrimary,
} from "./CosmeticsDraftEditor";
import { ConfirmDialog } from "./ConfirmDialog";

type PresetPanelProps = {
  session: CosmeticsSession;
  look: CosmeticLook;
  disabled: boolean;
  onPreview: (look: CosmeticLook) => void;
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
  onPreview,
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">Saved looks</h2>
          <p className="mt-1 text-sm text-muted">
            Keep favorite combinations. Preview a saved look, then use Apply
            outfit to wear it.
          </p>
        </div>
        <button
          className={previewPrimary}
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
          Save this look
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
      <div className="my-3 flex flex-wrap items-center gap-2">
        <button
          className={previewButton}
          disabled={locked || !!editing}
          onClick={() => setAttempt(attempt + 1)}
        >
          Reload saved looks
        </button>
        <button
          className={previewButton}
          disabled={locked || !!editing}
          aria-pressed={archived}
          onClick={() => setArchived(!archived)}
        >
          {archived ? "Show active looks" : "Show archived looks"}
        </button>
      </div>
      {editing && (
        <form
          aria-label="Save named look"
          className="mb-4 rounded-xl border border-line bg-panel p-3"
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
                "Saved look updated. Your equipment is unchanged.",
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
              ? "Saves the look you were previewing when you chose Save this look."
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
        <p role="status" className="text-sm text-muted">
          Loading saved looks…
        </p>
      )}
      {!loading && shown.length === 0 && !error && (
        <p className="py-3 text-sm text-muted">
          {archived ? "No archived looks." : "No saved looks yet."}
        </p>
      )}
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {shown.map((preset) => {
          const missing = missingPresetSlots(session, preset.look);
          return (
            <article
              aria-label={preset.name}
              key={preset.id}
              className="min-w-0 rounded-xl border border-line p-3"
            >
              <h3 className="break-words font-medium text-ink">
                {preset.name}
                {sameLook(session.look, preset.look) && (
                  <span className="ml-2 text-xs text-success">Equipped</span>
                )}
              </h3>
              <dl className="my-3 grid grid-cols-2 gap-2">
                {COSMETIC_SLOTS.map((slot) => {
                  const id = preset.look[slot];
                  const name =
                    id === null
                      ? "Default"
                      : slot === "title"
                        ? session.badges.find((b) => b.id === id)?.name
                        : session.items.find((i) => i.id === id)?.name;
                  return (
                    <div key={slot} className="min-w-0">
                      <dt className="text-xs text-muted">
                        {SLOT_LABELS[slot]}
                      </dt>
                      <dd className="break-words text-sm text-ink">
                        {name ?? "Unavailable piece"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {missing.length > 0 && (
                <p className="mb-3 text-sm text-danger">
                  Needs attention:{" "}
                  {missing.map((slot) => SLOT_LABELS[slot]).join(", ")}. Preview
                  it and choose replacements before applying.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {!archived && (
                  <>
                    <button
                      className={previewButton}
                      disabled={locked || !!editing}
                      onClick={() => onPreview({ ...preset.look })}
                    >
                      Preview look
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
                      Replace with try-on
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
      {replacing && (
        <ConfirmDialog
          title="Replace this saved look?"
          body={`Replace the pieces in ${replacing.preset.name} with your current try-on? Your equipment stays unchanged.`}
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
              "Saved look replaced. Your equipment is unchanged.",
            );
          }}
        />
      )}
    </section>
  );
}
