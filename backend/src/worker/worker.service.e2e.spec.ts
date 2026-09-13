// tick() is called by hand. Nothing here starts the poll loop, and the loop
// must never start under test — createTestApp boots the real AppModule, so a
// timer would claim the job the test is about to assert on.
//
// What each phase writes to the row is worker.repository.e2e.spec.ts's
// business. This file only proves tick() reaches both of them, and what it
// does when the work throws.

import { createTestApp } from '../test/app.fixture';
import type { TestApp } from '../test/app.fixture';
import { cookieFor, seedUser } from '../test/auth.fixture';
import { aJob, seedJobs } from '../test/builders/job.builder';
import { aCsv } from '../test/builders/upload.builder';
import { testDb } from '../test/db.fixture';
import { WorkerRepository } from './worker.repository';
import { WorkerService } from './worker.service';
import type { CreateImportResponseDto } from '../imports/dto/create-import-response.dto';

const USER_ID = '00000000-0000-4000-8000-000000000030';
const KEY = 'key-cccccccc';

let ctx: TestApp;
let worker: WorkerService;
let cookie: string;

function jobRow(id: string) {
  return testDb().importJob.findUniqueOrThrow({ where: { id } });
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

// The throwing test spies on a prototype the whole app shares. Without this it
// would leak into every test after it in this file.
afterEach(() => {
  jest.restoreAllMocks();
});

describe('tick', () => {
  it('carries an uploaded file to AWAITING_MAPPING', async () => {
    const file = aCsv();
    const res = await ctx
      .http()
      .post('/v1/imports')
      .set('Cookie', cookie)
      .set('Idempotency-Key', KEY)
      .attach('file', file.body, file.filename)
      .expect(201);
    const { id } = res.body as CreateImportResponseDto;

    await worker.tick();

    expect((await jobRow(id)).status).toBe('AWAITING_MAPPING');
  });

  it('carries a mapped job to COMPLETED', async () => {
    // Seeded, not confirmed through the API: PENDING_IMPORT is the state the
    // mapping route will leave behind, and that route does not exist yet.
    const [job] = await seedJobs([
      aJob({ userId: USER_ID, status: 'PENDING_IMPORT' }),
    ]);

    await worker.tick();

    expect((await jobRow(job.id)).status).toBe('COMPLETED');
  });

  it('fails the job when the work throws, and still resolves', async () => {
    const [job] = await seedJobs([aJob({ userId: USER_ID })]);
    // The only seam at this slice: the work is inline. Slice iv replaces this
    // spy with a throwing handler provider.
    jest
      .spyOn(WorkerRepository.prototype, 'settleAnalysis')
      .mockRejectedValueOnce(new Error('boom'));

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
