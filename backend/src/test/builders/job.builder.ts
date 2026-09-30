import { randomUUID } from 'node:crypto';
import { testDb } from '../db.fixture';
import type { ImportJob } from '../../generated/prisma/client';

export type JobRow = Omit<
  ImportJob,
  'detectedHeaders' | 'sampleRows' | 'proposedMapping' | 'confirmedMapping'
>;

const FIRST_CREATED_AT = Date.UTC(2026, 8, 1); // 2026-09-01T00:00:00.000Z

/** One second between consecutive rows — far wider than Timestamptz(3). */
const SPACING_MS = 1000;

let seq = 0;

/** How far in the past a dead worker's lease sits. Any positive value does. */
const LEASE_LAPSED_MS = 60_000;

export type JobOverrides = Partial<JobRow> & Pick<JobRow, 'userId'>;

export function aJob(overrides: JobOverrides): JobRow {
  const n = ++seq;
  const createdAt = new Date(FIRST_CREATED_AT + n * SPACING_MS);

  return {
    id: randomUUID(),
    idempotencyKey: `key-${n}`,
    fileHash: `hash-${n}`,
    originalFilename: `upload-${n}.csv`,
    storagePath: `${randomUUID()}.csv`,
    byteSize: 1024,
    status: 'PENDING_ANALYSIS',
    failureReason: null,
    leaseExpiresAt: null,
    leaseOwner: null,
    attempts: 0,
    detectedDelimiter: null,
    detectedEncoding: null,
    headerRowIndex: null,
    inferenceSource: null,
    inferenceFallback: null,
    totalRows: null,
    importedRows: 0,
    failedRows: 0,
    createdAt,
    updatedAt: createdAt,
    startedAt: createdAt,
    completedAt: null,
    ...overrides,
  };
}

export function aStalledJob(
  overrides: JobOverrides & Pick<JobRow, 'attempts'>,
): JobRow {
  return aJob({
    status: 'ANALYZING',
    leaseOwner: 'DEAD-WORKER',
    leaseExpiresAt: new Date(Date.now() - LEASE_LAPSED_MS),
    ...overrides,
  });
}

export async function seedJobs(rows: JobRow[]): Promise<JobRow[]> {
  await testDb().importJob.createMany({ data: rows });
  return rows;
}
