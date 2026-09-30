// The import step, driven the way a user drives it: upload, tick (analysis),
// confirm a mapping, tick (import). Rows are read back through testDb, and the
// recorded errors through GET /v1/imports/:id, which is where a user sees them.
//
// tick() is called by hand. The poll loop never starts under test.

import { randomUUID } from 'node:crypto';
import { createTestApp } from '../../test/app.fixture';
import type { TestApp } from '../../test/app.fixture';
import { cookieFor, seedUser } from '../../test/auth.fixture';
import { aContact, seedContacts } from '../../test/builders/contact.builder';
import { aCsv, csvFixture } from '../../test/builders/upload.builder';
import type { Upload } from '../../test/builders/upload.builder';
import { testDb } from '../../test/db.fixture';
import { WorkerService } from '../worker.service';
import type { CreateImportResponseDto } from '../../imports/dto/create-import-response.dto';
import type { ColumnMapping } from '../../imports/types';

const USER_ID = '00000000-0000-4000-8000-000000000040';

/** The slice of GET /v1/imports/:id these tests read. */
type ImportBody = {
  status: string;
  headerRowIndex: number;
  proposedMapping: ColumnMapping[];
  importedRows: number;
  failedRows: number;
  inferenceFallback: string | null;
  attempts: number;
  maxAttempts: number;
  byteSize: number;
  detectedEncoding: string | null;
  detectedDelimiter: string | null;
  errors: {
    rowNumber: number;
    field: string;
    message: string;
    rawRow: Record<string, string>;
  }[];
};

let ctx: TestApp;
let worker: WorkerService;
let cookie: string;

beforeAll(async () => {
  ctx = await createTestApp();
  worker = ctx.app.get(WorkerService);
  cookie = cookieFor(ctx, USER_ID);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await seedUser({ id: USER_ID });
});

async function getImport(id: string): Promise<ImportBody> {
  const res = await ctx
    .http()
    .get(`/v1/imports/${id}`)
    .set('Cookie', cookie)
    .expect(200);
  return res.body as ImportBody;
}

/**
 * Upload → analyse → confirm → import. Confirms the proposed mapping unless
 * the test brings its own. Returns the job id.
 */
async function importFile(
  file: Upload,
  mappings?: ColumnMapping[],
): Promise<string> {
  const uploaded = await ctx
    .http()
    .post('/v1/imports')
    .set('Cookie', cookie)
    .set('Idempotency-Key', `key-${randomUUID()}`)
    .attach('file', file.body, file.filename)
    .expect(201);
  const { id } = uploaded.body as CreateImportResponseDto;

  await worker.tick();

  const analysed = await getImport(id);
  expect(analysed.status).toBe('AWAITING_MAPPING');

  await ctx
    .http()
    .post(`/v1/imports/${id}/mapping`)
    .set('Cookie', cookie)
    .send({
      headerRowIndex: analysed.headerRowIndex,
      mappings: mappings ?? analysed.proposedMapping,
    })
    .expect(202);

  await worker.tick();

  return id;
}

/** Every contact, by email, so a failure prints a readable list. */
function contacts() {
  return testDb().contact.findMany({ orderBy: { email: 'asc' } });
}

function jobRow(id: string) {
  return testDb().importJob.findUniqueOrThrow({ where: { id } });
}

describe('partial-rows.csv', () => {
  it('imports the three good rows and records the two bad ones', async () => {
    const id = await importFile(csvFixture('partial-rows.csv'));

    const body = await getImport(id);
    expect(body).toMatchObject({
      status: 'COMPLETED',
      importedRows: 3,
      failedRows: 2,
    });

    // Tolerated fields go in as written: `ext. 4471` and an empty phone.
    expect(await contacts()).toEqual([
      expect.objectContaining({
        email: 'hana.nakamura@juniperdental.test',
        name: 'Hana Nakamura',
        company: 'Juniper Dental',
        jobTitle: 'Office Manager',
        phone: '',
        status: 'lead',
      }),
      expect.objectContaining({
        email: 'nadia.haddad@sableandroe.test',
        phone: 'ext. 4471',
      }),
      expect.objectContaining({
        email: 'rosa.silva@meridianlabs.test',
        name: 'Rosa Silva',
      }),
    ]);

    // rowNumber is the spreadsheet row: the header is row 1, so Sven (the
    // second data row) is row 3 and Ivo (the fourth) is row 5.
    expect(body.errors).toEqual([
      {
        rowNumber: 3,
        field: 'email',
        message: 'Email is missing',
        rawRow: {
          'Full Name': 'Sven Jensen',
          Email: '',
          Company: 'Copperline Energy',
          Title: 'Supply Chain Manager',
          Phone: '+45 33 12 44 90',
          Status: 'active',
        },
      },
      {
        rowNumber: 5,
        field: 'email',
        message: 'Email is not a valid address',
        rawRow: {
          'Full Name': 'Ivo Petrov',
          Email: 'ivo[at]orbitalmedia.test',
          Company: 'Orbital Media',
          Title: 'Sales Engineer',
          Phone: '+359 2 987 1122',
          Status: 'dormant',
        },
      },
    ]);
  });

  // A worker that crashed after writing and before settling leaves the job
  // IMPORTING with a lapsed lease. The next claim runs the whole file again.
  it('converges on the same result when the job runs again', async () => {
    const id = await importFile(csvFixture('partial-rows.csv'));
    const before = await contacts();

    await testDb().importJob.update({
      where: { id },
      data: {
        status: 'IMPORTING',
        leaseOwner: 'DEAD-WORKER',
        leaseExpiresAt: new Date(Date.now() - 60_000),
        completedAt: null,
      },
    });
    await worker.tick();

    const body = await getImport(id);
    expect(body).toMatchObject({
      status: 'COMPLETED',
      importedRows: 3,
      failedRows: 2,
    });
    // Same rows, same ids: updated in place, not deleted and re-created.
    expect((await contacts()).map(({ id, email }) => ({ id, email }))).toEqual(
      before.map(({ id, email }) => ({ id, email })),
    );
    expect(body.errors.map((e) => e.rowNumber)).toEqual([3, 5]);
    await expect(
      testDb().importError.count({ where: { importJobId: id } }),
    ).resolves.toBe(2);
  });
});

describe('linkedin-connections.csv', () => {
  it('imports the connections and nothing from the preamble', async () => {
    const id = await importFile(csvFixture('linkedin-connections.csv'));

    const body = await getImport(id);
    // Ten rows under the header; Lena and Pia have no email.
    expect(body).toMatchObject({
      status: 'COMPLETED',
      importedRows: 8,
      failedRows: 2,
    });

    const rows = await contacts();
    expect(rows).toHaveLength(8);
    expect(rows.map((c) => c.name)).not.toContain('Notes:');
    expect(rows.map((c) => c.email)).toContain(
      'kai.ferreira@tidewaterlogistics.test',
    );

    // Notes (1), the quoted paragraph (2), a blank line (3), the header (4).
    // Lena is row 6 and Pia row 10 — the preamble is counted, as a spreadsheet
    // would count it.
    expect(
      body.errors.map(({ rowNumber, rawRow }) => ({
        rowNumber,
        name: rawRow['First Name'],
      })),
    ).toEqual([
      { rowNumber: 6, name: 'Lena' },
      { rowNumber: 10, name: 'Pia' },
    ]);
  });
});

describe('a second file that overlaps the first', () => {
  it('keeps stored fields that the new file leaves blank or unmapped', async () => {
    const [rosa] = await seedContacts([
      aContact({
        email: 'rosa.silva@meridianlabs.test',
        name: 'Rosa Silva',
        company: 'Meridian Labs',
        jobTitle: 'Data Analyst',
        phone: '+351 21 099 3312',
        status: 'lead',
      }),
    ]);

    // Company blank, Phone and Title not in the file at all, Status ignored.
    // Only the name carries something new.
    const id = await importFile(
      aCsv({
        filename: 'overlap.csv',
        rows: [
          'Email,Full Name,Company,Status',
          'Rosa.Silva@meridianlabs.test,Rosa S. Silva,,churned',
        ],
      }),
      [
        { sourceColumn: 'Email', targetField: 'email', confidence: 1 },
        { sourceColumn: 'Full Name', targetField: 'name', confidence: 1 },
        { sourceColumn: 'Company', targetField: 'company', confidence: 1 },
        { sourceColumn: 'Status', targetField: '__ignore__', confidence: 1 },
      ],
    );

    expect((await jobRow(id)).status).toBe('COMPLETED');
    expect(await contacts()).toEqual([
      expect.objectContaining({
        id: rosa.id,
        email: 'rosa.silva@meridianlabs.test',
        name: 'Rosa S. Silva',
        company: 'Meridian Labs',
        jobTitle: 'Data Analyst',
        phone: '+351 21 099 3312',
        status: 'lead',
      }),
    ]);
  });
});

describe('the run facts', () => {
  it('reports how the import ran', async () => {
    const file = csvFixture('clean.csv');
    const id = await importFile(file);

    // attempts counts the import phase only: the analysis settle resets it.
    expect(await getImport(id)).toMatchObject({
      status: 'COMPLETED',
      attempts: 1,
      maxAttempts: 3,
      byteSize: file.body.length,
      detectedEncoding: 'utf-8',
      detectedDelimiter: ',',
      inferenceFallback: 'NO_KEY',
    });
  });
});

describe('the SPEC fixtures', () => {
  // Contacts per file: every row has a valid email except LinkedIn's two.
  it.each([
    ['clean.csv', 10, 0],
    ['linkedin-connections.csv', 8, 2],
    ['google-contacts.csv', 8, 0],
    ['typeform-responses.csv', 6, 0],
    ['excel-de.csv', 10, 0],
  ])('imports %s to COMPLETED', async (name, imported, failed) => {
    const id = await importFile(csvFixture(name));

    expect(await jobRow(id)).toMatchObject({
      status: 'COMPLETED',
      importedRows: imported,
      failedRows: failed,
    });
    await expect(testDb().contact.count()).resolves.toBe(imported);
  });
});
