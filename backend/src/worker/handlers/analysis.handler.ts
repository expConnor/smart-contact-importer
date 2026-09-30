import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { decode } from '../../imports/analysis/decode';
import { inferMapping } from '../../imports/analysis/infer';
import { countDataRows, sniff } from '../../imports/analysis/sniff';
import { UPLOAD_DIR } from '../../imports/storage';
import {
  AnalysisOutcome,
  ClaimedJob,
  COLUMN_GUESSER,
  JobHandler,
} from '../types';
import type { ColumnGuesser } from '../types';

/** Reads the uploaded file and proposes a mapping: the guesser's, or the heuristic's. */
@Injectable()
export class AnalysisHandler implements JobHandler<AnalysisOutcome> {
  constructor(
    @Inject(COLUMN_GUESSER) private readonly guesser: ColumnGuesser,
  ) {}

  async run(job: ClaimedJob, signal: AbortSignal): Promise<AnalysisOutcome> {
    const path = join(UPLOAD_DIR, job.storagePath);
    const { text, encoding } = decode(await readFile(path));
    const { delimiter, headerRowIndex, headers, sampleRows } = sniff(text);

    // sniff is total and answers -1 for "no header". A plain throw: runPhase
    // marks the job FAILED, rather than offering a mapping with no columns.
    if (headerRowIndex === -1) {
      throw new Error(`No header row found in ${job.storagePath}`);
    }

    const { mappings, source, fallback } = await inferMapping(
      { headers, headerRowIndex, sampleRows },
      this.guesser,
      signal,
    );

    return {
      detectedHeaders: { headers },
      detectedDelimiter: delimiter,
      detectedEncoding: encoding,
      headerRowIndex,
      sampleRows: { rows: sampleRows },
      proposedMapping: { mappings },
      inferenceSource: source,
      inferenceFallback: fallback,
      totalRows: await countDataRows(path, encoding, delimiter, headerRowIndex),
    };
  }
}
