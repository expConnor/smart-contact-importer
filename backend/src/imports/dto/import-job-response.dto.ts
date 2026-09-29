import type {
  ImportJobStatus,
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
  failureReason!: string | null;
  totalRows!: number | null;
  importedRows!: number;
  failedRows!: number;
  /** The first 100 by row. failedRows is the full count. */
  errors!: ImportRowErrorDto[];
}
