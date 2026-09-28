import type { ImportStatus } from './api';

// A worker still has work in these states. Anywhere else nothing moves until
// the user acts, or the job is done for good.
export function isPolling(status: ImportStatus | undefined): boolean {
  return (
    status === 'PENDING_ANALYSIS' ||
    status === 'ANALYZING' ||
    status === 'PENDING_IMPORT' ||
    status === 'IMPORTING'
  );
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
