import { Injectable } from '@nestjs/common';
import { AnalysisOutcome, ClaimedJob, JobHandler } from '../types';

/** Fixed findings, ignoring the file. Holds the seam open until Phase 3. */
@Injectable()
export class NoopAnalysisHandler implements JobHandler<AnalysisOutcome> {
  run(_job: ClaimedJob, _signal: AbortSignal): Promise<AnalysisOutcome> {
    return Promise.resolve({
      detectedHeaders: { headers: ['Email', 'Name'] },
      detectedDelimiter: ';',
      detectedEncoding: 'windows-1252',
      headerRowIndex: 3,
      sampleRows: { rows: [] },
      proposedMapping: { mappings: [] },
      inferenceSource: 'HEURISTIC',
      totalRows: 42,
    });
  }
}
