import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { WorkerRepository } from './worker.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { hostname } from 'node:os';
import { ANALYSIS_HANDLER, IMPORT_HANDLER, WORKER_ID } from './types';
import { NoopAnalysisHandler } from './handlers/noop.analysis.handler';
import { NoopImportHandler } from './handlers/noop.import.handler';
import { WorkerLoop } from './worker.loop';

@Module({
  imports: [PrismaModule],
  providers: [
    WorkerService,
    WorkerRepository,
    WorkerLoop,
    { provide: WORKER_ID, useValue: `${hostname()}#${process.pid}` },
    { provide: ANALYSIS_HANDLER, useClass: NoopAnalysisHandler },
    { provide: IMPORT_HANDLER, useClass: NoopImportHandler },
  ],
})
export class WorkerModule {}
