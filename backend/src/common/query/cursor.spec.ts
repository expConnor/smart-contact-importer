import { Buffer } from 'buffer';
import { AppError } from '../errors/app.error';
import { catchAppError, fieldErrors } from '../../test/app-error.fixture';
import {
  assertCursorMatches,
  decodeCursor,
  encodeCursor,
  toPageAnchor,
  type Cursor,
} from './cursor';
import type { FilterSpec } from './filter';
import type { SortSpec } from './sort';

const SORT_COLS = ['createdAt', 'name'] as const;
const FILTER_COLS = ['status', 'company'] as const;
type SortCol = (typeof SORT_COLS)[number];
type FilterCol = (typeof FILTER_COLS)[number];

const FILTERS: FilterSpec<FilterCol> = [{ column: 'company', value: 'acme' }];

const CURSOR: Cursor<SortCol, FilterCol> = {
  id: 'row-1',
  sort: '-createdAt',
  filters: FILTERS,
};

const decode = (raw: string) =>
  decodeCursor<SortCol, FilterCol>(raw, SORT_COLS, FILTER_COLS);

/**
 * Encodes a payload the real encoder would refuse to build. encodeCursor only
 * accepts a well-typed Cursor, so every tampering test below needs this to get
 * a hostile shape past the type system and into the decoder — which is exactly
 * the position an attacker with a base64 encoder is in.
 */
function forge(payload: Record<string, unknown> | unknown[]): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Takes the JSON *text*, not a value to stringify. `forge('null')` would encode
 * the string "null" — JSON.stringify quotes it — and silently become a second
 * copy of the bare-string case rather than the JSON-null case it reads as.
 */
function forgeJson(json: string): string {
  return Buffer.from(json, 'utf8').toString('base64url');
}

const rejected = (raw: string): AppError => catchAppError(() => decode(raw));

describe('encodeCursor', () => {
  it('round-trips a cursor through decodeCursor', () => {
    expect(decode(encodeCursor(CURSOR))).toEqual(CURSOR);
  });

  // base64url, not base64. The token is handed back in a JSON body and sent
  // again as ?cursor=..., so a `+` would arrive as a space and a `/` or `=`
  // would have to be percent-encoded by every client. It takes both payloads to
  // cover all three characters: the wildcard one forces `+` and `/` into
  // standard base64 but lands on a 3-byte boundary, so CURSOR is the only one
  // of the two that would carry `=` padding.
  it.each([
    ['a payload whose standard base64 uses + and /', '~~~??>'],
    ['a payload whose standard base64 would be padded', 'acme'],
  ])('emits a token that is safe in a query string: %s', (_name, value) => {
    const token = encodeCursor<SortCol, FilterCol>({
      ...CURSOR,
      filters: [{ column: 'company', value }],
    });

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('round-trips a value whose encoding needs the url alphabet', () => {
    const cursor: Cursor<SortCol, FilterCol> = {
      ...CURSOR,
      filters: [{ column: 'company', value: '~~~??>' }],
    };

    expect(decode(encodeCursor(cursor))).toEqual(cursor);
  });

  it('round-trips an empty filter spec', () => {
    const cursor: Cursor<SortCol, FilterCol> = { ...CURSOR, filters: [] };

    expect(decode(encodeCursor(cursor))).toEqual(cursor);
  });
});

describe('decodeCursor rejects a tampered token', () => {
  // Every rejection below is the same 400 with the same field and message. A
  // cursor is opaque to the client, so telling it *which* part it corrupted
  // would only describe the internals it is not supposed to know.
  const expectCursorRejection = (raw: string): void => {
    const error = rejected(raw);

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.getStatus()).toBe(400);
    expect(fieldErrors(error)).toEqual([
      { field: 'cursor', message: 'cursor is not a valid pagination cursor' },
    ]);
  };

  // Buffer.from(x, 'base64url') is lenient: it drops characters outside the
  // alphabet rather than throwing, so '!!!!' and '' both decode to zero bytes
  // and die in JSON.parse. There is no "rejected by the alphabet" case to test.
  it.each([
    ['decodes to no bytes at all', '!!!!'],
    ['decodes to bytes that are not JSON', 'not-a-cursor'],
    ['is empty', ''],
  ])('a token that %s', (_name, raw) => {
    expectCursorRejection(raw);
  });

  // JSON null is the one that matters: without the null guard in isCursor the
  // destructure below it throws a TypeError, which the filter reports as a 500
  // rather than a 400 — a forged token turning into a server error.
  it.each([
    ['null', forgeJson('null')],
    ['a bare string', forgeJson('"row-1"')],
    ['a number', forgeJson('42')],
    ['an array', forgeJson('[]')],
  ])('valid JSON that is not a cursor object: %s', (_name, raw) => {
    expectCursorRejection(raw);
  });

  it.each([
    ['no id', { sort: '-createdAt', filters: FILTERS }],
    ['an empty id', { id: '', sort: '-createdAt', filters: FILTERS }],
    ['a numeric id', { id: 7, sort: '-createdAt', filters: FILTERS }],
    ['no sort', { id: 'row-1', filters: FILTERS }],
    ['no filters', { id: 'row-1', sort: '-createdAt' }],
    [
      'filters that are not an array',
      { id: 'row-1', sort: '-createdAt', filters: {} },
    ],
  ])('a payload with %s', (_name, payload) => {
    expectCursorRejection(forge(payload));
  });

  // The sort in a cursor reaches toOrderBy, which spreads it into a Prisma
  // orderBy key. It is the one decoded field that names a column, so this is
  // the check that keeps a forged token from ordering by a column the API
  // never exposes — or by one that does not exist, which is a 500.
  it.each([
    'passwordHash',
    '-passwordHash',
    'nope',
    '--createdAt',
    'CREATEDAT',
    '',
  ])('a sort of %j, which is not in the column list', (sort) => {
    expectCursorRejection(forge({ id: 'row-1', sort, filters: FILTERS }));
  });

  it.each([
    ['an unknown column', [{ column: 'passwordHash', value: 'x' }]],
    ['an empty value', [{ column: 'company', value: '' }]],
    ['a non-string value', [{ column: 'company', value: 7 }]],
    ['no column', [{ value: 'acme' }]],
    ['null in place of a filter', [null]],
  ])('a filter with %s', (_name, filters) => {
    expectCursorRejection(forge({ id: 'row-1', sort: '-createdAt', filters }));
  });

  // A token carrying extra keys is still accepted, and the three fields the
  // decoder contracts to return are the ones it was built from — the forged
  // `userId` and `limit` do not displace them. That is the assertion that has
  // to hold however the decoder is written.
  it('accepts a token with extra keys and returns the fields it contracts to', () => {
    const decoded = decode(
      forge({ ...CURSOR, userId: 'someone-else', limit: 10_000 }),
    );

    expect(decoded).toMatchObject(CURSOR);
  });

  // Current behaviour, not a requirement: isCursor is a structural check and
  // returns the parsed payload as it stands, so the extra keys survive. Safe
  // only because there are exactly three readers of a decoded cursor —
  // toPageAnchor takes `id` (cursor.ts:113), assertCursorMatches takes
  // `filters` and `sort` (:126, :130). Rebuilding a clean object in
  // decodeCursor would be strictly safer and would fail this line: if you are
  // that implementer, delete this test rather than the tightening.
  it('does not currently strip unrecognised keys', () => {
    const decoded = decode(forge({ ...CURSOR, userId: 'someone-else' }));

    expect(Object.keys(decoded)).toContain('userId');
  });
});

describe('toPageAnchor', () => {
  // undefined, not null: Prisma reads an absent `cursor` as "start at the
  // beginning" and rejects an explicit null.
  it('is undefined for the first page', () => {
    expect(toPageAnchor<SortCol, FilterCol>(null)).toBeUndefined();
  });

  // No `skip`, and the anchor row is inclusive — the caller withholds the
  // probe row so the anchor is the first row of this page.
  it('names only the row id', () => {
    expect(toPageAnchor(CURSOR)).toEqual({ id: 'row-1' });
  });
});

describe('assertCursorMatches', () => {
  const SORT: SortSpec<SortCol> = { column: 'createdAt', direction: 'desc' };

  it('accepts a first page, which has no cursor to contradict', () => {
    expect(() =>
      assertCursorMatches<SortCol, FilterCol>(null, SORT, FILTERS),
    ).not.toThrow();
  });

  it('accepts a cursor issued for this sort and these filters', () => {
    expect(() => assertCursorMatches(CURSOR, SORT, [...FILTERS])).not.toThrow();
  });

  it('rejects a cursor issued for a different sort', () => {
    const error = catchAppError(() =>
      assertCursorMatches(CURSOR, { column: 'name', direction: 'asc' }, [
        ...FILTERS,
      ]),
    );

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(fieldErrors(error)).toEqual([
      { field: 'cursor', message: 'cursor was issued for a different sort' },
    ]);
  });

  // Same column, opposite direction. The rows are the same set in the reverse
  // order, so re-anchoring would silently hand the client the page it already
  // read instead of the next one.
  it('rejects a cursor issued for the opposite direction', () => {
    const error = catchAppError(() =>
      assertCursorMatches(CURSOR, { column: 'createdAt', direction: 'asc' }, [
        ...FILTERS,
      ]),
    );

    expect(fieldErrors(error)[0].message).toBe(
      'cursor was issued for a different sort',
    );
  });

  it.each([
    ['a filter was added', [...FILTERS, { column: 'status', value: 'active' }]],
    ['the filter was dropped', []],
    ['the filter value changed', [{ column: 'company', value: 'globex' }]],
  ])('rejects a cursor when %s', (_name, filters) => {
    const error = catchAppError(() =>
      assertCursorMatches(CURSOR, SORT, filters as FilterSpec<FilterCol>),
    );

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(fieldErrors(error)).toEqual([
      { field: 'cursor', message: 'cursor was issued for a different filter' },
    ]);
  });

  // Filters are checked first, so a request that changed both gets the filter
  // message. Pinned because the message is the only thing distinguishing these
  // two 400s to a client, and swapping the two ifs is an invisible refactor.
  it('reports the filter mismatch when the sort changed too', () => {
    const error = catchAppError(() =>
      assertCursorMatches(CURSOR, { column: 'name', direction: 'asc' }, []),
    );

    expect(fieldErrors(error)[0].message).toBe(
      'cursor was issued for a different filter',
    );
  });
});
