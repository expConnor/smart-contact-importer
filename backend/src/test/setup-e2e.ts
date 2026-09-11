import { disconnectTestDb, resetDb } from './db.fixture';

/**
 * Registered as the e2e project's setupFilesAfterEnv, so it runs for every e2e
 * spec file whether or not the spec knows it exists.
 *
 * Structural on purpose: isolation that each spec opts into is isolation one
 * spec eventually forgets, and the failure surfaces in a different file.
 *
 * beforeEach, not afterEach: a failed test leaves its rows in place for
 * inspection, and a spec that crashes before its cleanup still starts the next
 * one clean.
 *
 * Ordering a seeding spec can rely on (verified, not assumed): Jest runs
 * beforeEach hooks in registration order, and setupFilesAfterEnv is evaluated
 * before the spec file. So this TRUNCATE always lands FIRST, and a spec that
 * seeds in its own beforeEach keeps those rows.
 *
 * Which means: a seed in beforeAll does NOT survive — this wipes it before the
 * first test. Put the expensive half in beforeAll (an argon2 hash computed
 * once) and the INSERT that uses it in beforeEach.
 */
beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectTestDb();
});
