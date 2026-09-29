import { PrismaService } from '../prisma/prisma.service';
import { createTestApp } from '../test/app.fixture';
import type { TestApp } from '../test/app.fixture';
import { cookieFor } from '../test/auth.fixture';
import { aContact, seedContacts } from '../test/builders/contact.builder';
import type { ErrorBody } from '../common/errors/error-catalogue';

// No user row is seeded anywhere in this file, and that is not an oversight:
// JwtAuthGuard verifies a signature and reads `sub`, and no contacts route
// loads the user. A seedUser here would imply a precondition that does not
// exist. (Imports is the opposite case — ImportJob.userId is a real FK.)
const USER_ID = '00000000-0000-4000-8000-000000000001';

// Every key ContactResponseDto declares, and nothing else.
const DTO_FIELDS = [
  'id',
  'email',
  'name',
  'company',
  'jobTitle',
  'phone',
  'status',
  'createdAt',
  'updatedAt',
];

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

type PageBody = { items: { id: string }[]; nextCursor: string | null };

// A cap, not a termination condition. The loop is meant to end on a null
// nextCursor; running out of iterations is a failure, and throws as one.
const MAX_PAGES = 20;

describe('GET /v1/contacts', () => {
  let ctx: TestApp;
  let cookie: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    cookie = cookieFor(ctx, USER_ID);
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Observation, not substitution (D3): the spy wraps the live client and the
   * call still reaches Postgres. It answers exactly one question — did the
   * request get past validation — which is the only thing the deleted
   * `not.toHaveBeenCalled()` assertions were ever really asking.
   *
   * Install it BEFORE the request.
   */
  function watchTheDatabase() {
    return jest.spyOn(ctx.app.get(PrismaService).contact, 'findMany');
  }

  /** Follows nextCursor to exhaustion, returning every id in the order seen. */
  async function pageThrough(
    query: string,
  ): Promise<{ ids: string[]; pages: number }> {
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    while (pages < MAX_PAGES) {
      const url =
        cursor === null
          ? query
          : `${query}&cursor=${encodeURIComponent(cursor)}`;

      const res = await ctx.http().get(url).set('Cookie', cookie);
      expect(res.status).toBe(200);
      pages++;

      const body = res.body as PageBody;
      ids.push(...body.items.map((item) => item.id));

      if (body.nextCursor === null) return { ids, pages };
      cursor = body.nextCursor;
    }

    throw new Error(`pagination did not terminate within ${MAX_PAGES} pages`);
  }

  describe('rejections that never reach the database', () => {
    it('rejects a request with no cookie', async () => {
      const findMany = watchTheDatabase();

      const res = await ctx.http().get('/v1/contacts');

      expect(res.status).toBe(401);
      // Rejected in the guard — the service never ran.
      expect(findMany).not.toHaveBeenCalled();
    });

    it('rejects an unknown sort column rather than ignoring it', async () => {
      const findMany = watchTheDatabase();

      const res = await ctx
        .http()
        .get('/v1/contacts?sort=nope')
        .set('Cookie', cookie);

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
      // SPEC: an unrecognised sort is a client error, not a string handed to
      // the query builder.
      expect(findMany).not.toHaveBeenCalled();
    });

    it.each(['0', '201', 'abc'])(
      'rejects limit=%s rather than clamping it',
      async (limit) => {
        const findMany = watchTheDatabase();

        const res = await ctx
          .http()
          .get(`/v1/contacts?limit=${limit}`)
          .set('Cookie', cookie);

        expect(res.status).toBe(400);
        expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
        expect(findMany).not.toHaveBeenCalled();
      },
    );

    it.each([
      // Not "not base64": Buffer.from(x, 'base64url') is lenient and drops
      // invalid characters rather than throwing, so this decodes to nine bytes
      // of garbage and dies at JSON.parse — the same path as the next case.
      ['base64url junk that decodes to nothing useful', '!!!not-a-cursor!!!'],
      ['base64 of something that is not JSON', writeCursorRaw('plain text')],
      ['JSON with no id', writeCursor({ sort: '-createdAt', filters: [] })],
      [
        'JSON with an empty id',
        writeCursor({ id: '', sort: '-createdAt', filters: [] }),
      ],
      [
        'JSON naming a column that cannot be sorted on',
        writeCursor({ id: USER_ID, sort: 'email', filters: [] }),
      ],
      [
        'JSON with no filters at all',
        writeCursor({ id: USER_ID, sort: 'name' }),
      ],
    ])('rejects a cursor that is %s', async (_label, cursorParam) => {
      const findMany = watchTheDatabase();

      const res = await ctx
        .http()
        .get(`/v1/contacts?cursor=${encodeURIComponent(cursorParam)}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
      // A tampered cursor is refused while parsing the query string, so no
      // forged id ever becomes a WHERE clause.
      expect(findMany).not.toHaveBeenCalled();
    });

    it('rejects a cursor issued under a different sort', async () => {
      // Page one was sorted by -createdAt; the client then switches to company
      // and replays the old cursor. Honouring it would page one ordering with
      // another ordering's boundary — rows repeat, rows vanish.
      const findMany = watchTheDatabase();
      const cursorParam = writeCursor({
        id: USER_ID,
        sort: '-createdAt',
        filters: [],
      });

      const res = await ctx
        .http()
        .get(`/v1/contacts?sort=company&cursor=${cursorParam}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(400);
      // The message, not just the code: cursor.ts has a separate branch for a
      // filter mismatch, and asserting only VALIDATION_FAILED would pass if the
      // two were swapped or collapsed into one.
      expect((res.body as ErrorBody).error.details).toEqual([
        { field: 'cursor', message: 'cursor was issued for a different sort' },
      ]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('rejects a cursor issued under a different filter', async () => {
      // Same failure as the sort mismatch, one branch over: page one was
      // filtered to status=active and the client dropped the filter mid-page.
      // The anchor names a position in a result set this request does not have.
      const findMany = watchTheDatabase();
      const cursorParam = writeCursor({
        id: USER_ID,
        sort: '-createdAt',
        filters: [{ column: 'status', value: 'active' }],
      });

      const res = await ctx
        .http()
        .get(`/v1/contacts?cursor=${cursorParam}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(400);
      // The other branch of the same check — see the sort mismatch above.
      expect((res.body as ErrorBody).error.details).toEqual([
        {
          field: 'cursor',
          message: 'cursor was issued for a different filter',
        },
      ]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('rejects a query parameter the DTO does not declare', async () => {
      // `forbidNonWhitelisted` in VALIDATION_PIPE_OPTIONS, one of the main.ts
      // globals app.fixture mirrors. Nothing else in the suite exercises it:
      // the test that used to carry this name sent `?sort=nope`, which is a bad
      // value for a parameter the DTO does declare, and is the test above.
      const findMany = watchTheDatabase();

      const res = await ctx
        .http()
        .get('/v1/contacts?bogus=1')
        .set('Cookie', cookie);

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('the response envelope', () => {
    it('returns every column the DTO declares, serialised', async () => {
      // The one fully-spelled row in the file. Everything else takes builder
      // defaults; this test is about the contract, so it states the contract.
      await seedContacts([
        aContact({
          id: '00000000-0000-4000-8000-0000000000a2',
          email: 'second@test.com',
          name: 'Second Contact',
          company: 'Acme',
          jobTitle: 'CTO',
          phone: '+15550002',
          status: 'active',
          createdAt: new Date('2026-09-08T10:00:00.000Z'),
          updatedAt: new Date('2026-09-08T11:00:00.000Z'),
        }),
      ]);

      const res = await ctx.http().get('/v1/contacts').set('Cookie', cookie);

      expect(res.status).toBe(200);
      // Hand-written, not built by calling toContactResponseDto — asserting the
      // mapper against itself would pass no matter what the mapper does. The
      // two timestamps are the point: Date in the row, ISO-8601 string out.
      expect(res.body).toEqual({
        items: [
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
        ],
        nextCursor: null,
      });
    });

    it('returns no column the DTO does not declare', async () => {
      // The mocked version of this test bolted a stray `userId` onto the row to
      // watch the mapper drop it. Against the real table that is unbuildable —
      // Contact has no such column. What is left is the assertion that actually
      // guards the contract going forward: the exact key set. Add a column to
      // schema.prisma and let the mapper spread the row, and this fails.
      await seedContacts([aContact()]);

      const res = await ctx.http().get('/v1/contacts').set('Cookie', cookie);

      expect(res.status).toBe(200);
      const [item] = (res.body as { items: Record<string, unknown>[] }).items;
      expect(Object.keys(item).sort()).toEqual([...DTO_FIELDS].sort());
    });

    it('answers an empty table with 200 and an empty list', async () => {
      const res = await ctx.http().get('/v1/contacts').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });
  });

  describe('ordering and paging', () => {
    it('returns rows newest first by default', async () => {
      // aContact stamps each row one second after the last, so build order is
      // oldest-first and the default -createdAt page is its exact reverse.
      // Discriminating: an unordered SELECT tends to come back in INSERT order,
      // which is this list backwards.
      const [oldest, middle, newest] = await seedContacts([
        aContact(),
        aContact(),
        aContact(),
      ]);

      const res = await ctx.http().get('/v1/contacts').set('Cookie', cookie);

      const { items } = res.body as PageBody;
      expect(items.map((item) => item.id)).toEqual([
        newest.id,
        middle.id,
        oldest.id,
      ]);
    });

    it('withholds the extra row and points the cursor at it', async () => {
      const [oldest, middle, newest] = await seedContacts([
        aContact(),
        aContact(),
        aContact(),
      ]);

      const res = await ctx
        .http()
        .get('/v1/contacts?limit=2')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      const body = res.body as { items: { id: string }[]; nextCursor: string };
      // The third row is absent from the page...
      expect(body.items.map((item) => item.id)).toEqual([newest.id, middle.id]);
      // ...and is exactly what the cursor names, so page two opens on it and no
      // contact falls through the boundary.
      expect(readCursor(body.nextCursor)).toEqual({
        id: oldest.id,
        sort: '-createdAt',
        filters: [],
      });
    });

    it('returns no cursor when the page is full and nothing follows', async () => {
      // Two rows for a limit of two: the boundary where a naive
      // `length === limit` check invents a page that does not exist.
      await seedContacts([aContact(), aContact()]);

      const res = await ctx
        .http()
        .get('/v1/contacts?limit=2')
        .set('Cookie', cookie);

      const body = res.body as PageBody;
      expect(body.items).toHaveLength(2);
      expect(body.nextCursor).toBeNull();
    });

    it('defaults to a page of fifty and probes for a fifty-first', async () => {
      const rows = await seedContacts(
        Array.from({ length: 51 }, () => aContact()),
      );

      const res = await ctx.http().get('/v1/contacts').set('Cookie', cookie);

      expect(res.status).toBe(200);
      const body = res.body as { items: { id: string }[]; nextCursor: string };
      expect(body.items).toHaveLength(50);
      // rows[0] is the oldest, so under -createdAt it is the 51st and last.
      // Fetched to answer "is there more?", never returned, named by the cursor.
      expect(body.items.map((item) => item.id)).not.toContain(rows[0].id);
      expect(readCursor(body.nextCursor)).toEqual({
        id: rows[0].id,
        sort: '-createdAt',
        filters: [],
      });
    });

    it('opens page two on the row the cursor names', async () => {
      const [oldest, middle, newest] = await seedContacts([
        aContact(),
        aContact(),
        aContact(),
      ]);

      const { ids, pages } = await pageThrough('/v1/contacts?limit=2');

      // No row skipped at the seam. Prisma's cursor is inclusive — it names the
      // FIRST row of this page, not the last of the previous one — so the
      // `skip: 1` this code deliberately does not have would have swallowed
      // `oldest` entirely, and only a real second request can show that.
      expect(ids).toEqual([newest.id, middle.id, oldest.id]);
      expect(pages).toBe(2);
    });

    it('carries the requested sort in the cursor, not the default', async () => {
      // Companies ascend with build order, so -createdAt and company are exact
      // opposites here: under the default the cursor would name `a`.
      const [a, b, c] = await seedContacts([
        aContact({ company: 'a-company' }),
        aContact({ company: 'b-company' }),
        aContact({ company: 'c-company' }),
      ]);

      const res = await ctx
        .http()
        .get('/v1/contacts?limit=2&sort=company')
        .set('Cookie', cookie);

      const body = res.body as { items: { id: string }[]; nextCursor: string };
      expect(body.items.map((item) => item.id)).toEqual([a.id, b.id]);
      expect(readCursor(body.nextCursor)).toEqual({
        id: c.id,
        sort: 'company',
        filters: [],
      });
    });

    // SPEC test #5, and the reason this file needed a real database: a mock
    // returns whatever it was told to, so it can neither produce nor detect a
    // row that falls through a page boundary.
    it('pages a shared company, returning every row exactly once', async () => {
      // Nine rows, seven of them ambiguous under `company` alone. Without the
      // `id` tiebreaker in toOrderBy, Postgres is free to order those seven
      // differently on each of the five requests, and rows repeat or vanish.
      const shared = Array.from({ length: 7 }, () =>
        aContact({ company: 'Acme' }),
      );
      const trailing = Array.from({ length: 2 }, () =>
        aContact({ company: 'Zenith' }),
      );
      const rows = await seedContacts([...shared, ...trailing]);

      const { ids, pages } = await pageThrough(
        '/v1/contacts?limit=2&sort=company',
      );

      // Exactly once: no duplicate, and nothing left behind.
      expect(ids).toHaveLength(rows.length);
      expect(new Set(ids).size).toBe(rows.length);
      expect([...ids].sort()).toEqual(rows.map((row) => row.id).sort());
      // 9 rows at 2 per page. Proves it really paged rather than returning the
      // lot in one response and trivially satisfying the assertions above.
      expect(pages).toBe(5);
      // The Acme block is contiguous and precedes Zenith, so the ordering
      // survived the four cursor hand-offs rather than merely being a permutation.
      expect(ids.slice(0, 7).sort()).toEqual(
        shared.map((row) => row.id).sort(),
      );
    });
  });

  describe('filtering', () => {
    it('filters by status in the database, not by trimming the page', async () => {
      // The layout is the whole test: the three NEWEST rows are all `lead`.
      // A service that fetched `limit + 1` rows unfiltered and filtered them in
      // application code would fetch those three plus `a3`, drop `a3` as the
      // probe row, filter what was left, and answer with an empty page. SPEC:
      // "Filtering and sorting happen in the database, never by trimming a page
      // in application code."
      const [a1, a2, a3] = await seedContacts([
        aContact({ status: 'active' }),
        aContact({ status: 'active' }),
        aContact({ status: 'active' }),
        aContact({ status: 'lead' }),
        aContact({ status: 'lead' }),
        aContact({ status: 'lead' }),
      ]);

      // Upper case on purpose, but note what that does and does not prove:
      // parseFilters lower-cases every filter value, so the REQUEST side arrives
      // lower case. The stored side is lower case only because this test seeds
      // it that way — an import that wrote 'Active' would still need the
      // clause's `mode: 'insensitive'`. The test below is what holds that down.
      const res = await ctx
        .http()
        .get('/v1/contacts?status=ACTIVE&limit=3')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      // All three active rows, newest first, and no cursor: only three rows
      // match, so the probe row comes back empty even though the table holds six.
      expect(res.body).toMatchObject({ nextCursor: null });
      const { items } = res.body as PageBody;
      expect(items.map((item) => item.id)).toEqual([a3.id, a2.id, a1.id]);
    });

    it('matches a company whose stored casing differs from the request', async () => {
      // `company` has no DTO Transform, but parseFilters lower-cases every
      // filter value — so an exact-case comparison could never match a stored
      // 'Acme' at all, whatever the client typed. `mode: 'insensitive'` is the
      // only reason this route's company filter works, and this is where it
      // is pinned.
      const [acme] = await seedContacts([
        aContact({ company: 'Acme' }),
        aContact({ company: 'Globex' }),
      ]);

      const res = await ctx
        .http()
        .get('/v1/contacts?company=ACME')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      const { items } = res.body as PageBody;
      expect(items.map((item) => item.id)).toEqual([acme.id]);
    });

    it('matches part of a company name', async () => {
      // A search box, not a lookup: typing `cme` finds Acme.
      const [acme] = await seedContacts([
        aContact({ company: 'Acme' }),
        aContact({ company: 'Globex' }),
      ]);

      const res = await ctx
        .http()
        .get('/v1/contacts?company=cme')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      const { items } = res.body as PageBody;
      expect(items.map((item) => item.id)).toEqual([acme.id]);
    });

    it('searches any status text, not just a fixed list', async () => {
      // Status comes straight from the imported CSV, so it can be anything.
      // A fixed allow-list would answer 400 for a value that is really stored.
      const [churned] = await seedContacts([
        aContact({ status: 'Churned 2024' }),
        aContact({ status: 'active' }),
      ]);

      const res = await ctx
        .http()
        .get('/v1/contacts?status=churn')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      const { items } = res.body as PageBody;
      expect(items.map((item) => item.id)).toEqual([churned.id]);
    });

    it('treats a percent sign in a filter value as a character, not a wildcard', async () => {
      // `mode: 'insensitive'` makes Prisma emit ILIKE, so an unescaped `%` here
      // would match every row in the table and hand the client the whole list
      // in response to a filter that matches nothing.
      await seedContacts([
        aContact({ company: 'Acme' }),
        aContact({ company: 'Globex' }),
      ]);

      const res = await ctx
        .http()
        .get('/v1/contacts?company=%25')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it('applies the filter on page two as well as page one', async () => {
      // Build order is oldest-first, and the layout is load-bearing. A `lead`
      // row sits between page one's two rows, and — the part that gives this
      // test teeth — another sits AFTER the row the page-one cursor names.
      // Without that second one, the cursor alone would exclude every `lead`
      // from page two and the WHERE clause could be dropped from any cursored
      // request with the suite staying green.
      const [, first, , second, third] = await seedContacts([
        aContact({ status: 'lead' }), //   sorts after the page-two anchor
        aContact({ status: 'active' }), // `first` — the page-two anchor
        aContact({ status: 'lead' }), //   sorts between page one's two rows
        aContact({ status: 'active' }), // `second`
        aContact({ status: 'active' }), // `third` — newest
      ]);

      const { ids, pages } = await pageThrough(
        '/v1/contacts?limit=2&status=active',
      );

      // Note what carries the filter: the query string, re-sent on every
      // request. The cursor only CARRIES the filters so the next request can be
      // checked against them (cursor.ts: the decoded filters "never build a
      // where clause") — that round-trip is pinned by the mismatch test above.
      expect(ids).toEqual([third.id, second.id, first.id]);
      expect(pages).toBe(2);
    });
  });
});
