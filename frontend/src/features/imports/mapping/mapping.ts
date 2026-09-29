import { ApiError } from '@/shared/api/client';
import type {
  ColumnMapping,
  InferenceSource,
  MappingPayload,
  TargetField,
} from '../api';

// The API's own words, so the review shows what gets sent.
export const TARGET_OPTIONS: { value: TargetField; label: string }[] = [
  { value: 'email', label: 'email' },
  { value: 'name', label: 'name' },
  { value: 'company', label: 'company' },
  { value: 'jobTitle', label: 'jobTitle' },
  { value: 'phone', label: 'phone' },
  { value: 'status', label: 'status' },
  { value: '__ignore__', label: 'skip' },
];

// Derived, not stored: picking the proposal again undoes "manual".
export function isManual(row: ColumnMapping, proposal: ColumnMapping): boolean {
  return row.targetField !== proposal.targetField;
}

// The line between "looks right" and "check this row".
const LOW_CONFIDENCE = 0.85;

export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE;
}

export function meterLevel(confidence: number): 1 | 2 | 3 {
  if (!isLowConfidence(confidence)) return 3;
  if (confidence >= 0.6) return 2;
  return 1;
}

// A ragged CSV row can end before the column does.
export function columnSamples(
  sampleRows: string[][],
  column: number,
): string[] {
  return sampleRows
    .map((row) => (row[column] ?? '').trim())
    .filter((value) => value !== '');
}

// Mirrors the server's checks so the user sees them before sending. The server
// still decides.
export function mappingProblems(rows: ColumnMapping[]): string[] {
  const problems: string[] = [];
  if (!rows.some((row) => row.targetField === 'email')) {
    problems.push(
      "Pick a column for email. Rows without an email can't be imported.",
    );
  }

  const columnsByField = new Map<TargetField, string[]>();
  for (const row of rows) {
    if (row.targetField === '__ignore__') continue;
    const columns = columnsByField.get(row.targetField) ?? [];
    columns.push(row.sourceColumn);
    columnsByField.set(row.targetField, columns);
  }
  for (const [field, columns] of columnsByField) {
    if (columns.length < 2) continue;
    const names = columns.map((column) => `“${column}”`).join(', ');
    problems.push(
      `${field} is set on more than one column: ${names}. Each field can come from one column only.`,
    );
  }
  return problems;
}

// A row the user changed is sent with confidence 1: the old score described a
// choice they replaced.
export function toPayload(
  headerRowIndex: number,
  rows: ColumnMapping[],
  proposed: ColumnMapping[],
): MappingPayload {
  return {
    headerRowIndex,
    mappings: rows.map((row, i) => ({
      ...row,
      confidence: isManual(row, proposed[i]) ? 1 : proposed[i].confidence,
    })),
  };
}

type Issue = { field: string; message: string };

function isIssue(value: unknown): value is Issue {
  const issue = value as Partial<Issue> | null;
  return typeof issue?.field === 'string' && typeof issue.message === 'string';
}

// Only a 422 says something is wrong with the mapping itself. A 409 or a
// network error is shown as one line instead.
export function serverIssues(error: Error): string[] {
  if (
    !(error instanceof ApiError) ||
    error.code !== 'MAPPING_INVALID' ||
    !Array.isArray(error.details)
  ) {
    return [];
  }
  return error.details
    .filter(isIssue)
    .map((issue) => `${issue.field}: ${issue.message}`);
}

// Shows the no-key path is the one that ran.
export function sourceLabel(source: InferenceSource): string {
  return source === 'LLM' ? 'AI' : 'built-in rules (no AI key)';
}
