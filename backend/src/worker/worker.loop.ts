import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { WorkerService } from './worker.service';
import { env } from '../config/env';

const POLL_JITTER_MS = 250;

@Injectable()
export class WorkerLoop
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WorkerLoop.name);
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped: boolean = false;

  constructor(private readonly worker: WorkerService) {}

  onApplicationBootstrap(): void {
    if (!env.WORKER_ENABLED) {
      this.logger.log(
        'Worker loop disabled; nothing will drain the queue here',
      );
      return;
    }

    this.logger.log(
      `Worker loop polling every ${env.WORKER_POLL_INTERVAL_MS}ms`,
    );
    this.schedule(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;

    await this.inFlight?.catch(() => undefined);
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.runOnce(), delayMs);
  }

  private async runOnce(): Promise<void> {
    const tick = this.worker.tick();
    this.inFlight = tick;

    try {
      await tick;
    } catch (error) {
      this.logger.error(
        'tick() rejected',
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    } finally {
      this.inFlight = null;
      this.schedule(
        env.WORKER_POLL_INTERVAL_MS +
          Math.floor(Math.random() * POLL_JITTER_MS),
      );
    }
  }
}
