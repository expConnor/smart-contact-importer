// Email is the only field that can sink a row, so it is always the reason.
export function skippedLine(failedRows: number): string {
  if (failedRows === 0) return 'Every row was imported.';
  if (failedRows === 1) return '1 row had no usable email and was skipped.';
  return `${failedRows} rows had no usable email and were skipped.`;
}

// Google exports carry dozens of empty columns; only filled cells help.
// Postgres jsonb stores keys shortest first, so pass the file's column order.
export function rawRowText(
  rawRow: Record<string, string>,
  columns: string[] = Object.keys(rawRow),
): string {
  return columns
    .filter((column) => (rawRow[column] ?? '') !== '')
    .map((column) => `${column}: ${rawRow[column]}`)
    .join(' · ');
}

// The API sends at most 100 errors; say so rather than look complete.
export function cappedNote(shown: number, total: number): string | null {
  return total > shown
    ? `Showing the first ${shown} of ${total} failed rows.`
    : null;
}
