import type { InferenceFallback, InferenceSource } from '../api';

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

// Ids of the nodes and edges in the PathTaken diagram.
export type PathStep =
  | 'sniff'
  | 'guess'
  | 'validate'
  | 'rules'
  | 'mapping'
  | 'sniff-guess'
  | 'sniff-rules'
  | 'guess-validate'
  | 'guess-rules'
  | 'validate-rules'
  | 'validate-mapping'
  | 'rules-mapping';

// The steps this job went through. A HEURISTIC job with no fallback was
// analysed before the reason was stored: we can't say how it reached the rules.
export function pathTaken(
  source: InferenceSource | null,
  fallback: InferenceFallback | null,
): PathStep[] {
  if (source === 'LLM') {
    return [
      'sniff',
      'sniff-guess',
      'guess',
      'guess-validate',
      'validate',
      'validate-mapping',
      'mapping',
    ];
  }
  if (source === null) return [];

  const toRules: Record<InferenceFallback, PathStep[]> = {
    NO_KEY: ['sniff-rules'],
    GUESS_FAILED: ['sniff-guess', 'guess', 'guess-rules'],
    GUESS_REJECTED: [
      'sniff-guess',
      'guess',
      'guess-validate',
      'validate',
      'validate-rules',
    ],
  };
  return [
    'sniff',
    ...(fallback ? toRules[fallback] : []),
    'rules',
    'rules-mapping',
    'mapping',
  ];
}

export function fallbackLine(
  source: InferenceSource | null,
  fallback: InferenceFallback | null,
): string {
  if (source === 'LLM') {
    return "Claude's guess passed validation and became the proposed mapping.";
  }
  if (source === null) return '';
  switch (fallback) {
    case 'NO_KEY':
      return 'No API key is set, so the built-in rules proposed the mapping.';
    case 'GUESS_FAILED':
      return 'The call to Claude failed, so the built-in rules proposed the mapping.';
    case 'GUESS_REJECTED':
      return "Claude's guess didn't fit the file, so the built-in rules proposed the mapping.";
    case null:
      return 'The built-in rules proposed the mapping.';
  }
}

// 1024-based, one decimal from KB up.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  // Cut on the rounded value: 1,048,575 B would otherwise read 1024.0 KB.
  const kb = (bytes / 1024).toFixed(1);
  if (Number(kb) < 1024) return `${kb} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Quoted, so a comma or semicolon is visible; a tab has no visible glyph.
export function delimiterLabel(delimiter: string | null): string {
  if (delimiter === null) return '—';
  if (delimiter === '\t') return 'tab';
  return `"${delimiter}"`;
}
