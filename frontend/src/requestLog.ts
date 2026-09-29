import { useSyncExternalStore } from 'react';
import { parseError } from './api';
import type { ApiCall, ImportJob, MappingPayload } from './api';

export type LogRow = {
  method: string;
  route: string;
  code: number;
  note: string;
  count: number;
  at: number;
};

// `/imports/<id>` and `/imports/<id>/mapping`; group 1 is the id.
const JOB_PATH = /^\/imports\/([^/?]+)(?=\/mapping$|$)/;

function isUpload(call: ApiCall): boolean {
  return call.method === 'POST' && call.path === '/imports';
}

// Which job a call belongs to. The upload path has no id yet, so it comes
// from the answer. Everything else (sidebar list, contacts, auth, a
// rejected upload) is null and stays out of the log.
export function jobIdOf(call: ApiCall): string | null {
  const match = JOB_PATH.exec(call.path);
  if (match) return match[1];
  const id = (call.body as { id?: unknown } | null | undefined)?.id;
  return isUpload(call) && typeof id === 'string' ? id : null;
}

// The id repeats on every row; `:id` keeps rows short.
export function routeOf(path: string): string {
  return path.replace(JOB_PATH, '/imports/:id');
}

// What the answer means, in a few words.
export function noteOf(call: ApiCall): string {
  if (call.code >= 400) {
    const error = parseError(call.code, 'No error body', call.body);
    const details = Array.isArray(error.details) ? error.details : [];
    const first = (details[0] as { message?: unknown } | undefined)?.message;
    return `${error.code} · ${typeof first === 'string' ? first : error.message}`;
  }
  if (isUpload(call)) {
    return call.code === 201 ? 'new job' : 'replayed · same job, no new work';
  }
  const status = (call.body as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'string' ? status : '';
}

// A poll that saw what the last row saw bumps its count. Only GETs merge:
// every POST is a click someone made on purpose. Returns a new array.
export function addRow(rows: LogRow[], row: LogRow): LogRow[] {
  const last = rows.at(-1);
  if (
    last &&
    row.method === 'GET' &&
    last.method === row.method &&
    last.route === row.route &&
    last.code === row.code &&
    last.note === row.note
  ) {
    return [...rows.slice(0, -1), { ...last, count: last.count + 1 }];
  }
  return [...rows, row];
}

// Valid JSON the server has to reject for naming a column the file lacks:
// 422 MAPPING_INVALID, not a 400 shape error.
export function badMapping(
  job: Pick<ImportJob, 'headerRowIndex' | 'proposedMapping'>,
): MappingPayload {
  return {
    headerRowIndex: job.headerRowIndex ?? 0,
    mappings: (job.proposedMapping ?? []).map((mapping, i) =>
      i === 0
        ? { ...mapping, sourceColumn: 'Not a column in this file' }
        : mapping,
    ),
  };
}

// ─── Store ─────────────────────────────────────────────────────────────────
// In this tab's memory only: a refresh clears it.

const logs = new Map<string, LogRow[]>();
const listeners = new Set<() => void>();
// One shared empty array: useSyncExternalStore needs the same value each read.
const NO_ROWS: LogRow[] = [];

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

type Upload = { file: File; key: string };

// The upload dialog unmounts on close, so the file and key live here for
// Replay upload.
const uploads = new Map<string, Upload>();

export function rememberUpload(id: string, file: File, key: string): void {
  uploads.set(id, { file, key });
}

export function uploadOf(id: string): Upload | undefined {
  return uploads.get(id);
}
