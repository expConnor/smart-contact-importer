import { ImportJob } from '../generated/prisma/client';
import { ImportJobResponseDto } from './dto/import-job-response.dto';
import type { ColumnMapping } from './types';

// The worker stores these as { rows } and { mappings } wrappers. The casts
// trust that shape: only the analysis settle writes these columns.
type StoredSampleRows = { rows: string[][] };
type StoredMapping = { mappings: ColumnMapping[] };

export function toImportJobResponseDto(row: ImportJob): ImportJobResponseDto {
  const dto: ImportJobResponseDto = {
    id: row.id,
    status: row.status,
    headerRowIndex: row.headerRowIndex,
    sampleRows: (row.sampleRows as StoredSampleRows | null)?.rows ?? null,
    proposedMapping:
      (row.proposedMapping as StoredMapping | null)?.mappings ?? null,
    inferenceSource: row.inferenceSource,
    failureReason: row.failureReason,
    totalRows: row.totalRows,
    importedRows: row.importedRows,
    failedRows: row.failedRows,
  };
  return dto;
}
