import { createTestApp } from '../test/app.fixture';
import type { TestApp } from '../test/app.fixture';
import { seedUser } from '../test/auth.fixture';
import { aJob, aStalledJob, seedJobs } from '../test/builders/job.builder';
import { testDb } from '../test/db.fixture';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { WorkerRepository } from './worker.repository';
import type { AnalysisOutcome, ImportOutcome } from './types';

const USER_ID = '00000000-0000-4000-8000-000000000020';

let ctx: TestApp;
let w1: WorkerRepository;
let w2: WorkerRepository;

const ANALYSIS: AnalysisOutcome = {
  detectedHeaders: { headers: ['Email', 'Name'] },
  detectedDelimiter: ';',
  detectedEncoding: 'windows-1252',
  headerRowIndex: 3,
  sampleRows: { rows: [] },
  proposedMapping: { mappings: [] },
  inferenceSource: 'HEURISTIC',
  totalRows: 42,
};

const IMPORT: ImportOutcome = { importedRows: 3, failedRows: 2 };

function jobRow(id: string) {
  return testDb().importJob.findUniqueOrThrow({ where: { id } });
}

function leaseExpiryOf(row: { leaseExpiresAt: Date | null }): number {
  if (row.leaseExpiresAt === null) {
    throw new Error('expected this row to carry a lease');
  }
  return row.leaseExpiresAt.getTime();
}

beforeAll(async () => {
  ctx = await createTestApp();
  const prisma = ctx.app.get(PrismaService);
  w1 = new WorkerRepository(prisma, 'W-1');
  w2 = new WorkerRepository(prisma, 'W-2');
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await seedUser({ id: USER_ID });
});

describe('claim', () => {
  it('returns null when the queue is empty', async () => {
    expect(await w1.claim('analysis')).toBeNull();
  });

  it('claims a pending job and stamps the lease', async () => {
    const [job] = await seedJobs([aJob({ userId: USER_ID })]);

    const claimed = await w1.claim('analysis');
    expect(claimed?.id).toBe(job.id);

    const row = await jobRow(job.id);
    expect(row.status).toBe('ANALYZING');
    expect(row.leaseOwner).toBe('W-1');
    expect(row.attempts).toBe(1);
    expect(leaseExpiryOf(row)).toBeGreaterThan(Date.now());
  });

  it('finds nothing on a second claim while the lease is live', async () => {
    await seedJobs([aJob({ userId: USER_ID })]);

    expect(await w1.claim('analysis')).not.toBeNull();
    expect(await w1.claim('analysis')).toBeNull();
  });

  it('takes the oldest job first', async () => {
    const [oldest] = await seedJobs([
      aJob({ userId: USER_ID }),
      aJob({ userId: USER_ID }),
    ]);

    const claimed = await w1.claim('analysis');
    expect(claimed?.id).toBe(oldest.id);
  });

  it('does not cross the two queues', async () => {
    const [job] = await seedJobs([
      aJob({ userId: USER_ID, status: 'PENDING_IMPORT' }),
    ]);

    expect(await w1.claim('analysis')).toBeNull();
    expect((await w1.claim('import'))?.id).toBe(job.id);
  });

  it('never hands the same job to two workers', async () => {
    await seedJobs([aJob({ userId: USER_ID }), aJob({ userId: USER_ID })]);

    const [a, b] = await Promise.all([
      w1.claim('analysis'),
      w2.claim('analysis'),
    ]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a?.id).not.toBe(b?.id);
  });

  it('recovers a job whose worker died, and counts the attempt', async () => {
    const [job] = await seedJobs([
      aStalledJob({ userId: USER_ID, attempts: 1 }),
    ]);

    const claimed = await w1.claim('analysis');
    expect(claimed?.id).toBe(job.id);

    const row = await jobRow(job.id);
    expect(row.leaseOwner).toBe('W-1');
    expect(row.attempts).toBe(2);
  });

  it('leaves a stalled job alone once attempts are exhausted', async () => {
    await seedJobs([
      aStalledJob({ userId: USER_ID, attempts: env.WORKER_MAX_ATTEMPTS }),
    ]);

    expect(await w1.claim('analysis')).toBeNull();
  });
});

describe('the lease guard', () => {
  type GuardedCall = (
    repo: WorkerRepository,
    jobId: string,
  ) => Promise<boolean>;

  const LEASE_GUARDED: [name: string, call: GuardedCall][] = [
    ['extendLease', (repo, id) => repo.extendLease(id)],
    ['settleAnalysis', (repo, id) => repo.settleAnalysis(id, ANALYSIS)],
    ['settleImport', (repo, id) => repo.settleImport(id, IMPORT)],
    ['fail', (repo, id) => repo.fail(id, 'gave up')],
  ];

  it.each(LEASE_GUARDED)(
    '%s returns false when another worker holds the lease',
    async (_name, call) => {
      const [job] = await seedJobs([aJob({ userId: USER_ID })]);
      await w1.claim('analysis');

      expect(await call(w2, job.id)).toBe(false);

      const row = await jobRow(job.id);
      expect(row.status).toBe('ANALYZING');
      expect(row.leaseOwner).toBe('W-1');
    },
  );

  it.each(LEASE_GUARDED)(
    '%s returns false once the lease has lapsed',
    async (_name, call) => {
      const [job] = await seedJobs([
        aStalledJob({ userId: USER_ID, attempts: 1, leaseOwner: 'W-1' }),
      ]);

      expect(await call(w1, job.id)).toBe(false);
    },
  );
});

describe('extendLease', () => {
  it('pushes the holders lease into the future', async () => {
    const [job] = await seedJobs([aJob({ userId: USER_ID })]);
    await w1.claim('analysis');
    const before = leaseExpiryOf(await jobRow(job.id));

    expect(await w1.extendLease(job.id)).toBe(true);

    expect(leaseExpiryOf(await jobRow(job.id))).toBeGreaterThanOrEqual(before);
  });
});

describe('settleAnalysis', () => {
  it('records the findings and releases the lease', async () => {
    const [job] = await seedJobs([aJob({ userId: USER_ID })]);
    await w1.claim('analysis');

    expect(await w1.settleAnalysis(job.id, ANALYSIS)).toBe(true);

    const row = await jobRow(job.id);
    expect(row.status).toBe('AWAITING_MAPPING');
    expect(row.headerRowIndex).toBe(ANALYSIS.headerRowIndex);
    expect(row.detectedDelimiter).toBe(ANALYSIS.detectedDelimiter);
    expect(row.inferenceSource).toBe('HEURISTIC');
    expect(row.totalRows).toBe(ANALYSIS.totalRows);
    expect(row.leaseOwner).toBeNull();
    expect(row.leaseExpiresAt).toBeNull();
  });
});

describe('settleImport', () => {
  it('completes the job with both counters', async () => {
    const [job] = await seedJobs([
      aJob({ userId: USER_ID, status: 'PENDING_IMPORT' }),
    ]);
    await w1.claim('import');

    expect(await w1.settleImport(job.id, IMPORT)).toBe(true);

    const row = await jobRow(job.id);
    expect(row.status).toBe('COMPLETED');
    expect(row.importedRows).toBe(IMPORT.importedRows);
    expect(row.failedRows).toBe(IMPORT.failedRows);
    expect(row.completedAt).not.toBeNull();
    expect(row.leaseOwner).toBeNull();
  });
});

describe('fail', () => {
  it('gives up on the job with a reason the user can read', async () => {
    const [job] = await seedJobs([aJob({ userId: USER_ID })]);
    await w1.claim('analysis');

    expect(await w1.fail(job.id, 'unreadable file')).toBe(true);

    const row = await jobRow(job.id);
    expect(row.status).toBe('FAILED');
    expect(row.failureReason).toBe('unreadable file');
    expect(row.leaseOwner).toBeNull();
  });
});

describe('failStalled', () => {
  it('buries an expired job that has exhausted its attempts', async () => {
    const [job] = await seedJobs([
      aStalledJob({ userId: USER_ID, attempts: env.WORKER_MAX_ATTEMPTS }),
    ]);

    expect(await w1.failStalled()).toEqual([job.id]);

    const row = await jobRow(job.id);
    expect(row.status).toBe('FAILED');
    expect(row.failureReason).not.toBeNull();
    expect(row.leaseOwner).toBeNull();
  });

  it('leaves a stalled job below the cap for claim() to recover', async () => {
    const [job] = await seedJobs([
      aStalledJob({ userId: USER_ID, attempts: env.WORKER_MAX_ATTEMPTS - 1 }),
    ]);

    expect(await w1.failStalled()).toEqual([]);
    expect((await jobRow(job.id)).status).toBe('ANALYZING');
  });

  it('leaves a live lease alone', async () => {
    await seedJobs([aJob({ userId: USER_ID })]);
    await w1.claim('analysis');

    expect(await w1.failStalled()).toEqual([]);
  });
});
