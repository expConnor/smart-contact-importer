import { Inject, Injectable, Logger } from '@nestjs/common';
import { WorkerRepository } from './worker.repository';
import {
  ANALYSIS_HANDLER,
  AnalysisOutcome,
  IMPORT_HANDLER,
  ImportOutcome,
  type JobHandler,
  WorkerPhase,
} from './types';
import { env } from '../config/env';

// Written for the person reading the row, not the person reading the log:
// failureReason is rendered in the UI. The error itself goes to logger.error.
const ANALYSIS_FAILED = 'The file could not be read.';
const IMPORT_FAILED = 'The import could not be completed.';

// Three beats per lease: two can be lost to a slow database before the row
// becomes claimable by someone else.
const BEAT_MS = Math.floor((env.WORKER_LEASE_SECONDS * 1000) / 3);

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    private readonly workerRepository: WorkerRepository,
    @Inject(ANALYSIS_HANDLER)
    private readonly analysisHandler: JobHandler<AnalysisOutcome>,
    @Inject(IMPORT_HANDLER)
    private readonly importHandler: JobHandler<ImportOutcome>,
  ) {}

  async tick(): Promise<void> {
    const stalledJobs = await this.workerRepository.failStalled();
    if (stalledJobs.length > 0) {
      this.logger.warn(`Stalled jobs set to FAILED: ${stalledJobs.join(', ')}`);
    }

    await this.runPhase(
      'analysis',
      this.analysisHandler,
      (jobId, outcome) => this.workerRepository.settleAnalysis(jobId, outcome),
      ANALYSIS_FAILED,
    );

    await this.runPhase(
      'import',
      this.importHandler,
      (jobId, outcome) => this.workerRepository.settleImport(jobId, outcome),
      IMPORT_FAILED,
    );
  }

  /** At most one job. Resolves whatever happens — the poll loop depends on it. */
  private async runPhase<T>(
    phase: WorkerPhase,
    handler: JobHandler<T>,
    settle: (jobId: string, outcome: T) => Promise<boolean>,
    failureReason: string,
  ): Promise<void> {
    const job = await this.workerRepository.claim(phase);
    if (!job) return;

    try {
      const outcome = await this.withHeartbeat(job.id, async (signal) => {
        // Demo only: a small CSV is analysed in milliseconds, so a 250 ms
        // poll never sees ANALYZING. Holding the job shows the state in the UI.
        if (env.WORKER_DEMO_DELAY_MS > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, env.WORKER_DEMO_DELAY_MS),
          );
        }
        return handler.run(job, signal);
      });
      const settled = await settle(job.id, outcome);
      if (!settled) this.leaseLost(phase, job.id, 'settle');
    } catch (error) {
      this.logger.error(`${phase} job ${job.id} threw`, detailOf(error));
      const failed = await this.workerRepository.fail(job.id, failureReason);
      if (!failed) this.leaseLost(phase, job.id, 'fail');
    }
  }

  /**
   * Renews the lease under `work`, and aborts it the moment a renewal fails.
   * The timer is unref'd — a pending beat must not hold the process open.
   */
  private async withHeartbeat<T>(
    jobId: string,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | null = null;

    const beat = async (): Promise<void> => {
      let held: boolean;
      try {
        held = await this.workerRepository.extendLease(jobId);
      } catch (error) {
        // The timer owns this call: a throw here is an unhandled rejection.
        this.logger.error(`Heartbeat on job ${jobId} threw`, detailOf(error));
        held = false;
      }

      if (!held) {
        this.logger.warn(`Lease lost on job ${jobId}: heartbeat wrote nothing`);
        controller.abort();
        return;
      }

      schedule();
    };

    const schedule = (): void => {
      if (controller.signal.aborted) return;
      timer = setTimeout(() => void beat(), BEAT_MS);
      timer.unref();
    };

    schedule();

    try {
      return await work(controller.signal);
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
    }
  }

  /** The row belongs to someone else now, so nothing was written. */
  private leaseLost(
    phase: WorkerPhase,
    jobId: string,
    at: 'settle' | 'fail',
  ): void {
    this.logger.warn(
      `Lease lost on ${phase} job ${jobId}: ${at} wrote nothing`,
    );
  }
}

/** `catch` binds `unknown`; Logger.error wants a string for the second arg. */
function detailOf(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
