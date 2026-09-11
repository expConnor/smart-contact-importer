// Postgres is not doubled here (D3). The app talks to smart_contact_importer_test,
// setup-e2e.ts TRUNCATEs it before every test, and db.fixture.ts reads the rows
// back on a separate connection. A Prisma double can only prove that a service
// called Prisma a certain way — which is exactly what four toHaveBeenCalledWith
// assertions proved, right up until a behaviour-preserving refactor broke all
// four without changing a single response.
//
// Anything built on this is an e2e spec and MUST be named `*.e2e.spec.ts`, or it
// lands in the unit project, which runs with no container.

import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { VALIDATION_PIPE_OPTIONS } from '../common/errors/validation.options';

export type CreateTestAppOptions = {
  /**
   * Replaces PrismaService for this one app. The opt-out, and not a
   * recommendation — D3 says Postgres is never doubled.
   *
   * Named after the phase that deletes it, because there is nothing structural
   * stopping a new spec from reaching for it and D4's own argument applies:
   * a fence each spec opts into is a fence one spec eventually forgets.
   *
   * T2 took auth.e2e.spec.ts off it. ONE caller remains — contacts.e2e.spec.ts
   * (T3), declaring its own stub in its own file. `grep -rn prismaDoubleUntilT3
   * src` is the whole census; when it names no file but this one, delete the
   * field and the branch below. That is what finishes D1.
   *
   * `unknown` on purpose. A shape-checked type is not available: a stub like
   * `{ user: { findUnique: jest.fn() } }` cannot satisfy Partial<PrismaService>
   * without spelling out a whole delegate, so the choice is `unknown` or a
   * second mock type — and a second mock type is the thing T1 deleted.
   */
  prismaDoubleUntilT3?: unknown;
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
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  });

  if (options.prismaDoubleUntilT3 !== undefined) {
    builder
      .overrideProvider(PrismaService)
      .useValue(options.prismaDoubleUntilT3);
  }

  const moduleRef = await builder.compile();

  // logger: false — AppErrorFilter warns on every branch; otherwise runs are noise.
  const app = moduleRef.createNestApplication({ logger: false });

  // ─── mirrors main.ts ───
  app.enableVersioning({ type: VersioningType.URI });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
  // ──────────────────────

  // Connects PrismaService (onModuleInit), unless a double displaced it.
  await app.init();

  return {
    app,
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
