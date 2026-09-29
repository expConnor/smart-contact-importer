import { useSyncExternalStore } from 'react';
import type { ApiCall } from '@/shared/api/client';
import { addRow, jobIdOf, noteOf, routeOf } from './requestLog';
import type { LogRow } from './requestLog';

// In this tab's memory only: a refresh clears it.

const logs = new Map<string, LogRow[]>();
const listeners = new Set<() => void>();
// One shared empty array: useSyncExternalStore needs the same value each read.
const NO_ROWS: LogRow[] = [];

// Wired to the API client in main.tsx, so it hears every answer.
export function recordCall(call: ApiCall): void {
  const id = jobIdOf(call);
  if (id === null) return;
  const row: LogRow = {
    method: call.method,
    route: routeOf(call.path),
    code: call.code,
    note: noteOf(call),
    count: 1,
    at: Date.now(),
  };
  logs.set(id, addRow(logs.get(id) ?? NO_ROWS, row));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRequestLog(id: string): LogRow[] {
  return useSyncExternalStore(subscribe, () => logs.get(id) ?? NO_ROWS);
}

export type Upload = { file: File; key: string };

// The upload dialog unmounts on close, so the file and key live here for
// Replay upload.
const uploads = new Map<string, Upload>();

export function rememberUpload(id: string, upload: Upload): void {
  uploads.set(id, upload);
}

export function uploadOf(id: string): Upload | undefined {
  return uploads.get(id);
}
