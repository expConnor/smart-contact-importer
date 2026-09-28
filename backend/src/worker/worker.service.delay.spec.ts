// Own file: the delay is read from env, which is frozen at import, so the
// only way to set it is to mock the module for every test in the file.

import type { WorkerRepository } from './worker.repository';
import { WorkerService } from './worker.service';
import type {
  ClaimedJob,
  ImportOutcome,
  JobHandler,
  WorkerPhase,
} from './types';

jest.mock('../config/env', () => {
  const actual =
    jest.requireActual<typeof import('../config/env')>('../config/env');
  return { env: { ...actual.env, WORKER_DEMO_DELAY_MS: 2000 } };
});

const JOB = { id: '00000000-0000-4000-8000-000000000050' } as ClaimedJob;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the demo delay', () => {
  it('holds a claimed job for WORKER_DEMO_DELAY_MS before running it', async () => {
    const repository = {
      failStalled: jest.fn().mockResolvedValue([]),
      claim: jest
        .fn()
        .mockImplementation((phase: WorkerPhase) =>
          Promise.resolve(phase === 'analysis' ? JOB : null),
        ),
      extendLease: jest.fn().mockResolvedValue(true),
      settleAnalysis: jest.fn().mockResolvedValue(true),
    };
    const analysis = {
      run: jest.fn().mockResolvedValue({}),
    };
    const idleImport: JobHandler<ImportOutcome> = { run: jest.fn() };
    const tick = new WorkerService(
      repository as unknown as WorkerRepository,
      analysis,
      idleImport,
    ).tick();

    await jest.advanceTimersByTimeAsync(1999);
    expect(analysis.run).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(analysis.run).toHaveBeenCalledWith(JOB, expect.any(AbortSignal));

    await tick;
  });
});
