import { request } from '@/shared/api/client';

export type ImportStatus =
  | 'PENDING_ANALYSIS'
  | 'ANALYZING'
  | 'AWAITING_MAPPING'
  | 'PENDING_IMPORT'
  | 'IMPORTING'
  | 'COMPLETED'
  | 'FAILED';

export type TargetField =
  'email' | 'name' | 'company' | 'jobTitle' | 'phone' | 'status' | '__ignore__';

export type ColumnMapping = {
  sourceColumn: string;
  targetField: TargetField;
  confidence: number;
};

export type MappingPayload = {
  headerRowIndex: number;
  mappings: ColumnMapping[];
};

export type InferenceSource = 'HEURISTIC' | 'LLM';

// Why the built-in rules proposed the mapping. null when Claude's guess was
// used, and on jobs analysed before the reason was stored.
export type InferenceFallback = 'NO_KEY' | 'GUESS_FAILED' | 'GUESS_REJECTED';

// rowNumber is the spreadsheet row: header and preamble lines count.
export type ImportRowError = {
  rowNumber: number;
  field: string | null;
  message: string;
  rawRow: Record<string, string>;
};

// Only the fields the UI reads today. The analysis fields stay null until the
// job reaches AWAITING_MAPPING. The counts stay 0 and errors stay [] until the
// import settles; errors holds the first 100 by row.
export type ImportJob = {
  id: string;
  status: ImportStatus;
  headerRowIndex: number | null;
  sampleRows: string[][] | null;
  proposedMapping: ColumnMapping[] | null;
  inferenceSource: InferenceSource | null;
  inferenceFallback: InferenceFallback | null;
  failureReason: string | null;
  totalRows: number | null;
  importedRows: number;
  failedRows: number;
  // The analysis settle resets attempts, so on COMPLETED it counts import runs.
  attempts: number;
  maxAttempts: number;
  byteSize: number;
  detectedEncoding: string | null;
  detectedDelimiter: string | null;
  errors: ImportRowError[];
};

export type ImportSummary = {
  id: string;
  status: ImportStatus;
  originalFilename: string;
};

// Same key + same bytes answers with the same job, so a retry is safe.
export function createImport(file: File, key: string): Promise<{ id: string }> {
  const form = new FormData();
  form.append('file', file);
  return request<{ id: string }>('POST', '/imports', form, {
    'Idempotency-Key': key,
  });
}

export function getImport(id: string): Promise<ImportJob> {
  return request<ImportJob>('GET', `/imports/${encodeURIComponent(id)}`);
}

// Answers 202 with the job, now PENDING_IMPORT.
export function confirmMapping(
  id: string,
  payload: MappingPayload,
): Promise<ImportJob> {
  return request<ImportJob>(
    'POST',
    `/imports/${encodeURIComponent(id)}/mapping`,
    payload,
  );
}

// The caller's newest 100 jobs, newest first.
export function listImports(): Promise<{ items: ImportSummary[] }> {
  return request<{ items: ImportSummary[] }>('GET', '/imports');
}
