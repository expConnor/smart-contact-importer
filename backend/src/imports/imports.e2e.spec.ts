import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createTestApp } from '../test/app.fixture';
import type { TestApp } from '../test/app.fixture';
import { cookieFor, seedUser } from '../test/auth.fixture';
import { aJob, seedJobs } from '../test/builders/job.builder';
import {
  aCsv,
  anEmptyCsv,
  anOversizeCsv,
  csvFixture,
} from '../test/builders/upload.builder';
import type { Upload } from '../test/builders/upload.builder';
import { testDb } from '../test/db.fixture';
import { UPLOAD_DIR } from './storage';
import type { ErrorBody, FieldError } from '../common/errors/error-catalogue';

// Unlike contacts, this route needs a real user row: ImportJob.userId is a
// foreign key to User.id, so the cookie and the seeded row must carry the same
// id or the INSERT dies on the constraint rather than on anything under test.
const USER_ID = '00000000-0000-4000-8000-000000000010';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000011';

const KEY = 'key-aaaaaaaa';
const OTHER_KEY = 'key-bbbbbbbb';

// Whatever diskStorage names a file, it is a v4 UUID plus `.csv` — never
// anything the client sent.
const STORED_NAME = /^[0-9a-f-]{36}\.csv$/;

/**
 * Guards the `rm` below.
 *
 * UPLOAD_DIR is read from the environment, and this file deletes everything in
 * it before every test. `.env.test` points it at `./tmp/uploads-test`; a run
 * that somehow loaded `.env` instead would point it at the directory holding
 * real uploads. Same shape as global-setup.ts's `_test` check on DATABASE_URL,
 * and for the same reason — the destructive operation carries its own fence
 * rather than trusting the loader.
 */
function assertDisposableUploadDir(): void {
  if (!basename(UPLOAD_DIR).endsWith('-test')) {
    throw new Error(
      `Refusing to empty ${UPLOAD_DIR}: this suite only deletes an upload ` +
        `directory whose name ends in -test (see UPLOAD_DIR in .env.test).`,
    );
  }
}

/** Filenames currently on disk, sorted so a count failure names them. */
async function storedUploads(): Promise<string[]> {
  return (await readdir(UPLOAD_DIR)).sort();
}

/**
 * The suite's TRUNCATE covers the database; the upload directory is outside it
 * and nothing else empties it, so a file left behind by one test would show up
 * as a leak in the next one.
 */
async function clearUploadDir(): Promise<void> {
  assertDisposableUploadDir();
  const names = await readdir(UPLOAD_DIR);
  await Promise.all(
    names.map((name) => rm(join(UPLOAD_DIR, name), { force: true })),
  );
}

/**
 * sha256 of a buffer, written out rather than calling storage.hashFile.
 *
 * hashFile streams a file through a pipeline; this hashes a buffer in one shot.
 * Same digest, different construction — running the hash under test against
 * itself would agree no matter which algorithm it used.
 */
function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

function fieldErrors(res: { body: unknown }): FieldError[] {
  return (res.body as ErrorBody).error.details as FieldError[];
}

describe('POST /v1/imports', () => {
  let ctx: TestApp;
  let cookie: string;
  let otherCookie: string;

  beforeAll(async () => {
    // Also creates UPLOAD_DIR, via ImportsStorage.onModuleInit.
    ctx = await createTestApp();
    cookie = cookieFor(ctx, USER_ID);
    otherCookie = cookieFor(ctx, OTHER_USER_ID);
  });

  afterAll(async () => {
    await ctx.close();
  });

  // Runs after setup-e2e.ts's TRUNCATE, which is what makes seeding here — and
  // never in beforeAll — the only thing that survives to the test.
  beforeEach(async () => {
    await clearUploadDir();
    await seedUser({ id: USER_ID });
  });

  /** A complete, valid request: cookie, key, and a .csv part. */
  function postImport(key: string, file: Upload, as: string = cookie) {
    return ctx
      .http()
      .post('/v1/imports')
      .set('Cookie', as)
      .set('Idempotency-Key', key)
      .attach('file', file.body, file.filename);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Every rejection below asserts that nothing landed on disk, because the two
  // halves fail independently: a request can be refused correctly and still
  // leave the bytes it refused. Which of the two guards rejects it decides
  // whether multer ever ran — that is the point of testing both.
  // ───────────────────────────────────────────────────────────────────────────
  describe('rejections', () => {
    it('rejects a request with no cookie, before reading the body', async () => {
      const res = await ctx
        .http()
        .post('/v1/imports')
        .set('Idempotency-Key', KEY)
        .attach('file', aCsv().body, aCsv().filename);

      expect(res.status).toBe(401);
      expect((res.body as ErrorBody).error.code).toBe('UNAUTHORIZED');
      await expect(storedUploads()).resolves.toEqual([]);
      await expect(testDb().importJob.count()).resolves.toBe(0);
    });

    it('rejects a request with no Idempotency-Key, before reading the body', async () => {
      const res = await ctx
        .http()
        .post('/v1/imports')
        .set('Cookie', cookie)
        .attach('file', aCsv().body, aCsv().filename);

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
      expect(fieldErrors(res)).toEqual([
        { field: 'Idempotency-Key', message: 'Idempotency-Key is missing' },
      ]);
      // The guard runs ahead of the FileInterceptor, so multer never opened a
      // write stream. Drop @UseGuards(IdempotencyKeyGuard) below the
      // interceptor and the status stays 400 while this line starts failing.
      await expect(storedUploads()).resolves.toEqual([]);
      await expect(testDb().importJob.count()).resolves.toBe(0);
    });

    it('rejects a file that is not a .csv', async () => {
      const res = await postImport(KEY, aCsv({ filename: 'contacts.txt' }));

      expect(res.status).toBe(400);
      expect(fieldErrors(res)).toEqual([
        { field: 'file', message: 'File must be a .csv' },
      ]);
      // acceptCsvOnly runs when the part opens, before a byte is streamed.
      await expect(storedUploads()).resolves.toEqual([]);
      await expect(testDb().importJob.count()).resolves.toBe(0);
    });

    it('rejects a file past MAX_UPLOAD_BYTES with 413, and keeps none of it', async () => {
      const res = await postImport(KEY, anOversizeCsv());

      expect(res.status).toBe(413);
      expect((res.body as ErrorBody).error.code).toBe('PAYLOAD_TOO_LARGE');
      // The interesting half. multer aborts mid-stream, so the controller never
      // runs and ImportsService.create's `finally` never fires — the partial
      // file is cleaned up by multer's own abort path or not at all.
      await expect(storedUploads()).resolves.toEqual([]);
      await expect(testDb().importJob.count()).resolves.toBe(0);
    });

    it('rejects an empty file, and keeps none of it', async () => {
      const res = await postImport(KEY, anEmptyCsv());

      expect(res.status).toBe(400);
      expect(fieldErrors(res)).toEqual([
        { field: 'file', message: 'File cannot be empty' },
      ]);
      // The one rejection that happens AFTER the bytes are on disk: the
      // extension passed the filter, so multer wrote a zero-byte file, and
      // assertCsvPresent is what refuses it.
      //
      // This is the assertion that found the leak. assertCsvPresent used to
      // throw ahead of create()'s try/finally, so `discard` never ran and the
      // zero-byte file stayed forever. Move the call back outside the `try` and
      // this line fails again with the orphan named in the diff.
      await expect(storedUploads()).resolves.toEqual([]);
      await expect(testDb().importJob.count()).resolves.toBe(0);
    });

    it('rejects a request carrying no file at all', async () => {
      const res = await ctx
        .http()
        .post('/v1/imports')
        .set('Cookie', cookie)
        .set('Idempotency-Key', KEY);

      expect(res.status).toBe(400);
      expect(fieldErrors(res)).toEqual([
        { field: 'file', message: 'File is missing' },
      ]);
      // The other half of the fix above. assertCsvPresent now throws from
      // INSIDE the try, so the `finally` runs on a request that has no file to
      // discard — which is why it is guarded with `&& file`. Drop that guard
      // and this is a 500 on `undefined.filename`, not a 400.
      await expect(storedUploads()).resolves.toEqual([]);
      await expect(testDb().importJob.count()).resolves.toBe(0);
    });
  });

  describe('a first upload', () => {
    it('returns 201 with the job id and nothing else', async () => {
      const res = await postImport(KEY, aCsv());

      expect(res.status).toBe(201);
      const job = await testDb().importJob.findFirstOrThrow();
      expect(res.body).toEqual({ id: job.id });
    });

    it('records a row describing the file it actually stored', async () => {
      const file = csvFixture('clean.csv');

      const res = await postImport(KEY, file);
      expect(res.status).toBe(201);

      const [stored] = await storedUploads();
      const job = await testDb().importJob.findFirstOrThrow();

      expect(job).toMatchObject({
        userId: USER_ID,
        idempotencyKey: KEY,
        originalFilename: 'clean.csv',
        storagePath: stored,
        byteSize: file.body.length,
        fileHash: sha256(file.body),
        status: 'PENDING_ANALYSIS',
      });
      // …and storagePath is not a claim about the row alone: the bytes at that
      // path are the bytes that were uploaded. A hash computed over a truncated
      // stream would still be self-consistent.
      await expect(readFile(join(UPLOAD_DIR, stored))).resolves.toEqual(
        file.body,
      );
    });

    it('never lets the client name the file on disk', async () => {
      // A path traversal dressed as a filename. It must not reach storagePath,
      // and it must not reach the filesystem — only originalFilename, which is
      // for display.
      const hostile = aCsv({ filename: '../../etc/passwd.csv' });

      const res = await postImport(KEY, hostile);
      expect(res.status).toBe(201);

      const [stored] = await storedUploads();
      expect(stored).toMatch(STORED_NAME);

      const job = await testDb().importJob.findFirstOrThrow();
      expect(job.storagePath).toBe(stored);
      expect(job.originalFilename).not.toBe(stored);
    });
  });

  // SPEC's test #1. Note there is no separate "concurrent" case: persist()
  // always INSERTs first and arbitrates the P2002, so a sequential replay takes
  // the same branch two simultaneous requests would.
  describe('a replayed Idempotency-Key', () => {
    it('produces one job, answers 200, and keeps one file', async () => {
      const file = aCsv();

      const first = await postImport(KEY, file);
      const second = await postImport(KEY, file);

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);

      await expect(testDb().importJob.count()).resolves.toBe(1);
      // The replay's own upload reached disk before the conflict was known.
      // create()'s `finally` discards it, so the surviving file is the first
      // one — and it is still the one the row points at.
      const stored = await storedUploads();
      expect(stored).toHaveLength(1);
      const job = await testDb().importJob.findFirstOrThrow();
      expect(job.storagePath).toBe(stored[0]);
    });

    it('rejects the same key carrying different bytes with 409', async () => {
      const first = await postImport(KEY, csvFixture('clean.csv'));
      const second = await postImport(KEY, csvFixture('partial-rows.csv'));

      expect(first.status).toBe(201);
      expect(second.status).toBe(409);
      expect((second.body as ErrorBody).error.code).toBe('CONFLICT');
      expect(fieldErrors(second)).toEqual([
        {
          field: 'Idempotency-Key',
          message: 'Key was already used for a different file',
        },
      ]);

      // The conflict changes nothing: one job, still describing the first file.
      await expect(testDb().importJob.count()).resolves.toBe(1);
      const job = await testDb().importJob.findFirstOrThrow();
      expect(job.originalFilename).toBe('clean.csv');
      await expect(storedUploads()).resolves.toHaveLength(1);
    });

    it('scopes the key to one user, so another user may reuse it', async () => {
      await seedUser({ id: OTHER_USER_ID });
      const file = aCsv();

      const mine = await postImport(KEY, file);
      const theirs = await postImport(KEY, file, otherCookie);

      expect(mine.status).toBe(201);
      // 201, not 200: the unique is (userId, idempotencyKey). Narrow it to
      // idempotencyKey alone and this replays someone else's job instead.
      expect(theirs.status).toBe(201);
      expect(theirs.body).not.toEqual(mine.body);

      const owners = await testDb().importJob.findMany({
        select: { userId: true },
        orderBy: { userId: 'asc' },
      });
      expect(owners).toEqual([{ userId: USER_ID }, { userId: OTHER_USER_ID }]);
      await expect(storedUploads()).resolves.toHaveLength(2);
    });

    it('treats a second key from the same user as a second job', async () => {
      const file = aCsv();

      const first = await postImport(KEY, file);
      const second = await postImport(OTHER_KEY, file);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      // Identical bytes, different key: the hash is not the identity, the key
      // is. Two jobs, two files.
      await expect(testDb().importJob.count()).resolves.toBe(2);
      await expect(storedUploads()).resolves.toHaveLength(2);
    });
  });
});

describe('GET /v1/imports/:id', () => {
  let ctx: TestApp;
  let cookie: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    cookie = cookieFor(ctx, USER_ID);
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await seedUser({ id: USER_ID });
    await seedUser({ id: OTHER_USER_ID });
  });

  function getImport(id: string) {
    return ctx.http().get(`/v1/imports/${id}`).set('Cookie', cookie);
  }

  describe('rejections', () => {
    it('rejects a request with no cookie', async () => {
      const [job] = await seedJobs([aJob({ userId: USER_ID })]);

      const res = await ctx.http().get(`/v1/imports/${job.id}`);

      expect(res.status).toBe(401);
      expect((res.body as ErrorBody).error.code).toBe('UNAUTHORIZED');
    });

    it('rejects an id that is not a UUID with 400, not a 500', async () => {
      // Without ParseUUIDPipe this reaches Postgres, which refuses the cast on
      // a @db.Uuid column — and that error is not an HttpException.
      const res = await getImport('not-a-uuid');

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
    });

    it('answers 404 for an id that matches no job', async () => {
      const res = await getImport(randomUUID());

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
    });

    it("answers another user's job exactly as it answers an unknown id", async () => {
      const [theirs] = await seedJobs([aJob({ userId: OTHER_USER_ID })]);

      const res = await getImport(theirs.id);
      const unknown = await getImport(randomUUID());

      // 404, not 403: a different answer would confirm the id exists. The
      // bodies are compared to each other, not only to a code, so any detail
      // that leaks into one of them fails here.
      expect(res.status).toBe(404);
      expect(res.body).toEqual(unknown.body);
    });
  });

  describe('a job the caller owns', () => {
    it('projects an analysed job, unwrapping the stored JSON', async () => {
      // Written with every column the analysis step fills, including the ones
      // the body leaves out, so a leak shows up as an extra key below.
      const job = await testDb().importJob.create({
        data: {
          ...aJob({
            userId: USER_ID,
            status: 'AWAITING_MAPPING',
            detectedDelimiter: ',',
            detectedEncoding: 'utf-8',
            headerRowIndex: 0,
            inferenceSource: 'HEURISTIC',
            totalRows: 2,
          }),
          detectedHeaders: { headers: ['email', 'name'] },
          sampleRows: {
            rows: [
              ['ada@example.com', 'Ada Lovelace'],
              ['grace@example.com', 'Grace Hopper'],
            ],
          },
          proposedMapping: {
            mappings: [
              { sourceColumn: 'email', targetField: 'email', confidence: 0.9 },
              { sourceColumn: 'name', targetField: 'name', confidence: 0.9 },
            ],
          },
        },
      });

      const res = await getImport(job.id);

      expect(res.status).toBe(200);
      // toEqual, not toMatchObject: the keys the body must NOT carry (the lease,
      // storage details, detectedHeaders/Delimiter/Encoding, confirmedMapping)
      // are asserted by being absent here.
      expect(res.body).toEqual({
        id: job.id,
        status: 'AWAITING_MAPPING',
        headerRowIndex: 0,
        sampleRows: [
          ['ada@example.com', 'Ada Lovelace'],
          ['grace@example.com', 'Grace Hopper'],
        ],
        proposedMapping: [
          { sourceColumn: 'email', targetField: 'email', confidence: 0.9 },
          { sourceColumn: 'name', targetField: 'name', confidence: 0.9 },
        ],
        inferenceSource: 'HEURISTIC',
        failureReason: null,
        totalRows: 2,
        importedRows: 0,
        failedRows: 0,
      });
    });

    it('answers a job not yet analysed with nulls, not a crash', async () => {
      // The JSON columns are NULL here, so the mapper's unwrap has nothing to
      // unwrap. `row.sampleRows.rows` would be a 500.
      const [job] = await seedJobs([aJob({ userId: USER_ID })]);

      const res = await getImport(job.id);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: job.id,
        status: 'PENDING_ANALYSIS',
        headerRowIndex: null,
        sampleRows: null,
        proposedMapping: null,
        inferenceSource: null,
        failureReason: null,
        totalRows: null,
        importedRows: 0,
        failedRows: 0,
      });
    });
  });
});
