import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { VALIDATION_PIPE_OPTIONS } from '../common/errors/validation.options';

// Auth touches Postgres for exactly one thing: reading a user by email. Mocking
// it keeps `npm run check` hermetic — no container, no seed, no .env.test.
// Real-database tests belong to the paging slice, where the database IS the
// thing under test.
export type PrismaMock = {
  user: { findUnique: jest.Mock };
};

export function createPrismaMock(): PrismaMock {
  return { user: { findUnique: jest.fn() } };
}

export type CreateTestAppOptions = {
  // Supply one to share it across a describe block; omitted, a fresh mock is made.
  prisma?: PrismaMock;
  // Test-module-only controllers (probes, throwers). Never added to AppModule.
  controllers?: Type<unknown>[];
};

/**
 * Boots the real AppModule wired exactly as `main.ts` wires it.
 *
 * Every global registered in main.ts MUST be mirrored below. A global that
 * exists in one and not the other means the suite passes against an app the
 * reviewer never runs.
 */
export async function createTestApp(options: CreateTestAppOptions = {}) {
  const prisma = options.prisma ?? createPrismaMock();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  // logger: false — AppErrorFilter warns on every branch; otherwise runs are noise.
  const app = moduleRef.createNestApplication({ logger: false });

  // ─── mirrors main.ts ───
  app.enableVersioning({ type: VersioningType.URI });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
  // ──────────────────────

  await app.init();

  return {
    app,
    prisma,
    http: () => request(app.getHttpServer() as App),
    close: () => app.close(),
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/**
 * `set-cookie` is `string | string[] | undefined` depending on count. Normalise
 * before asserting, or a one-cookie response silently fails an array matcher.
 */
export function setCookies(res: request.Response): string[] {
  const raw: unknown = res.headers['set-cookie'];
  if (raw === undefined) return [];
  return Array.isArray(raw) ? (raw as string[]) : [raw as string];
}

/** The `name=value` pair of a named cookie, or undefined if it was not set. */
export function findCookie(
  res: request.Response,
  name: string,
): string | undefined {
  return setCookies(res).find((c) => c.startsWith(`${name}=`));
}
