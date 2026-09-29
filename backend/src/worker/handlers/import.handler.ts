import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { SourceEncoding } from '../../imports/analysis/decode';
import { isBlank, rowStream } from '../../imports/analysis/sniff';
import { toContact } from '../../imports/import/to-contact';
import type { RowResult } from '../../imports/import/to-contact';
import { UPLOAD_DIR } from '../../imports/storage';
import type { ColumnMapping } from '../../imports/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ClaimedJob, ImportOutcome, JobHandler } from '../types';

const BATCH_SIZE = 500;

// The { headers } and { mappings } wrappers analysis and confirm stored.
type StoredHeaders = { headers: string[] };
type StoredMapping = { mappings: ColumnMapping[] };

type ParsedRow = {
  rowNumber: number;
  cells: string[];
  result: RowResult;
};

/**
 * Streams the file and saves each good row as a contact, each bad one as an
 * ImportError. Safe to run twice: contacts upsert on email and errors are
 * unique per row, so a rerun after a crash lands on the same result.
 */
@Injectable()
export class ImportHandler implements JobHandler<ImportOutcome> {
  constructor(private readonly prisma: PrismaService) {}

  async run(job: ClaimedJob, signal: AbortSignal): Promise<ImportOutcome> {
    const { headers } = job.detectedHeaders as StoredHeaders;
    const { mappings } = job.confirmedMapping as StoredMapping;
    const headerRowIndex = job.headerRowIndex ?? -1;
    const rows = rowStream(
      join(UPLOAD_DIR, job.storagePath),
      job.detectedEncoding as SourceEncoding,
      job.detectedDelimiter ?? ',',
    );

    const outcome: ImportOutcome = { importedRows: 0, failedRows: 0 };
    let batch: ParsedRow[] = [];
    let index = -1;

    // Same indexing and blank rule as countDataRows, so the two counters add
    // up to totalRows.
    for await (const cells of rows) {
      index += 1;
      if (index <= headerRowIndex || isBlank(cells)) continue;

      const result = toContact(cells, headers, mappings);
      outcome[result.ok ? 'importedRows' : 'failedRows'] += 1;
      batch.push({ rowNumber: index + 1, cells, result });

      if (batch.length === BATCH_SIZE) {
        await this.write(job.id, headers, batch, signal);
        batch = [];
      }
    }
    if (batch.length > 0) await this.write(job.id, headers, batch, signal);

    return outcome;
  }

  private async write(
    jobId: string,
    headers: string[],
    batch: ParsedRow[],
    signal: AbortSignal,
  ): Promise<void> {
    // The lease went to another worker, whose rerun will write these rows.
    signal.throwIfAborted();

    await this.prisma.$transaction(async (tx) => {
      // One at a time, in file order: the same email twice in a batch must
      // let the later row win.
      for (const { result } of batch) {
        if (!result.ok) continue;
        const { contact } = result;
        await tx.contact.upsert({
          where: { email: contact.email },
          create: { id: randomUUID(), ...contact },
          // A blank cell or an unmapped field never erases what is stored.
          update: Object.fromEntries(
            Object.entries(contact).filter(([, value]) => value !== ''),
          ),
        });
      }

      await tx.importError.createMany({
        data: batch.flatMap(({ rowNumber, cells, result }) =>
          result.ok
            ? []
            : [
                {
                  importJobId: jobId,
                  rowNumber,
                  field: 'email',
                  message: result.error,
                  rawRow: toRawRow(cells, headers),
                },
              ],
        ),
        skipDuplicates: true,
      });
    });
  }
}

/** The row keyed by header. A repeated header keeps its leftmost cell. */
function toRawRow(cells: string[], headers: string[]): Record<string, string> {
  const raw: Record<string, string> = {};
  headers.forEach((header, i) => {
    if (!Object.hasOwn(raw, header)) raw[header] = cells[i] ?? '';
  });
  return raw;
}
