import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { createImport } from './api';
import { formatKb, uploadErrorCopy } from './upload';

type Picked = { file: File; key: string };

// Mounted only while open, so file, key and error start empty every time.
export function UploadDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [missing, setMissing] = useState(false);
  const [dragging, setDragging] = useState(false);

  // showModal() gives the focus trap, Esc and the backdrop. StrictMode runs
  // this twice, and a second showModal() on an open dialog can throw.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const mutation = useMutation({
    mutationFn: ({ file, key }: Picked) => createImport(file, key),
    onSuccess: ({ id }) => {
      onClose();
      navigate(`/imports/${id}`);
    },
  });
  const uploading = mutation.isPending;

  // A new file gets a new key. Retrying the same file reuses its key, so a
  // double submit answers with the same job instead of making two.
  function pick(file: File | undefined) {
    if (!file || uploading) return;
    setPicked({ file, key: crypto.randomUUID() });
    setMissing(false);
    mutation.reset();
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    pick(event.target.files?.[0]);
    // Cleared so picking the same file again still fires onChange.
    event.target.value = '';
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(true);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  }

  function upload() {
    if (!picked) {
      setMissing(true);
      return;
    }
    mutation.mutate(picked);
  }

  const error = missing
    ? 'Choose a CSV file first.'
    : mutation.error && uploadErrorCopy(mutation.error);

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="upload-title"
      // Esc. Closing mid-upload would hide the id of a job that still gets
      // made, so it is blocked until the request answers.
      onCancel={(event) => {
        event.preventDefault();
        if (!uploading) onClose();
      }}
      // Chrome skips the cancel event on a repeated Esc and closes anyway.
      // Mid-upload, open it again; otherwise keep the parent's state in step
      // so Import CSV can open it again.
      onClose={() => {
        if (uploading) dialogRef.current?.showModal();
        else onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id="upload-title" className="dialog-title">
          Import a CSV
        </h2>
        <p className="muted">
          Any column layout. The next step lets you check how columns are read.
        </p>
      </div>

      <label
        className="dropzone"
        data-dragging={dragging || undefined}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          className="visually-hidden"
          type="file"
          accept=".csv"
          onChange={onChange}
          disabled={uploading}
        />
        {picked ? (
          <>
            <span className="mono dropzone-main">{picked.file.name}</span>
            <span className="muted">{formatKb(picked.file.size)}</span>
            <span className="dropzone-link">choose a different file</span>
          </>
        ) : (
          <>
            <span className="dropzone-main">Choose a CSV file</span>
            <span className="muted">.csv · up to 10 MB</span>
            <span className="dropzone-link">or drop it here</span>
          </>
        )}
      </label>

      {picked && (
        <p className="mono muted dialog-key">Idempotency-Key {picked.key}</p>
      )}

      {error && (
        <p className="error" role="alert">
          ✕ {error}
        </p>
      )}

      <div className="dialog-actions">
        <button
          className="button"
          type="button"
          onClick={onClose}
          disabled={uploading}
        >
          Cancel
        </button>
        <button
          className="button button-primary"
          type="button"
          onClick={upload}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </dialog>
  );
}
