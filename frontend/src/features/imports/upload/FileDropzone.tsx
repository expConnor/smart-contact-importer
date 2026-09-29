import { useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { formatKb } from './upload';

// Click to choose or drop a file. The hidden input stays in the tab order,
// so the keyboard reaches the picker too.
export function FileDropzone({
  file,
  disabled,
  onPick,
}: {
  file: File | undefined;
  disabled: boolean;
  onPick: (file: File | undefined) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    onPick(event.target.files?.[0]);
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
    onPick(event.dataTransfer.files[0]);
  }

  return (
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
        disabled={disabled}
      />
      {file ? (
        <>
          <span className="mono dropzone-main">{file.name}</span>
          <span className="muted">{formatKb(file.size)}</span>
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
  );
}
