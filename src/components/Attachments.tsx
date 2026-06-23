import { useEffect, useRef, useState } from "react";
import { Paperclip, X, FileText } from "lucide-react";
import { mergeFiles, isImage, MAX_FILES } from "../lib/attachment";
import { toast } from "../lib/toast";
import type { IssueAttachment } from "../types";

// The file types the picker offers in the native chooser (mirrors lib/attachment).
const ACCEPT = "image/*,.txt,.log,.json,.csv,text/plain,application/json,text/csv";

/** Thumbnail/chip for one not-yet-uploaded file, with a remove button. Owns the
 *  object URL for image previews so it's revoked when the file is removed. */
function PendingItem({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url] = useState(() => (isImage(file) ? URL.createObjectURL(file) : null));
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  return (
    <div className="relative">
      {url ? (
        <img
          src={url}
          alt={file.name}
          className="h-16 w-16 rounded-lg border border-line object-cover"
        />
      ) : (
        <span className="flex h-16 w-28 items-center gap-1.5 rounded-lg border border-line bg-panel px-2 text-xs text-muted">
          <FileText size={14} className="shrink-0 text-accent" />
          <span className="truncate">{file.name}</span>
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-line bg-surface text-muted shadow transition hover:text-danger"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/** Controlled picker for files to attach when composing/editing a report. */
export function AttachmentPicker({
  value,
  onChange,
  disabled,
}: {
  value: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    if (!list) return;
    const { files, errors } = mergeFiles(value, Array.from(list));
    errors.forEach((e) => toast(e, X));
    onChange(files);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || value.length >= MAX_FILES}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-ink disabled:opacity-50"
      >
        <Paperclip size={13} /> Attach files
      </button>
      <span className="ml-2 text-[11px] text-subtle">
        Screenshots or logs · up to {MAX_FILES}
      </span>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((f, i) => (
            <PendingItem
              key={`${f.name}-${i}`}
              file={f}
              onRemove={() => onChange(value.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Displays already-uploaded attachments: image thumbnails open full-size, other
 *  files download. With onRemove, shows a delete button (owner/admin edit mode). */
export function AttachmentGrid({
  attachments,
  onRemove,
}: {
  attachments: IssueAttachment[];
  onRemove?: (att: IssueAttachment) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a) => (
        <div key={a.id} className="relative">
          {a.contentType.startsWith("image/") ? (
            <a href={a.url} target="_blank" rel="noreferrer" title={a.name}>
              <img
                src={a.url}
                alt={a.name}
                className="h-20 w-20 rounded-lg border border-line object-cover transition hover:brightness-110"
              />
            </a>
          ) : (
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              download={a.name}
              title={`Download ${a.name}`}
              className="flex h-20 w-32 flex-col justify-center gap-1 rounded-lg border border-line bg-panel px-2 text-xs text-muted transition hover:text-ink"
            >
              <FileText size={16} className="text-accent" />
              <span className="truncate">{a.name}</span>
            </a>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(a)}
              aria-label={`Remove ${a.name}`}
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-line bg-surface text-muted shadow transition hover:text-danger"
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
