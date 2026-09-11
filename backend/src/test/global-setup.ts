import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Where `prisma migrate deploy` must run from — prisma.config.ts lives there. */
const BACKEND_ROOT = resolve(__dirname, '../..');
const PRISMA_BIN = resolve(BACKEND_ROOT, 'node_modules/.bin/prisma');

/**
 * Reads the database name out of a Postgres connection string.
 *
 * `?schema=public` is a query string, so it never reaches the pathname — the
 * name is the whole path minus its leading slash.
 */
function databaseName(url: string): string {
  // Leading slash only. A trailing one is deliberately NOT normalised away:
  // the driver would treat `..._test/` as a database literally named with a
  // slash, so stripping it here would have the guard bless a name that is not
  // the one being connected to. Refusing is the correct answer.
  return decodeURIComponent(new URL(url).pathname).replace(/^\//, '');
}

/**
 * Throws unless `url` names a database whose name ends in `_test`.
 *
 * Exported because db.fixture.ts calls it too. globalSetup gates every path
 * that reaches the fixture today, but the fixture is importable on its own and
 * its first act is to TRUNCATE — it should not rely on a caller having checked.
 */
export function assertTestDatabase(url: string | undefined): string {
  if (!url) {
    throw new Error(
      'e2e: DATABASE_URL is unset. Run the suite through `npm run test:e2e`, ' +
        'which loads backend/.env.test.',
    );
  }

  const name = databaseName(url);

  if (!name.endsWith('_test')) {
    throw new Error(
      `e2e: refusing to run against database "${name}" — the name must end in ` +
        '"_test". The suite TRUNCATEs every table before each test, so this is ' +
        'pointed at a real database. An exported DATABASE_URL in your shell ' +
        'outranks .env.test and is the usual cause; unset it.',
    );
  }

  return name;
}

/**
 * Runs once per e2e worker pool, before any spec.
 *
 * The guard is the point of this file. `prisma migrate deploy` is destructive
 * in the one direction that matters — it applies migrations to whatever
 * DATABASE_URL names — and prisma.config.ts calls `process.loadEnvFile('.env')`
 * unconditionally, so the dev URL is always one resolution step away.
 *
 * What keeps them apart: an env var already present in the process wins over
 * both `--env-file` and `loadEnvFile`. `test:e2e` puts the test URL there, the
 * child inherits it, and .env cannot overwrite it. This function refuses to
 * proceed if that ever stops being true.
 */
export default function globalSetup(): void {
  assertTestDatabase(process.env.DATABASE_URL);

  // stdio: 'inherit' so a failed migration prints Prisma's own diagnosis rather
  // than an execFileSync stack trace with the output swallowed.
  execFileSync(PRISMA_BIN, ['migrate', 'deploy'], {
    cwd: BACKEND_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
}
