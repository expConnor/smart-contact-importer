import { env } from '../config/env';
import { ImportError, ImportJob } from '../generated/prisma/client';
import {
  ImportJobResponseDto,
  ImportRowErrorDto,
} from './dto/import-job-response.dto';
import type { ColumnMapping } from './types';

// The worker stores these as { rows } and { mappings } wrappers. The casts
// trust that shape: only the analysis settle writes these columns.
type StoredSampleRows = { rows: string[][] };
type StoredMapping = { mappings: ColumnMapping[] };

type ErrorRow = Pick<ImportError, 'rowNumber' | 'field' | 'message' | 'rawRow'>;

export function toImportJobResponseDto(
  row: ImportJob,
  errors: ErrorRow[],
): ImportJobResponseDto {
  const dto: ImportJobResponseDto = {
    id: row.id,
    status: row.status,
    headerRowIndex: row.headerRowIndex,
    sampleRows: (row.sampleRows as StoredSampleRows | null)?.rows ?? null,
    proposedMapping:
      (row.proposedMapping as StoredMapping | null)?.mappings ?? null,
    inferenceSource: row.inferenceSource,
    inferenceFallback: row.inferenceFallback,
    failureReason: row.failureReason,
    totalRows: row.totalRows,
    importedRows: row.importedRows,
    failedRows: row.failedRows,
    attempts: row.attempts,
    maxAttempts: env.WORKER_MAX_ATTEMPTS,
    byteSize: row.byteSize,
    detectedEncoding: row.detectedEncoding,
    detectedDelimiter: row.detectedDelimiter,
    // rawRow is always the import handler's { header: cell } object.
    errors: errors.map((e) => ({
      ...e,
      rawRow: e.rawRow as ImportRowErrorDto['rawRow'],
    })),
  };
  return dto;
}
