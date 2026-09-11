import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { assertTestDatabase } from './global-setup';

/**
 * The suite's own client, separate from the app's PrismaService.
 *
 * Separate on purpose: resetDb() has to work before the app is built and after
 * it is closed, and a test that asserts on rows should read them through a
 * connection the request under test did not share.
 *
 * Jest resets the module registry per test file, so this is one client per
 * spec file, closed by the afterAll in setup-e2e.ts.
 */
let client: PrismaClient | undefined;
let disconnected = false;

export function testDb(): PrismaClient {
  // Jest runs a setupFilesAfterEnv afterAll BEFORE the spec's own afterAll, so
  // a spec that reads rows in its afterAll lands here after disconnectTestDb.
  // Without this it would silently build a second client nobody closes, and the
  // run would hang on an open handle in whichever file happened to do it.
  if (disconnected) {
    throw new Error(
      'testDb() called after the suite disconnected. A spec afterAll runs ' +
        'after setup-e2e.ts closes the client — move this read into the test ' +
        'body or an afterEach.',
    );
  }

  if (!client) {
    assertTestDatabase(process.env.DATABASE_URL);
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      // Silent, and silent the blunt way. PrismaService solves the same
      // problem by emitting events and forwarding them to the Nest Logger,
      // which `createTestApp` switches off with `logger: false` — but this
      // client is not in the Nest container and has no logger to forward to.
      // It issues one statement, that statement is ours, and there is nothing
      // here worth hearing about.
      log: [],
    });
  }
  return client;
}

export async function disconnectTestDb(): Promise<void> {
  disconnected = true;
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

/**
 * Empties every application table.
 *
 * The list is read from pg_tables rather than written down, so a new model in
 * schema.prisma is covered by the next migration with no edit here — a
 * hand-maintained list fails by leaving rows behind, which shows up as an
 * unrelated test failing later.
 *
 * `_prisma_migrations` is excluded: truncating it would make globalSetup's
 * `migrate deploy` replay the whole history on the next run.
 *
 * One statement, not one per table: CASCADE inside a single TRUNCATE ignores
 * foreign keys between the listed tables, so ImportError/ImportJob/User need no
 * ordering. RESTART IDENTITY resets sequences so ids do not drift across tests.
 */
export async function resetDb(): Promise<void> {
  const db = testDb();

  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '\\_prisma%'
  `;

  if (tables.length === 0) return;

  // Identifiers cannot be bound as parameters. They come from pg_tables, not
  // from a test, and are quoted — but keep it that way if this list ever grows
  // a source that is not the catalogue.
  const list = tables
    .map(({ tablename }) => `"public"."${tablename}"`)
    .join(', ');

  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
