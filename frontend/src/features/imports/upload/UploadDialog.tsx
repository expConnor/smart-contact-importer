import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ErrorMessage } from '@/shared/ui/ErrorMessage';
import { useCreateImport } from '../queries';
import { rememberUpload } from '../request-log/store';
import { FileDropzone } from './FileDropzone';
import { fixtureOptions, uploadErrorText } from './upload';
import type { FixtureOption } from './upload';
import './upload.css';

type Picked = { file: File; key: string };

// The repo's fixtures/ folder, bundled as URLs so the raw bytes (cp1252, BOM,
// CRLF) reach the server untouched. vite.config.ts allows the folder.
const FIXTURES = fixtureOptions(
  import.meta.glob<string>('../../../../../fixtures/*.csv', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);

// Mounted only while open, so file, key and error start empty every time.
export function UploadDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [missing, setMissing] = useState(false);
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  const upload = useCreateImport();
  const uploading = upload.isPending;

  // showModal() gives the focus trap, Esc and the backdrop. StrictMode runs
  // this twice, and a second showModal() on an open dialog can throw.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // A new file gets a new key. Retrying the same file reuses its key, so a
  // double submit answers with the same job instead of making two.
  function pick(file: File | undefined) {
    if (!file || uploading) return;
    setPicked({ file, key: crypto.randomUUID() });
    setMissing(false);
    setFixtureError(null);
    upload.reset();
  }

  // Treated exactly like a chosen file, so it gets its own key too.
  async function pickFixture(fixture: FixtureOption | undefined) {
    if (!fixture) return;
    try {
      const response = await fetch(fixture.url);
      if (!response.ok) throw new Error(`Could not load ${fixture.name}`);
      const blob = await response.blob();
      pick(new File([blob], fixture.name, { type: 'text/csv' }));
    } catch (error) {
      setFixtureError(error instanceof Error ? error.message : String(error));
    }
  }

  function submit() {
    if (!picked) {
      setMissing(true);
      return;
    }
    upload.mutate(picked, {
      onSuccess: ({ id }) => {
        rememberUpload(id, picked);
        onClose();
        navigate(`/imports/${id}`);
      },
    });
  }

  const error = missing
    ? 'Choose a CSV file first.'
    : (fixtureError ?? (upload.error && uploadErrorText(upload.error)));

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

      <FileDropzone file={picked?.file} disabled={uploading} onPick={pick} />

      <label className="field">
        <span className="label">Or use a fixture</span>
        {/* Always shows the placeholder: the drop zone names the file. */}
        <select
          className="input"
          value=""
          disabled={uploading}
          onChange={(event) =>
            void pickFixture(
              FIXTURES.find((f) => f.name === event.target.value),
            )
          }
        >
          <option value="" disabled>
            Choose a fixture…
          </option>
          {FIXTURES.map((fixture) => (
            <option key={fixture.name} value={fixture.name}>
              {fixture.name}
            </option>
          ))}
        </select>
      </label>

      {picked && (
        <p className="mono muted dialog-key">Idempotency-Key {picked.key}</p>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}

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
          onClick={submit}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </dialog>
  );
}
