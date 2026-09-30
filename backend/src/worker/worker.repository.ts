import { Inject, Injectable } from '@nestjs/common';
import {
  claimJob,
  extendLease,
  failJob,
  failStalledJobs,
  settleAnalysisJob,
  settleImportJob,
} from '../generated/prisma/sql';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnalysisOutcome,
  ClaimedJob,
  ImportOutcome,
  PHASE_QUEUES,
  WORKER_ID,
  WorkerPhase,
} from './types';
import { env } from '../config/env';

@Injectable()
export class WorkerRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WORKER_ID) private readonly leaseOwner: string,
  ) {}

  /** Terminal-fails jobs whose worker died with attempts exhausted. Returns the ids, for the log line. */
  async failStalled(): Promise<string[]> {
    const result = await this.prisma.$queryRawTyped(
      failStalledJobs(env.WORKER_MAX_ATTEMPTS),
    );
    return result.map((r) => r.id);
  }

  async claim(workerPhase: WorkerPhase): Promise<ClaimedJob | null> {
    const phase = PHASE_QUEUES[workerPhase];
    const result = await this.prisma.$queryRawTyped(
      claimJob(
        this.leaseOwner,
        env.WORKER_LEASE_SECONDS,
        phase.pending,
        phase.active,
        env.WORKER_MAX_ATTEMPTS,
      ),
    );
    return result[0] ?? null;
  }

  async extendLease(jobId: string): Promise<boolean> {
    const result = await this.prisma.$queryRawTyped(
      extendLease(this.leaseOwner, jobId, env.WORKER_LEASE_SECONDS),
    );
    return result.length > 0;
  }

  async settleAnalysis(
    jobId: string,
    outcome: AnalysisOutcome,
  ): Promise<boolean> {
    const result = await this.prisma.$queryRawTyped(
      settleAnalysisJob(
        this.leaseOwner,
        jobId,
        outcome.detectedHeaders,
        outcome.detectedDelimiter,
        outcome.detectedEncoding,
        outcome.headerRowIndex,
        outcome.sampleRows,
        outcome.proposedMapping,
        outcome.inferenceSource,
        outcome.totalRows,
        outcome.inferenceFallback,
      ),
    );
    return result.length > 0;
  }

  async settleImport(jobId: string, outcome: ImportOutcome): Promise<boolean> {
    const result = await this.prisma.$queryRawTyped(
      settleImportJob(
        this.leaseOwner,
        jobId,
        outcome.importedRows,
        outcome.failedRows,
      ),
    );
    return result.length > 0;
  }

  async fail(jobId: string, reason: string): Promise<boolean> {
    const result = await this.prisma.$queryRawTyped(
      failJob(this.leaseOwner, jobId, reason),
    );
    return result.length > 0;
  }
}
