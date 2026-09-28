import { ApiError } from './api';

type Detail = { message?: unknown };

// The envelope says "Request validation failed"; the first field detail says
// what to fix. The server owns the .csv and size rules, so it has the words.
export function uploadErrorCopy(error: Error): string {
  if (!(error instanceof ApiError)) return error.message;
  if (Array.isArray(error.details)) {
    const message = (error.details[0] as Detail | undefined)?.message;
    if (typeof message === 'string') return message;
  }
  if (error.status === 413) return 'File is over 10 MB.';
  return `${error.message} (${error.status})`;
}

export function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
