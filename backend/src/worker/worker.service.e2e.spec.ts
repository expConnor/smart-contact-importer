// tick() is called by hand. Nothing here starts the poll loop, and the loop
// must never start under test — createTestApp boots the real AppModule, so a
// timer would claim the job the test is about to assert on.
//
// How settle writes a row is worker.repository.e2e.spec.ts's business. This
// file proves tick() reaches both phases, that the analysis phase runs the real
// handler against the uploaded bytes, and what it does when the work throws.

import { createTestApp } from '../test/app.fixture';
import type { TestApp } from '../test/app.fixture';
import { cookieFor, seedUser } from '../test/auth.fixture';
import { aJob, seedJobs } from '../test/builders/job.builder';
import { aCsv, csvFixture } from '../test/builders/upload.builder';
import type { Upload } from '../test/builders/upload.builder';
import { testDb } from '../test/db.fixture';
import { WorkerService } from './worker.service';
import type { CreateImportResponseDto } from '../imports/dto/create-import-response.dto';
import type { ImportJobResponseDto } from '../imports/dto/import-job-response.dto';

const USER_ID = '00000000-0000-4000-8000-000000000030';
const KEY = 'key-cccccccc';

let ctx: TestApp;
let worker: WorkerService;
let cookie: string;

function jobRow(id: string) {
  return testDb().importJob.findUniqueOrThrow({ where: { id } });
}

/** Through the API, so the file is on disk where the handler will look. */
async function upload(file: Upload): Promise<string> {
  const res = await ctx
    .http()
    .post('/v1/imports')
    .set('Cookie', cookie)
    .set('Idempotency-Key', KEY)
    .attach('file', file.body, file.filename)
    .expect(201);
  return (res.body as CreateImportResponseDto).id;
}

beforeAll(async () => {
  ctx = await createTestApp();
  // Resolved from the container, not constructed: the wiring is under test.
  worker = ctx.app.get(WorkerService);
  cookie = cookieFor(ctx, USER_ID);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await seedUser({ id: USER_ID });
});

describe('tick', () => {
  it('carries an uploaded file to AWAITING_MAPPING with its real findings', async () => {
    const id = await upload(aCsv());

    await worker.tick();

    // aCsv() is a header and two rows. The fake handler this replaced answered
    // headerRowIndex 3 and totalRows 42 for every file, so both numbers below
    // fail against it.
    expect(await jobRow(id)).toMatchObject({
      status: 'AWAITING_MAPPING',
      headerRowIndex: 0,
      totalRows: 2,
      inferenceSource: 'HEURISTIC',
      // The stored shape is a { mappings } wrapper, not a bare array.
      proposedMapping: {
        mappings: expect.arrayContaining([
          expect.objectContaining({
            sourceColumn: 'email',
            targetField: 'email',
          }),
        ]) as unknown,
      },
    });
  });

  it('skips the preamble of a LinkedIn export, end to end', async () => {
    const id = await upload(csvFixture('linkedin-connections.csv'));

    await worker.tick();

    const res = await ctx
      .http()
      .get(`/v1/imports/${id}`)
      .set('Cookie', cookie)
      .expect(200);

    // Three lines of "Notes:" preamble sit above the header. A parser that
    // takes row 0 as the header offers `Notes:` as a column; one that takes it
    // as data counts it as a contact.
    expect(res.body).toMatchObject({
      status: 'AWAITING_MAPPING',
      headerRowIndex: 3,
      totalRows: 10,
      // One entry per header, in order, and nothing else.
      proposedMapping: [
        'First Name',
        'Last Name',
        'URL',
        'Email Address',
        'Company',
        'Position',
        'Connected On',
      ].map((sourceColumn): unknown =>
        expect.objectContaining({ sourceColumn }),
      ),
    });
    const { sampleRows } = res.body as { sampleRows: string[][] };
    expect(sampleRows[0].slice(0, 2)).toEqual(['Kai', 'Ferreira']);
  });

  it('carries a mapped job to COMPLETED', async () => {
    // Seeded, not confirmed through the API: this case is the import phase
    // alone. The walk through the mapping route is the next test.
    const [job] = await seedJobs([
      aJob({ userId: USER_ID, status: 'PENDING_IMPORT' }),
    ]);

    await worker.tick();

    expect((await jobRow(job.id)).status).toBe('COMPLETED');
  });

  it('takes an upload through its own proposed mapping to COMPLETED', async () => {
    const id = await upload(csvFixture('clean.csv'));

    await worker.tick();

    const analysed = await ctx
      .http()
      .get(`/v1/imports/${id}`)
      .set('Cookie', cookie)
      .expect(200);
    const { headerRowIndex, proposedMapping } =
      analysed.body as ImportJobResponseDto;

    // Sent back untouched. The matcher and the route both run validateMapping's
    // rules, so a proposal the route refuses is a bug in one of the two.
    const confirmed = await ctx
      .http()
      .post(`/v1/imports/${id}/mapping`)
      .set('Cookie', cookie)
      .send({ headerRowIndex, mappings: proposedMapping });
    expect(confirmed.status).toBe(202);
    expect((confirmed.body as ImportJobResponseDto).status).toBe(
      'PENDING_IMPORT',
    );

    await worker.tick();

    expect((await jobRow(id)).status).toBe('COMPLETED');
  });

  it('fails the job when the work throws, and still resolves', async () => {
    // Seeded, never uploaded: storagePath names a file that is not on disk, so
    // the real handler's read throws. Same path as an upload deleted from under
    // a queued job.
    const [job] = await seedJobs([aJob({ userId: USER_ID })]);

    // A rejection here would kill the poll loop, so it is half the assertion.
    await expect(worker.tick()).resolves.toBeUndefined();

    const row = await jobRow(job.id);
    expect(row.status).toBe('FAILED');
    // worker.service.ts's constant, written out on purpose: this string is what
    // the user reads, so changing it should be a deliberate edit here too.
    expect(row.failureReason).toBe('The file could not be read.');
    expect(row.leaseOwner).toBeNull();
  });
});
