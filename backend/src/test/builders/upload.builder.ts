// Multipart CSV payloads for e2e specs.
//
// The unit of this builder is the pair supertest's `.attach()` wants — a
// filename and the bytes — because both halves matter to the code under test
// and for different reasons:
//
// - the bytes decide `fileHash`, and therefore whether a replayed
//   Idempotency-Key is a replay (200) or a conflict (409);
// - the filename decides whether `acceptCsvOnly` lets the part through at all,
//   and it is what lands in `originalFilename`. It is NEVER what lands on disk.
//
// Deliberately unlike contact.builder.ts: `aCsv()` returns the SAME bytes on
// every call. Contacts vary per call because two rows must not collide on a
// unique index; uploads are the opposite — the replay test's whole point is
// that two requests carry identical bytes, so identity is the default and
// variation is something a caller has to ask for.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../../config/env';

/** What `.attach('file', body, filename)` needs. */
export type Upload = { filename: string; body: Buffer };

const DEFAULT_FILENAME = 'contacts.csv';

const DEFAULT_ROWS = [
  'email,name,company',
  'ada@example.com,Ada Lovelace,Analytical Engines',
  'grace@example.com,Grace Hopper,UNIVAC',
];

/**
 * A small, well-formed CSV.
 *
 * Nothing in Phase 1 parses it — `POST /imports` hashes the bytes, writes a
 * row and returns. The content is well-formed anyway so that a spec which
 * later grows past the upload does not have to re-arrange.
 */
export function aCsv(
  overrides: { filename?: string; rows?: string[] } = {},
): Upload {
  const { filename = DEFAULT_FILENAME, rows = DEFAULT_ROWS } = overrides;
  return { filename, body: Buffer.from(`${rows.join('\n')}\n`, 'utf8') };
}

/**
 * Zero bytes under a `.csv` name.
 *
 * Passes `acceptCsvOnly` (which reads the extension only) and reaches
 * `assertCsvPresent`, which is the only thing that rejects it. An empty file is
 * therefore a *service* rejection, not a transport one — the file is on disk by
 * the time anyone notices.
 */
export function anEmptyCsv(filename = DEFAULT_FILENAME): Upload {
  return { filename, body: Buffer.alloc(0) };
}

/**
 * A payload past `MAX_UPLOAD_BYTES`, so multer's `limits.fileSize` aborts it.
 *
 * Two things this must not do, or it stops testing the limit:
 *
 * - Take a hardcoded size. The cap is read from the environment, so lowering
 *   `MAX_UPLOAD_BYTES` in `.env.test` to make the test cheap would leave a
 *   payload that no longer proves anything about the configured value.
 * - Take a non-`.csv` name. `acceptCsvOnly` runs when the part opens, before a
 *   single byte streams, so a `.txt` of any size is a 400 from the filter and
 *   the size limit is never reached.
 *
 * Measured, not derived — the arithmetic in multer (which widens busboy's own
 * limit to `fileSize + 1`) predicts a different boundary than the one the stack
 * actually has. Statuses observed against this app, at 10485760:
 *
 *   MAX - 1 → 201    MAX → 413    MAX + 1 → 413    MAX + 2 → 413
 *
 * So the cap is exclusive: a file of exactly `MAX_UPLOAD_BYTES` is already too
 * large. `+ 1` is used anyway, to be a payload that is over the cap under any
 * reading of it rather than one sitting on the boundary.
 *
 * The content is filler. The abort happens in the transport; nothing parses it.
 */
export function anOversizeCsv(
  bytes = env.MAX_UPLOAD_BYTES + 1,
  filename = DEFAULT_FILENAME,
): Upload {
  return { filename, body: Buffer.alloc(bytes, 0x61) };
}

/**
 * The repository's `fixtures/` directory — the same five files SPEC names, and
 * the ones a reviewer uploads by hand.
 *
 * Relative to this file rather than to `process.cwd()`: Jest's cwd is
 * `backend/`, but nothing guarantees that for a future runner, and a loader
 * that silently reads the wrong directory would fail as "file not found" in a
 * spec that has nothing to do with paths.
 */
const FIXTURES_DIR = resolve(__dirname, '../../../../fixtures');

/**
 * A real file from `fixtures/`, read fresh on each call.
 *
 * Two uses, and they are not the same use:
 *
 * - bytes nobody in this repository chose, so an assertion about `fileHash` or
 *   `byteSize` is about the file rather than about the builder that made it;
 * - two genuinely different files, which is the honest arrangement for
 *   "same key, different bytes".
 */
export function csvFixture(name: string): Upload {
  return { filename: name, body: readFileSync(resolve(FIXTURES_DIR, name)) };
}
