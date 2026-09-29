import type { ImportStatus } from './api';

// Before the mapping review: a worker still has to read the file.
export function isAnalysing(status: ImportStatus): boolean {
  return status === 'PENDING_ANALYSIS' || status === 'ANALYZING';
}

// After the mapping review: a worker still has to write the rows.
export function isImporting(status: ImportStatus): boolean {
  return status === 'PENDING_IMPORT' || status === 'IMPORTING';
}

// A worker still has work in these states. Anywhere else nothing moves until
// the user acts, or the job is done for good.
export function isPolling(status: ImportStatus | undefined): boolean {
  return status !== undefined && (isAnalysing(status) || isImporting(status));
}

// The list polls while any job in it still moves on its own.
export function anyPolling(
  items: { status: ImportStatus }[] | undefined,
): boolean {
  return items?.some((job) => isPolling(job.status)) ?? false;
}

// AWAITING_MAPPING → "Awaiting mapping".
export function statusLabel(status: ImportStatus): string {
  const words = status.toLowerCase().replaceAll('_', ' ');
  return words[0].toUpperCase() + words.slice(1);
}

// Ids are UUIDv7: the first characters are a timestamp and repeat across jobs
// made close together. The random tail tells them apart.
export function shortId(id: string): string {
  return id.slice(-8);
}

// A Record, not a switch: the type fails to compile if a status is missing.
export const STATUS_LINE: Record<ImportStatus, string> = {
  PENDING_ANALYSIS: 'File saved. Waiting for a worker.',
  ANALYZING: 'A worker is reading the file.',
  AWAITING_MAPPING: 'Check the mapping, then click Import contacts.',
  PENDING_IMPORT: 'Mapping saved. Waiting for a worker.',
  IMPORTING: 'A worker is importing the rows.',
  COMPLETED: 'Every row was imported or counted as failed.',
  FAILED: "The job failed and won't run again.",
};
