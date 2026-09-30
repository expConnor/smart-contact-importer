import type {
  ImportJobStatus,
  InferenceFallback,
  InferenceSource,
} from '../../generated/prisma/enums';
import type { ColumnMapping } from '../types';

export class ImportRowErrorDto {
  rowNumber!: number;
  field!: string | null;
  message!: string;
  rawRow!: Record<string, string>;
}

export class ImportJobResponseDto {
  id!: string;
  status!: ImportJobStatus;
  headerRowIndex!: number | null;
  sampleRows!: string[][] | null;
  proposedMapping!: ColumnMapping[] | null;
  inferenceSource!: InferenceSource | null;
  /** Why the heuristic was used. Null for LLM, and for jobs analysed before it was stored. */
  inferenceFallback!: InferenceFallback | null;
  failureReason!: string | null;
  totalRows!: number | null;
  importedRows!: number;
  failedRows!: number;
  /** Claims of the current phase: the analysis settle resets it, so on COMPLETED it counts import runs. */
  attempts!: number;
  maxAttempts!: number;
  byteSize!: number;
  detectedEncoding!: string | null;
  detectedDelimiter!: string | null;
  /** The first 100 by row. failedRows is the full count. */
  errors!: ImportRowErrorDto[];
}
