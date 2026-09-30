import type {
  InferenceFallback,
  InferenceSource,
  ImportJobStatus,
} from '../generated/prisma/enums';
import type { claimJob } from '../generated/prisma/sql';
import type { InputJsonObject } from '@prisma/client/runtime/client';
import type { ColumnMapping } from '../imports/types';

export const WORKER_ID = Symbol('WORKER_ID');

export type WorkerPhase = 'analysis' | 'import';

export const PHASE_QUEUES: Record<
  WorkerPhase,
  { pending: ImportJobStatus; active: ImportJobStatus }
> = {
  analysis: { pending: 'PENDING_ANALYSIS', active: 'ANALYZING' },
  import: { pending: 'PENDING_IMPORT', active: 'IMPORTING' },
};

export type ClaimedJob = claimJob.Result;

export type AnalysisOutcome = {
  detectedHeaders: InputJsonObject;
  detectedDelimiter: string;
  detectedEncoding: string;
  headerRowIndex: number;
  sampleRows: InputJsonObject;
  proposedMapping: InputJsonObject;
  inferenceSource: InferenceSource;
  inferenceFallback: InferenceFallback | null;
  totalRows: number;
};

export type ImportOutcome = { importedRows: number; failedRows: number };

export interface JobHandler<TOutcome> {
  run(job: ClaimedJob, signal: AbortSignal): Promise<TOutcome>;
}

export const ANALYSIS_HANDLER = Symbol('ANALYSIS_HANDLER');
export const IMPORT_HANDLER = Symbol('IMPORT_HANDLER');

export const COLUMN_GUESSER = Symbol('COLUMN_GUESSER');

// null means "no guesser configured" and nothing else: it is stored as NO_KEY.
// A configured guesser that can't answer throws.
export interface ColumnGuesser {
  guess(
    headers: string[],
    sampleRows: string[][],
    signal: AbortSignal,
  ): Promise<ColumnMapping[] | null>;
}

// Used when no API key is set
export class NoColumnGuesser implements ColumnGuesser {
  guess(): Promise<null> {
    return Promise.resolve(null);
  }
}
