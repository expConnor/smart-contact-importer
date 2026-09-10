import { COOKIE_NAME } from '../auth/cookie';
import { TokenService } from '../auth/token.service';
import { createTestApp } from '../test/app.fixture';
import type { TestApp } from '../test/app.fixture';
import type { ErrorBody } from '../common/errors/error-catalogue';
import type { Contact } from '../generated/prisma/client';

const USER_ID = '00000000-0000-4000-8000-000000000001';

// Newest first — the order the service asks findMany for. A body matching this
// sequence proves the controller passes the database's order through untouched.
const ROWS: Contact[] = [
  {
    id: '00000000-0000-4000-8000-0000000000a2',
    email: 'second@test.com',
    name: 'Second Contact',
    company: 'Acme',
    jobTitle: 'CTO',
    phone: '+15550002',
    status: 'active',
    createdAt: new Date('2026-09-08T10:00:00.000Z'),
    updatedAt: new Date('2026-09-08T11:00:00.000Z'),
  },
  {
    id: '00000000-0000-4000-8000-0000000000a1',
    email: 'first@test.com',
    name: 'First Contact',
    company: 'Globex',
    jobTitle: 'CEO',
    phone: '+15550001',
    status: 'archived',
    createdAt: new Date('2026-09-07T10:00:00.000Z'),
    updatedAt: new Date('2026-09-07T11:00:00.000Z'),
  },
];

// Hand-written, not built by calling toContactResponseDto — asserting the
// mapper against itself would pass no matter what the mapper does.
const EXPECTED_ITEMS = [
  {
    id: '00000000-0000-4000-8000-0000000000a2',
    email: 'second@test.com',
    name: 'Second Contact',
    company: 'Acme',
    jobTitle: 'CTO',
    phone: '+15550002',
    status: 'active',
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T11:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a1',
    email: 'first@test.com',
    name: 'First Contact',
    company: 'Globex',
    jobTitle: 'CEO',
    phone: '+15550001',
    status: 'archived',
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T11:00:00.000Z',
  },
];

// Older than both rows above, so a limit of 2 leaves it hanging off the end of
// the page. This is the probe row: fetched, never returned, only encoded.
const OVERFLOW_ROW: Contact = {
  id: '00000000-0000-4000-8000-0000000000a0',
  email: 'third@test.com',
  name: 'Third Contact',
  company: 'Initech',
  jobTitle: 'COO',
  phone: '+15550003',
  status: 'active',
  createdAt: new Date('2026-09-06T10:00:00.000Z'),
  updatedAt: new Date('2026-09-06T11:00:00.000Z'),
};

// Decoded by hand rather than by calling decodeCursor — running the codec
// against itself would pass no matter what the codec does.
function readCursor(raw: string): unknown {
  return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
}

// The inverse of readCursor, and hand-rolled for the same reason: a cursor
// built by encodeCursor would prove only that the codec agrees with itself.
function writeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

// Same, for payloads that are not JSON at all.
function writeCursorRaw(raw: string): string {
  return Buffer.from(raw, 'utf8').toString('base64url');
}

describe('GET /v1/contacts', () => {
  let ctx: TestApp;
  let cookie: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    // The guard verifies a signature and reads no row, so signing with the
    // app's own TokenService is a whole login round-trip cheaper.
    const { token } = ctx.app.get(TokenService).sign(USER_ID);
    cookie = `${COOKIE_NAME}=${token}`;
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(() => {
    ctx.prisma.contact.findMany.mockReset();
  });

  it('rejects a request with no cookie', async () => {
    const res = await ctx.http().get('/v1/contacts');

    expect(res.status).toBe(401);
    // Rejected in the guard — the service never ran.
    expect(ctx.prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it('returns the rows in an { items, nextCursor } envelope', async () => {
    ctx.prisma.contact.findMany.mockResolvedValueOnce(ROWS);

    const res = await ctx.http().get('/v1/contacts').set('Cookie', cookie);

    expect(res.status).toBe(200);
    // Exact match: the envelope has no third key and the rows lost no field.
    expect(res.body).toEqual({ items: EXPECTED_ITEMS, nextCursor: null });
  });

  it('asks the database for a total order, and for nothing else', async () => {
    ctx.prisma.contact.findMany.mockResolvedValueOnce(ROWS);

    await ctx.http().get('/v1/contacts').set('Cookie', cookie);

    expect(ctx.prisma.contact.findMany).toHaveBeenCalledTimes(1);
    // Exact argument: an empty `where` (no filters supplied), no `select`, no
    // cursor on page one, and the `id` tiebreaker that makes createdAt a total
    // order rather than a partial one. 51, not 50: the default page plus the
    // probe row that answers "is there more?".
    expect(ctx.prisma.contact.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: undefined,
      take: 51,
    });
  });

  it('asks for one row more than the page holds', async () => {
    ctx.prisma.contact.findMany.mockResolvedValueOnce(ROWS);

    await ctx.http().get('/v1/contacts?limit=2').set('Cookie', cookie);

    expect(ctx.prisma.contact.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: undefined,
      take: 3,
    });
  });

  it('withholds the extra row and points the cursor at it', async () => {
    ctx.prisma.contact.findMany.mockResolvedValueOnce([...ROWS, OVERFLOW_ROW]);

    const res = await ctx
      .http()
      .get('/v1/contacts?limit=2')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const body = res.body as { items: unknown[]; nextCursor: string };
    // The probe row is absent from the page...
    expect(body.items).toEqual(EXPECTED_ITEMS);
    // ...and is exactly what the cursor names, so page two opens on it and no
    // contact falls through the boundary.
    expect(readCursor(body.nextCursor)).toEqual({
      id: OVERFLOW_ROW.id,
      sort: '-createdAt',
      filters: [],
    });
  });

  it('carries the requested sort in the cursor, not the default', async () => {
    ctx.prisma.contact.findMany.mockResolvedValueOnce([...ROWS, OVERFLOW_ROW]);

    const res = await ctx
      .http()
      .get('/v1/contacts?limit=2&sort=company')
      .set('Cookie', cookie);

    const { nextCursor } = res.body as { nextCursor: string };
    expect(readCursor(nextCursor)).toEqual({
      id: OVERFLOW_ROW.id,
      sort: 'company',
      filters: [],
    });
  });

  it('opens page two on the row the cursor names', async () => {
    ctx.prisma.contact.findMany.mockResolvedValueOnce(ROWS);
    const cursorParam = writeCursor({
      id: OVERFLOW_ROW.id,
      sort: '-createdAt',
      filters: [],
    });

    const res = await ctx
      .http()
      .get(`/v1/contacts?limit=2&cursor=${cursorParam}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    // No `skip`: the cursor names the first row of this page, not the last row
    // of the previous one, so Prisma's inclusive cursor is already correct.
    // A `skip: 1` here would swallow OVERFLOW_ROW entirely.
    expect(ctx.prisma.contact.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: { id: OVERFLOW_ROW.id },
      take: 3,
    });
  });

  it('rejects a cursor issued under a different sort', async () => {
    // Page one was sorted by -createdAt; the client then switches to company
    // and replays the old cursor. Honouring it would page one ordering with
    // another ordering's boundary — rows repeat, rows vanish.
    const cursorParam = writeCursor({
      id: OVERFLOW_ROW.id,
      sort: '-createdAt',
    });

    const res = await ctx
      .http()
      .get(`/v1/contacts?limit=2&sort=company&cursor=${cursorParam}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
    expect(ctx.prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['not base64 at all', '!!!not-a-cursor!!!'],
    ['base64 of something that is not JSON', writeCursorRaw('plain text')],
    ['JSON with no id', writeCursor({ sort: '-createdAt' })],
    ['JSON with an empty id', writeCursor({ id: '', sort: '-createdAt' })],
    [
      'JSON naming a column that cannot be sorted on',
      writeCursor({ id: OVERFLOW_ROW.id, sort: 'email' }),
    ],
  ])('rejects a cursor that is %s', async (_label, cursorParam) => {
    const res = await ctx
      .http()
      .get(`/v1/contacts?cursor=${encodeURIComponent(cursorParam)}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
    // Rejected while parsing the query — a tampered cursor never reaches the DB.
    expect(ctx.prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it('returns no cursor when the page is full and nothing follows', async () => {
    // Two rows for a limit of two: the boundary where a naive `length === limit`
    // check would invent a page that does not exist.
    ctx.prisma.contact.findMany.mockResolvedValueOnce(ROWS);

    const res = await ctx
      .http()
      .get('/v1/contacts?limit=2')
      .set('Cookie', cookie);

    expect(res.body).toEqual({ items: EXPECTED_ITEMS, nextCursor: null });
  });

  it.each(['0', '201', 'abc'])(
    'rejects limit=%s rather than clamping it',
    async (limit) => {
      const res = await ctx
        .http()
        .get(`/v1/contacts?limit=${limit}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
      expect(ctx.prisma.contact.findMany).not.toHaveBeenCalled();
    },
  );

  it('answers an empty table with 200 and an empty list', async () => {
    ctx.prisma.contact.findMany.mockResolvedValueOnce([]);

    const res = await ctx.http().get('/v1/contacts').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('rejects an unknown query parameter rather than ignoring it', async () => {
    const res = await ctx
      .http()
      .get('/v1/contacts?sort=nope')
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
    expect(ctx.prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it('serialises timestamps and drops columns the DTO does not declare', async () => {
    // A column the row might carry that the DTO does not declare. The mapper
    // hand-lists its fields, so the row leaks nothing beyond the contract.
    const withStrayColumn = { ...ROWS[0], userId: USER_ID };
    ctx.prisma.contact.findMany.mockResolvedValueOnce([withStrayColumn]);

    const res = await ctx.http().get('/v1/contacts').set('Cookie', cookie);

    expect(res.status).toBe(200);
    const [item] = (res.body as { items: Record<string, unknown>[] }).items;
    expect(item.createdAt).toBe('2026-09-08T10:00:00.000Z');
    expect(item).not.toHaveProperty('userId');
  });
});
