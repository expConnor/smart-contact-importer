// Fake timers and a stub repository. The heartbeat is a timer wrapped around a
// promise, and neither half is observable against a real database: the no-op
// handlers resolve before a beat can fire. What the lease SQL actually writes
// is worker.repository.e2e.spec.ts's business.

import { env } from '../config/env';
import type { WorkerRepository } from './worker.repository';
import { WorkerService } from './worker.service';
import type {
  AnalysisOutcome,
  ClaimedJob,
  ImportOutcome,
  JobHandler,
  WorkerPhase,
} from './types';

// The service beats three times per lease, so advancing by a whole lease is
// guaranteed to fire at least one.
const LEASE_MS = env.WORKER_LEASE_SECONDS * 1000;

const JOB: ClaimedJob = {
  id: '00000000-0000-4000-8000-000000000040',
  userId: '00000000-0000-4000-8000-000000000041',
  storagePath: 'uploads/contacts.csv',
  originalFilename: 'contacts.csv',
  byteSize: 128,
  attempts: 1,
  detectedHeaders: null,
  detectedDelimiter: null,
  detectedEncoding: null,
  headerRowIndex: null,
  confirmedMapping: null,
  totalRows: null,
};

const ANALYSIS: AnalysisOutcome = {
  detectedHeaders: { headers: ['Email'] },
  detectedDelimiter: ',',
  detectedEncoding: 'utf-8',
  headerRowIndex: 0,
  sampleRows: { rows: [] },
  proposedMapping: { mappings: [] },
  inferenceSource: 'HEURISTIC',
  inferenceFallback: 'NO_KEY',
  totalRows: 1,
};

/** One analysis job on offer, nothing for the import phase. */
function repositoryStub() {
  return {
    failStalled: jest.fn().mockResolvedValue([]),
    claim: jest
      .fn()
      .mockImplementation((phase: WorkerPhase) =>
        Promise.resolve(phase === 'analysis' ? JOB : null),
      ),
    extendLease: jest.fn().mockResolvedValue(true),
    settleAnalysis: jest.fn().mockResolvedValue(true),
    settleImport: jest.fn().mockResolvedValue(true),
    fail: jest.fn().mockResolvedValue(true),
  };
}

/** Hangs until the test releases it, and keeps the signal it was handed. */
function hangingHandler() {
  let release!: () => void;
  const hung = new Promise<AnalysisOutcome>((resolve) => {
    release = () => resolve(ANALYSIS);
  });
  let handed: AbortSignal | null = null;

  return {
    run: (_job: ClaimedJob, signal: AbortSignal): Promise<AnalysisOutcome> => {
      handed = signal;
      return hung;
    },
    finish: () => release(),
    signal: () => handed,
  };
}

const IDLE_IMPORT: JobHandler<ImportOutcome> = {
  run: () => Promise.resolve({ importedRows: 0, failedRows: 0 }),
};

function serviceWith(
  repository: ReturnType<typeof repositoryStub>,
  handler: JobHandler<AnalysisOutcome>,
): WorkerService {
  return new WorkerService(
    repository as unknown as WorkerRepository,
    handler,
    IDLE_IMPORT,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the heartbeat', () => {
  it('renews the lease while the handler is still working', async () => {
    const repository = repositoryStub();
    const handler = hangingHandler();
    const tick = serviceWith(repository, handler).tick();

    await jest.advanceTimersByTimeAsync(LEASE_MS);

    expect(repository.extendLease).toHaveBeenCalledWith(JOB.id);

    handler.finish();
    await tick;
  });

  it('aborts the handler once the lease is lost', async () => {
    const repository = repositoryStub();
    repository.extendLease.mockResolvedValue(false);
    const handler = hangingHandler();
    const tick = serviceWith(repository, handler).tick();

    await jest.advanceTimersByTimeAsync(LEASE_MS);

    expect(handler.signal()?.aborted).toBe(true);

    handler.finish();
    await tick;
  });
});
