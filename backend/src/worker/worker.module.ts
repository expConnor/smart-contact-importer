import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { WorkerRepository } from './worker.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { hostname } from 'node:os';
import {
  ANALYSIS_HANDLER,
  COLUMN_GUESSER,
  IMPORT_HANDLER,
  NoColumnGuesser,
  WORKER_ID,
} from './types';
import { AnalysisHandler } from './handlers/analysis.handler';
import { ImportHandler } from './handlers/import.handler';
import { WorkerLoop } from './worker.loop';
import { env } from '../config/env';
import { ClaudeColumnGuesser } from '../imports/analysis/claude-guesser';

@Module({
  imports: [PrismaModule],
  providers: [
    WorkerService,
    WorkerRepository,
    WorkerLoop,
    { provide: WORKER_ID, useValue: `${hostname()}#${process.pid}` },
    { provide: ANALYSIS_HANDLER, useClass: AnalysisHandler },
    { provide: IMPORT_HANDLER, useClass: ImportHandler },
    {
      provide: COLUMN_GUESSER,
      useFactory: () =>
        env.ANTHROPIC_API_KEY
          ? new ClaudeColumnGuesser(env.ANTHROPIC_API_KEY)
          : new NoColumnGuesser(),
    },
  ],
})
export class WorkerModule {}
