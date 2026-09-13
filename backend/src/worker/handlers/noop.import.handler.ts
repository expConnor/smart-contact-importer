import { Injectable } from '@nestjs/common';
import { ClaimedJob, ImportOutcome, JobHandler } from '../types';

/** Writes no contacts. Reports the counters Phase 3 will actually earn. */
@Injectable()
export class NoopImportHandler implements JobHandler<ImportOutcome> {
  run(_job: ClaimedJob): Promise<ImportOutcome> {
    return Promise.resolve({ importedRows: 30, failedRows: 1 });
  }
}
