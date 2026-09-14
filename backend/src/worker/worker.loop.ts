/**
 * Polls the job queue on a timer, one tick at a time.
 *
 * Invariant: at most one timer armed and at most one tick running.
 * A setTimeout *chain* (not setInterval) enforces this — the next delay is
 * only measured once the current tick has settled, so a slow tick can never
 * overlap the next one.
 *
 * Lifecycle: bootstrap arms the first tick; destroy latches `stopped`,
 * cancels the pending timer, and waits for a running tick to finish.
 */

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { WorkerService } from './worker.service';
import { env } from '../config/env';

const POLL_JITTER_MS = 250;

@Injectable()
export class WorkerLoop implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerLoop.name);
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  /** One-way latch. Stops a tick already in `finally` from arming another timer. */
  private stopped = false;

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

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    // Cancels a timer that is already armed
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;

    await this.inFlight?.catch(() => undefined);
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.runTick(), delayMs);
  }

  private nextDelayMs(): number {
    return (
      env.WORKER_POLL_INTERVAL_MS + Math.floor(Math.random() * POLL_JITTER_MS)
    );
  }

  private async runTick(): Promise<void> {
    // Published synchronously, before the await: a shutdown landing between
    // these two lines must still see a tick to wait for.
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
      this.schedule(this.nextDelayMs());
    }
  }
}
