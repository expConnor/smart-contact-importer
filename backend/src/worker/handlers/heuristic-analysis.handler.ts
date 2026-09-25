import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { decode } from '../../imports/analysis/decode';
import { match } from '../../imports/analysis/match';
import { countDataRows, sniff } from '../../imports/analysis/sniff';
import { UPLOAD_DIR } from '../../imports/storage';
import { AnalysisOutcome, ClaimedJob, JobHandler } from '../types';

/** Reads the uploaded file and proposes a mapping, with no model involved. */
@Injectable()
export class HeuristicAnalysisHandler implements JobHandler<AnalysisOutcome> {
  async run(job: ClaimedJob, _signal: AbortSignal): Promise<AnalysisOutcome> {
    const path = join(UPLOAD_DIR, job.storagePath);
    const { text, encoding } = decode(await readFile(path));
    const { delimiter, headerRowIndex, headers, sampleRows } = sniff(text);

    // sniff is total and answers -1 for "no header". A plain throw: runPhase
    // marks the job FAILED, rather than offering a mapping with no columns.
    if (headerRowIndex === -1) {
      throw new Error(`No header row found in ${job.storagePath}`);
    }

    return {
      detectedHeaders: { headers },
      detectedDelimiter: delimiter,
      detectedEncoding: encoding,
      headerRowIndex,
      sampleRows: { rows: sampleRows },
      proposedMapping: { mappings: match(headers, sampleRows) },
      inferenceSource: 'HEURISTIC',
      totalRows: await countDataRows(path, encoding, delimiter, headerRowIndex),
    };
  }
}
