import { ApiError } from '@/shared/api/client';
import { errorText, firstDetailMessage } from '@/shared/api/errors';

// The server owns the .csv and size rules, so its field detail has the words.
export function uploadErrorText(error: Error): string {
  if (!(error instanceof ApiError)) return error.message;
  const detail = firstDetailMessage(error);
  if (detail !== undefined) return detail;
  if (error.status === 413) return 'File is over 10 MB.';
  return errorText(error);
}

export function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export type FixtureOption = { name: string; url: string };

// import.meta.glob keys are paths; the file name is what the user knows.
export function fixtureOptions(urls: Record<string, string>): FixtureOption[] {
  return Object.entries(urls)
    .map(([path, url]) => ({ name: path.split('/').pop() ?? path, url }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
