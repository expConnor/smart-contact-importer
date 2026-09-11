// The two things every authenticated e2e test needs: a user row in the test
// database, and a cookie the app will accept for it.
//
// Both exist to keep argon2 out of the suite. A hash is 19 MiB and ~50 ms, a
// verify costs the same again, and a login round-trip pays for one of each —
// so exactly one test in the suite logs in for real (POST /v1/auth/login, in
// auth.e2e.spec.ts) and everything else mints its cookie here.
//
// e2e only. seedUser writes through db.fixture's client, which refuses to open
// outside a `_test` database.

import { randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import { COOKIE_NAME } from '../auth/cookie';
import { TokenService } from '../auth/token.service';
import type { TestApp } from './app.fixture';
import { testDb } from './db.fixture';
import type { User } from '../generated/prisma/client';

/**
 * Must match prisma/seed.ts HASH_OPTIONS. argon2.verify reads its parameters
 * off the digest, so a mismatch here would still verify — it would just be
 * testing a hash the application never produces.
 */
const HASH_OPTIONS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** The password the one real login test logs in with. */
export const TEST_PASSWORD = 'develop';

/**
 * The default passwordHash: not a digest at all, and not meant to be.
 *
 * AuthService.login is the only reader of this column in the whole application,
 * so paying argon2 to seed a test that never logs in buys nothing — and a string
 * that is obviously not a digest makes a test which accidentally depends on one
 * fail loudly rather than pass for the wrong reason.
 *
 * This is about the column, NOT about the row: `ImportJob.userId` is a real
 * foreign key to `User.id`, so an imports test still has to seed a user and
 * mint its cookie for that same id, or the INSERT fails on the constraint.
 */
const UNVERIFIABLE_HASH = 'never-verified-on-this-path';

/**
 * argon2 digests, one per distinct password per spec file.
 *
 * Jest resets the module registry per test file, so this cache spans a file and
 * nothing wider. The memo is what lets a `beforeEach` seed call seedUser with a
 * password: the first call pays, the rest are free.
 *
 * The promise is cached, not the result — two callers awaiting before the first
 * settles would otherwise both start a hash.
 */
const digests = new Map<string, Promise<string>>();

/**
 * The argon2 digest of `password`, computed at most once per spec file.
 *
 * Call it in a `beforeAll` to keep the cost out of the first test's own timing;
 * seedUser({ password }) goes through the same cache either way.
 */
export function passwordHash(password: string): Promise<string> {
  let digest = digests.get(password);
  if (!digest) {
    digest = hash(password, HASH_OPTIONS);
    digests.set(password, digest);
  }
  return digest;
}

/** Distinguishes the default emails within one spec file. Reset by nothing —
 * the TRUNCATE empties the table, so a number never comes back around. */
let seq = 0;

/**
 * `password` and `passwordHash` are mutually exclusive: accepting both would
 * mean silently ignoring one at the call site that bothered to write it.
 */
export type SeedUserOverrides = { id?: string; email?: string } & (
  | { password?: string; passwordHash?: never }
  | { passwordHash?: string; password?: never }
);

/**
 * INSERTs a user and returns the row.
 *
 * Call it from `beforeEach` or from the test body — never `beforeAll`, which
 * runs before setup-e2e.ts's TRUNCATE and so seeds a row the first test wipes.
 *
 * Defaults are unique per call so two users can be seeded in one test without
 * colliding on the email unique index.
 */
export async function seedUser(
  overrides: SeedUserOverrides = {},
): Promise<User> {
  const { id = randomUUID(), email = `user${++seq}@test.com` } = overrides;

  const passwordDigest = overrides.password
    ? await passwordHash(overrides.password)
    : (overrides.passwordHash ?? UNVERIFIABLE_HASH);

  return testDb().user.create({
    data: { id, email, passwordHash: passwordDigest },
  });
}

/**
 * A `Cookie` header value the app will accept as `userId`.
 *
 * Takes the app rather than matching the signature in the phase plan
 * (`cookieFor(userId)`): the token has to be signed with the secret and expiry
 * the running app is configured with, and `ctx.app.get(TokenService)` is the
 * only way to read those without a second copy of the JwtModule options here —
 * a copy that would drift and then mint tokens the app quietly rejects.
 *
 * No database access: the guard verifies a signature and reads `sub`. A cookie
 * for a user that was never seeded is exactly the "valid token, row is gone"
 * case, and is minted the same way.
 */
export function cookieFor(ctx: TestApp, userId: string): string {
  const { token } = ctx.app.get(TokenService).sign(userId);
  return `${COOKIE_NAME}=${token}`;
}
